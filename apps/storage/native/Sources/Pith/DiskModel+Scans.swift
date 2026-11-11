import AppKit
import PithCore

/// One-time scans: a folder the person chose, one the live map can't show, or another disk, scanned once, then caught
/// up with the folders FSEvents saw change, and kept to compare with the next scan of the same folder.
extension DiskModel {
    func chooseFolder() {
        let picker = NSOpenPanel()
        picker.canChooseDirectories = true; picker.canChooseFiles = false
        picker.allowsMultipleSelection = false; picker.prompt = live == nil ? "Scan Folder" : "Show Folder"
        if picker.runModal() == .OK, let root = picker.url { scan(root) }
    }

    /// Shows `root`: from the live map when the map holds it, or scanned.
    func scan(_ root: URL) {
        guard !isTrashing, !isScanning else { return }
        let root = root.standardizedFileURL.resolvingSymlinksInPath()
        if let live, live.state != .off, !Self.failed(live.state), LivePlan.holds(root.path, mapOf: live.root) {
            showLive(root.path)
            return
        }
        scanOnce(root)
    }

    /// The live map couldn't show the folder asked for: one it lacks, such as a folder inside one it couldn't read,
    /// is scanned instead. The scan's map answers the person, and shows at once, only when the tree it replaces was the
    /// person's own ask, a folder they opened or Check Again; a refresh's waits for the hold like any refresh.
    func liveTreeFailed(_ reason: String, request: Int) {
        guard let live, let path = liveView else { return }
        let persons = treeAsks.failed(request: request)
        if path == live.root {
            problem = DiskProblem(message: reason)
        } else {
            scanOnce(URL(fileURLWithPath: path), answersPerson: persons)
        }
    }

    /// Scans `root` once. The current map stays until the new one arrives, so a cancelled or failed scan leaves it. Its
    /// map answers the person's own action unless `answersPerson` says otherwise, as for a scan a refresh fell back on.
    private func scanOnce(_ root: URL, answersPerson: Bool = true) {
        liveView = nil
        sideColumn.mapIsntLive()
        operation?.cancel()
        let id = UUID(); generation = id
        problem = nil; note = nil; progress = nil; isScanning = true; rescanning = nil
        let shown = scope
        scope = root.path
        // Watching from before the scan begins catches what changes while it runs.
        let since = DiskWatcher.currentEventID, began = Date()
        operation = Task {
            defer { if generation == id { isScanning = false } }
            await runner.cancel()
            do {
                let value = try await runner.scan(binary: binary, root: root) { [weak self] event in
                    await self?.record(event, generation: id)
                }
                guard !Task.isCancelled, generation == id else { return }
                // All the volume's figures, measured afresh for a new scan, go out with it. The scan has finished, so a
                // Cancel that comes while they're measured is too late for it.
                let figures = await self.figures(for: value.root.path, full: true)
                guard generation == id else { return }
                select([])
                // The page opens a map of another folder at its root; a new scan of the same one stays where it was.
                if result?.root.path != value.root.path { mapStartsOver() }
                volumeUse = figures
                result = value; scannedAt = Date(); scanBegan = began; edited = false; trashed = nil
                compareWithLastScan(value)
                // The person asked for this scan: a folder they chose or opened, Refresh, or Scan Again, or the tree it
                // stands in for.
                mapAnswersPerson = answersPerson
                revision = UUID()
                changes = DiskChanges()
                watch(root.path, since: since)
            } catch {
                guard generation == id else { return }
                // The map still shows the earlier scan, so the scope goes back to it.
                if result != nil { scope = shown }
                if Task.isCancelled { note = result == nil ? "Scan cancelled." : nil }
                else { problem = Self.problem(error); if result == nil { note = "The scan didn’t finish." } }
            }
        }
    }

    private static func failed(_ state: LiveMap.State) -> Bool {
        if case .failed = state { return true }
        return false
    }

    /// Scans one folder of a scanned map again and puts the result in its place; in the live map, lists it again.
    func rescan(_ folder: String) {
        if liveView != nil { checkAgain(folder); return }
        rescan([folder])
    }

    /// Catches a scanned map up with what changed since its scan: scans the changed folders again, or the whole
    /// folder when FSEvents lost track or too many changed.
    func refresh() {
        guard liveView == nil, let result, !changes.isEmpty else { return }
        if let targets = changes.refreshTargets(in: result) { rescan(targets) } else { scan(URL(fileURLWithPath: result.root.path)) }
    }

    /// Scans folders of the map again, one after another, and puts each result in its place.
    private func rescan(_ folders: [String]) {
        guard let result, !isTrashing, !isScanning else { return }
        if folders.contains(result.root.path) { scan(URL(fileURLWithPath: result.root.path)); return }
        let folders = folders.filter { result.item(at: $0)?.kind == .dir }
        guard !folders.isEmpty else { return }
        operation?.cancel()
        let id = UUID(); generation = id
        problem = nil; progress = nil; isScanning = true
        operation = Task {
            defer { if generation == id { isScanning = false; rescanning = nil } }
            await runner.cancel()
            for folder in folders {
                guard !Task.isCancelled, generation == id else { return }
                rescanning = folder; progress = nil
                // Cleared before the scan, so a change while it runs marks the folder again; a failed scan puts them back.
                let earlier = changes
                changes.clear(inside: folder)
                do {
                    let map = URL(fileURLWithPath: result.root.path)
                    let fresh = try await runner.scan(binary: binary, root: URL(fileURLWithPath: folder), within: map) { [weak self] event in
                        await self?.record(event, generation: id)
                    }
                    // The volume's space, measured again, goes out with the map the folder joins: what changed there outside
                    // Pith is on both.
                    let figures = await self.figures(for: result.root.path)
                    guard !Task.isCancelled, generation == id, let current = self.result, let merged = current.replacing(folder, with: fresh) else {
                        changes.merge(earlier)
                        return
                    }
                    // Refresh or Scan Again, which the person asked for.
                    volumeUse = figures
                    self.result = merged; edited = true; trashed = nil; mapAnswersPerson = true; revision = UUID()
                    keepSelection()
                } catch {
                    changes.merge(earlier)
                    guard generation == id, !Task.isCancelled else { return }
                    problem = Self.problem(error)
                    return
                }
            }
        }
    }

    private func record(_ event: DiskEvent, generation id: UUID) {
        guard generation == id, isScanning else { return }
        if case .progress(let files, let size, let errors) = event {
            progress = DiskProgress(files: files, bytes: size, errors: errors)
        }
    }

    func cancel() {
        operation?.cancel()
        // Keep the operation busy until its subprocess and pipes have drained.
        runner.cancelImmediately()
    }

    /// Follows FSEvents for a scanned map's folder from `since`, noting which folders change.
    private func watch(_ root: String, since: UInt64) {
        watcher?.stop()
        watcher = DiskWatcher(root: root, since: since) { [weak self] events in
            guard let self, self.liveView == nil, self.result?.root.path == root else { return }
            for event in events { self.changes.note(event.path, flags: event.flags, root: root) }
        }
    }

    /// A scanner failure in plain words. The scanner's own messages are already sentences; system errors aren't.
    static func problem(_ error: Error) -> DiskProblem {
        let failure = error as? DiskFailure
        if let failure, failure.needsDiskAccess { return DiskProblem(message: failure.message, offersDiskAccess: true) }
        let text = failure?.message ?? error.localizedDescription
        if text.contains("Operation not permitted") || text.contains("os error 1)") {
            return DiskProblem(message: "macOS didn’t let Pith read this folder. Give Pith Full Disk Access, then scan again.", offersDiskAccess: true)
        }
        if text.contains("Permission denied") || text.contains("os error 13)") {
            return DiskProblem(message: "This folder’s permissions don’t let you read it, so Pith can’t scan it.")
        }
        return DiskProblem(message: text)
    }
}
