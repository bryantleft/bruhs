import AppKit
import Observation
import PithCore

/// Files, bytes and unreadable folders counted so far by a running scan.
struct DiskProgress: Equatable {
    let files: UInt64
    let bytes: UInt64
    let errors: UInt64
}

/// Something that went wrong, said plainly, with the one action that can fix it.
struct DiskProblem: Equatable {
    let message: String
    /// macOS's privacy protection is the cause, so Full Disk Access is the fix.
    var offersDiskAccess = false
}

/// The last item moved to the Trash, while Pith can still put it back.
struct TrashedItem: Equatable {
    let name: String
    let size: UInt64
    let original: URL
    let trashed: URL
    /// The map before the move, which Undo restores exactly.
    let previous: DiskResult

    static func == (lhs: TrashedItem, rhs: TrashedItem) -> Bool { lhs.trashed == rhs.trashed && lhs.original == rhs.original }
}

/// The apps that wrote the most to disk over a stretch, shown beside what grew. macOS doesn't say which app wrote to
/// which folder without administrator access, so this says who was writing then, not who grew a folder.
enum DiskWriters: Equatable {
    case apps([DiskWriter], since: Date)
    /// History isn't kept, so there's no record of who wrote.
    case historyOff
    /// History holds nothing for the stretch.
    case empty
}

struct DiskWriter: Equatable {
    let name: String
    let bytes: UInt64
}

/// A volume Pith can scan, for the list shown before any scan.
struct DiskVolumeChoice: Identifiable, Equatable {
    let url: URL
    let name: String
    let total: UInt64?
    let available: UInt64?
    let isStartup: Bool
    var id: URL { url }
}

@MainActor @Observable final class DiskModel {
    var result: DiskResult?
    var scannedAt: Date?
    /// True once the map has changed since its scan: an item moved to the Trash, or a folder scanned again.
    private(set) var edited = false
    var selected: String?
    /// The selected item as the scan has it.
    private(set) var selectedItem: DiskNode?
    /// What moving the selected item to the Trash would do, or why it can't go.
    private(set) var selectedPlan: Result<TrashPlan, DiskFailure>?
    /// What deleting the selected item frees now, once the scanner has measured it: clones, hard links and snapshots
    /// outside it can keep part of its size.
    private(set) var selectedFrees: DiskFrees?
    private var freesTask: Task<Void, Never>?
    /// A move to the Trash waiting for the user to confirm what it does to a synced item.
    var confirming: TrashPlan?
    /// Where the scanned volume's space went, for a scan of a whole volume.
    private(set) var accounting: DiskAccounting?
    /// Shows items in Quick Look; the app delegate owns the panel.
    var showQuickLook: (([URL]) -> Void)?
    /// Who wrote to disk since a date, from Activity's history; the app delegate connects it.
    var writers: ((Date) -> DiskWriters)?
    /// Keep each scan's folder sizes, so the next scan of the same folder shows what grew, and the last map, so Pith opens
    /// on it at the next launch. On unless the user turns it off.
    var remembersScans = UserDefaults.standard.object(forKey: "remembersScans") as? Bool ?? true {
        didSet {
            UserDefaults.standard.set(remembersScans, forKey: "remembersScans")
            if !remembersScans { forgetScans() }
        }
    }
    /// How much items changed since the last scan of this folder, and when that scan was.
    private(set) var growth: [String: Int64] = [:]
    private(set) var growthSince: Date?
    /// Folders FSEvents says changed since the map's scan began.
    private(set) var changes = DiskChanges()
    private var watcher: DiskWatcher?
    /// FSEvents' position and the volume's identity when the map's scan began, saved with it.
    private var scanStart: (since: UInt64, volume: String?)?
    /// Saves the map for the next launch. The smoke test turns it off, so its fixture never replaces the user's scan.
    var keepsScans = true
    private var restoreAttempted = false
    /// Saves run one at a time, so an older map never lands after a newer one.
    private static let saving = DispatchQueue(label: "app.bruhs.pith.saved-scans", qos: .utility)

    /// ~/Library/Application Support/Pith/Scans.
    static var scansFolder: URL? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?.appendingPathComponent("Pith/Scans")
    }
    var problem: DiskProblem?
    var isScanning = false
    var isTrashing = false
    var revision = UUID()
    /// The folder being scanned, or the one the map shows.
    private(set) var scope: String?
    /// A folder inside the map being scanned again, while that runs.
    private(set) var rescanning: String?
    private(set) var progress: DiskProgress?
    /// How the last scan ended when it didn't produce a map.
    private(set) var note: String?
    private(set) var trashed: TrashedItem?
    /// The folder the map is showing, as the page reports it.
    var openFolder: String?
    /// The volumes listed before a scan.
    private(set) var choices: [DiskVolumeChoice] = []
    private let runner = ScannerRunner()
    private var operation: Task<Void, Never>?
    private var generation = UUID()
    var binary: URL { Bundle.main.bundleURL.appendingPathComponent("Contents/MacOS/storage-scanner") }

    /// A figure under the scope, such as "Files 123,697".
    struct Figure: Hashable {
        let label: String
        let value: String
    }

    /// The line under the scope: figures while scanning and for the map it holds, or a message about the scan.
    enum Caption: Equatable {
        case message(String)
        case figures([Figure])
    }

    var caption: Caption? {
        if isScanning {
            guard let progress else { return .message(rescanning == nil ? "Starting the scan…" : "Scanning \(URL(fileURLWithPath: rescanning ?? "").lastPathComponent) again…") }
            return .figures([Figure(label: "Size", value: bytes(progress.bytes)), Figure(label: "Files", value: monaspaced(progress.files.formatted()))])
        }
        // The bar under the map gives the open folder's or the selection's size, so this line says when the scan was.
        if result != nil, let scannedAt {
            return .figures([Figure(label: edited ? "Scanned, then edited" : "Scanned", value: monaspaced(scanTime(scannedAt)))])
        }
        return note.map { .message($0) }
    }

    /// "Today 1:57 PM", "Yesterday 9:02 AM" or "Nov 3, 9:02 AM": a scan can be days old, unlike Activity's ten minutes.
    private func scanTime(_ date: Date) -> String {
        let time = date.formatted(date: .omitted, time: .shortened)
        if Calendar.current.isDateInToday(date) { return "Today \(time)" }
        if Calendar.current.isDateInYesterday(date) { return "Yesterday \(time)" }
        return date.formatted(.dateTime.month(.abbreviated).day().hour().minute())
    }

    /// Folders the last scan couldn't read, so its map leaves them out.
    var unreadableFolders: UInt64 { result?.summary.errors ?? 0 }

    func chooseFolder() {
        let picker = NSOpenPanel()
        picker.canChooseDirectories = true; picker.canChooseFiles = false
        picker.allowsMultipleSelection = false; picker.prompt = "Scan Folder"
        if picker.runModal() == .OK, let root = picker.url { scan(root) }
    }

    /// The startup disk, then other volumes in Finder's sidebar, each with its capacity.
    func refreshChoices() {
        let keys: [URLResourceKey] = [.volumeLocalizedNameKey, .volumeTotalCapacityKey, .volumeAvailableCapacityKey, .volumeIsRootFileSystemKey, .volumeIsBrowsableKey]
        let urls = FileManager.default.mountedVolumeURLs(includingResourceValuesForKeys: keys, options: [.skipHiddenVolumes]) ?? []
        choices = urls.compactMap { url in
            guard let values = try? url.resourceValues(forKeys: Set(keys)), values.volumeIsBrowsable != false else { return nil }
            let startup = values.volumeIsRootFileSystem == true
            return DiskVolumeChoice(url: startup ? URL(fileURLWithPath: "/") : url, name: values.volumeLocalizedName ?? url.lastPathComponent,
                                    total: values.volumeTotalCapacity.map { UInt64(max(0, $0)) }, available: values.volumeAvailableCapacity.map { UInt64(max(0, $0)) },
                                    isStartup: startup)
        }
        .sorted { $0.isStartup && !$1.isStartup }
    }

    /// Scans `root`. The current map stays until the new one arrives, so a cancelled or failed scan leaves it.
    func scan(_ root: URL) {
        guard !isTrashing, !isScanning else { return }
        operation?.cancel()
        let id = UUID(); generation = id
        problem = nil; note = nil; progress = nil; isScanning = true; rescanning = nil
        let root = root.standardizedFileURL.resolvingSymlinksInPath()
        let shown = scope
        scope = root.path
        // Watching from before the scan begins catches what changes while it runs.
        let start = (since: DiskWatcher.currentEventID, volume: DiskWatcher.volumeUUID(for: root.path))
        operation = Task {
            defer { if generation == id { isScanning = false } }
            await runner.cancel()
            do {
                let value = try await runner.scan(binary: binary, root: root) { [weak self] event in
                    await self?.record(event, generation: id)
                }
                guard !Task.isCancelled, generation == id else { return }
                select(nil)
                result = value; scannedAt = Date(); edited = false; trashed = nil
                compareWithLastScan(value)
                revision = UUID()
                refreshAccounting()
                changes = DiskChanges()
                scanStart = start
                watch(root.path, since: start.since)
                saveScan()
            } catch {
                guard generation == id else { return }
                // The map still shows the earlier scan, so the scope goes back to it.
                if result != nil { scope = shown }
                if Task.isCancelled { note = result == nil ? "Scan cancelled." : nil }
                else { problem = Self.problem(error); if result == nil { note = "The scan didn’t finish." } }
            }
        }
    }

    /// Scans one folder of the map again and puts the result in its place, rather than the whole scan.
    func rescan(_ folder: String) { rescan([folder]) }

    /// Catches the map up with what changed since its scan: scans the changed folders again, or the whole folder when
    /// FSEvents lost track or too many changed.
    func refresh() {
        guard let result, !changes.isEmpty else { return }
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
                    guard !Task.isCancelled, generation == id, let current = self.result, let merged = current.replacing(folder, with: fresh) else {
                        changes.merge(earlier)
                        return
                    }
                    self.result = merged; edited = true; trashed = nil; revision = UUID()
                    select(selected)
                } catch {
                    changes.merge(earlier)
                    guard generation == id, !Task.isCancelled else { return }
                    problem = Self.problem(error)
                    return
                }
            }
            saveScan()
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

    /// Selects a real item from the current scan; anything else clears the selection.
    func select(_ path: String?) {
        freesTask?.cancel()
        selectedFrees = nil
        guard let path, let item = result?.item(at: path) else { selected = nil; selectedItem = nil; selectedPlan = nil; return }
        selected = path
        selectedItem = item
        selectedPlan = trashPlan(path)
        measureFrees(path)
    }

    /// Asks the scanner what deleting `path` frees, after a short pause so arrowing across the map doesn't start a
    /// walk for every item passed. A new selection cancels it.
    private func measureFrees(_ path: String) {
        let binary = binary
        freesTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            do {
                let frees = try await ScannerRunner.frees(binary: binary, paths: [path])
                guard !Task.isCancelled, let self, self.selected == path else { return }
                self.selectedFrees = frees
            } catch {
                guard !Task.isCancelled else { return }
                NSLog("Pith: couldn't measure what deleting \(path) frees: \(error.localizedDescription)")
            }
        }
    }

    /// What moving `path` to the Trash would do, or why it can't go.
    func trashPlan(_ path: String) -> Result<TrashPlan, DiskFailure> {
        guard let result else { return .failure(DiskFailure("Scan a folder first.")) }
        do { return .success(try TrashPolicy.plan(path, result: result, home: FileManager.default.homeDirectoryForCurrentUser)) }
        catch let failure as DiskFailure { return .failure(failure) }
        catch { return .failure(DiskFailure(error.localizedDescription)) }
    }

    /// Moves `path` to the Trash at once, as Finder does, since Undo can put it back. A synced item or Photos library
    /// asks first: the Trash also takes it off the user's other devices or out of Photos.
    func requestTrash(_ path: String, undoManager: UndoManager?) {
        switch trashPlan(path) {
        case .failure(let failure): problem = DiskProblem(message: failure.message)
        case .success(let plan) where !plan.consequences.isEmpty: confirming = plan
        case .success(let plan): trash(plan, undoManager: undoManager)
        }
    }

    /// Moves the item to the Trash and takes it off the map, so nothing waits on a rescan. Undo puts it back.
    func trash(_ plan: TrashPlan, undoManager: UndoManager?) {
        guard let result, !isScanning, !isTrashing else { return }
        isTrashing = true; problem = nil
        defer { isTrashing = false }
        do {
            var trashedURL: NSURL?
            try FileManager.default.trashItem(at: plan.target, resultingItemURL: &trashedURL)
            if selected == plan.target.path { select(nil) }
            if let updated = result.removing(plan.target.path) {
                self.result = updated
            } else {
                // The tree didn't hold it (an item inside a group of smaller ones): the next scan reflects it.
                edited = true
            }
            trashed = (trashedURL as URL?).map { TrashedItem(name: plan.name, size: plan.size, original: plan.target, trashed: $0, previous: result) }
            edited = true; revision = UUID()
            saveScan()
            if trashed != nil {
                undoManager?.registerUndo(withTarget: self) { model in MainActor.assumeIsolated { model.undoTrash() } }
                undoManager?.setActionName("Move to Trash")
            }
        } catch {
            problem = DiskProblem(message: "Pith couldn’t move \(plan.name) to the Trash. \(Self.plain(error))")
        }
    }

    /// Moves the last trashed item back where it was and restores the map from before.
    func undoTrash() {
        guard let item = trashed, !isScanning else { return }
        do {
            try FileManager.default.moveItem(at: item.trashed, to: item.original)
            result = item.previous; trashed = nil; revision = UUID()
            select(item.original.path)
            saveScan()
        } catch {
            problem = DiskProblem(message: "Pith couldn’t put \(item.name) back. Open the Trash in Finder and drag it out instead.")
            trashed = nil
        }
    }

    func dismissTrashNote() { trashed = nil }

    func quickLook(_ path: String?) {
        guard let path = path ?? selected, result?.item(at: path) != nil else { return }
        showQuickLook?([URL(fileURLWithPath: path)])
    }

    func reveal(_ path: String) { NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)]) }

    func copyPath(_ path: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(path, forType: .string)
    }

    /// Compares a finished scan with the last one of the same folder, then keeps this one for next time.
    private func compareWithLastScan(_ value: DiskResult) {
        growth = [:]; growthSince = nil
        guard remembersScans, let folder = Self.scansFolder, let date = scannedAt else { return }
        let file = ScanMemory.file(for: value.root.path, in: folder)
        if let data = try? Data(contentsOf: file), let last = try? JSONDecoder().decode(ScanMemory.self, from: data), last.comparable(to: value) {
            growth = last.changes(to: value)
            growthSince = last.date
        }
        let memory = ScanMemory(value, date: date)
        Task.detached(priority: .utility) {
            do {
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                try JSONEncoder().encode(memory).write(to: file, options: [.atomic])
            } catch {
                NSLog("Pith: couldn't keep the scan of \(memory.root) for comparison: \(error.localizedDescription)")
            }
        }
    }

    /// Deletes every kept scan: folder sizes and saved maps.
    func forgetScans() {
        growth = [:]; growthSince = nil; revision = UUID()
        UserDefaults.standard.removeObject(forKey: "lastScanRoot")
        guard let folder = Self.scansFolder else { return }
        // On the save queue, so a save already queued can't put a map back after this.
        Self.saving.async { try? FileManager.default.removeItem(at: folder) }
    }

    /// Follows FSEvents for the map's folder from `since`, noting which folders change.
    private func watch(_ root: String, since: UInt64) {
        watcher?.stop()
        watcher = DiskWatcher(root: root, since: since) { [weak self] events in
            guard let self, self.result?.root.path == root else { return }
            for event in events { self.changes.note(event.path, flags: event.flags, root: root) }
        }
    }

    /// Keeps the map for the next launch, with FSEvents' position when its scan began.
    private func saveScan() {
        guard keepsScans, remembersScans, let result, let scannedAt, let start = scanStart, let folder = Self.scansFolder else { return }
        let saved = SavedScan(result: result, date: scannedAt, since: start.since, volume: start.volume, edited: edited)
        UserDefaults.standard.set(result.root.path, forKey: "lastScanRoot")
        Self.saving.async {
            do {
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                try JSONEncoder().encode(saved).write(to: SavedScan.file(for: saved.result.root.path, in: folder), options: [.atomic])
            } catch {
                NSLog("Pith: couldn't keep the scan of \(saved.result.root.path) for next time: \(error.localizedDescription)")
            }
        }
    }

    /// Opens on the map saved at an earlier launch, if there is one, and asks FSEvents what changed since its scan began.
    func restoreLastScan() {
        guard !restoreAttempted else { return }
        restoreAttempted = true
        guard keepsScans, remembersScans, result == nil, !isScanning, let folder = Self.scansFolder,
              let root = UserDefaults.standard.string(forKey: "lastScanRoot") else { return }
        let file = SavedScan.file(for: root, in: folder)
        Task {
            let saved = await Task.detached(priority: .userInitiated) { () -> SavedScan? in
                guard let data = try? Data(contentsOf: file) else { return nil }
                return try? JSONDecoder().decode(SavedScan.self, from: data)
            }.value
            // A scan that started meanwhile wins, and a saved map from another scanner version would count differently.
            guard let saved, saved.result.version == DiskResult.version, saved.result.root.path == root,
                  self.result == nil, !self.isScanning, FileManager.default.fileExists(atPath: root) else { return }
            result = saved.result; scannedAt = saved.date; edited = saved.edited; scope = root
            scanStart = (saved.since, saved.volume)
            changes = DiskChanges()
            // Event IDs describe a volume's history only while it's the same volume.
            if saved.volume == nil || saved.volume != DiskWatcher.volumeUUID(for: root) { changes.markEverything() }
            watch(root, since: saved.since)
            revision = UUID()
            refreshAccounting()
        }
    }

    /// Works out where the space went after a scan of a whole volume: what's on hidden volumes, what the walk
    /// couldn't measure, local snapshots and purgeable space. Off the main thread: `tmutil` takes a moment.
    private func refreshAccounting() {
        accounting = nil
        guard let result else { return }
        let root = result.root.path
        Task {
            let value = await Task.detached(priority: .utility) { () -> DiskAccounting? in
                let url = URL(fileURLWithPath: root)
                let keys: Set<URLResourceKey> = [.volumeURLKey, .volumeTotalCapacityKey, .volumeAvailableCapacityKey, .volumeAvailableCapacityForImportantUsageKey]
                guard let values = try? url.resourceValues(forKeys: keys),
                      let walked = DiskAccounting.walkedVolumes(root: root, mountPoint: values.volume?.path),
                      let total = values.volumeTotalCapacity, let available = values.volumeAvailableCapacity else { return nil }
                let volumes = walked.compactMap(VolumeSpace.used)
                guard volumes.count == walked.count else { return nil }
                let important = values.volumeAvailableCapacityForImportantUsage.map { UInt64(max(0, $0)) }
                let purgeable = important.map { $0.saturatingSubtract(UInt64(max(0, available))) }
                return DiskAccounting(used: UInt64(max(0, total - available)), walkedVolumes: volumes, result: result,
                                      snapshots: Self.localSnapshots(root), purgeable: purgeable)
            }.value
            guard self.result?.root.path == root else { return }
            accounting = value
        }
    }

    /// Local Time Machine snapshots on a volume, from `tmutil`, which lists them without administrator access.
    nonisolated private static func localSnapshots(_ volume: String) -> Int? {
        let process = Process(), output = Pipe()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/tmutil")
        process.arguments = ["listlocalsnapshots", volume]
        process.standardOutput = output; process.standardError = FileHandle.nullDevice
        guard (try? process.run()) != nil else { return nil }
        let data = output.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else { return nil }
        return DiskAccounting.snapshotCount(tmutilOutput: String(decoding: data, as: UTF8.self))
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

    private static func plain(_ error: Error) -> String {
        let text = (error as NSError).localizedDescription
        return text.hasSuffix(".") ? text : text + "."
    }
}

/// Monaspace has no narrow no-break space, which the locale puts in times ("1:57 PM") and some locales' thousands. A
/// fallback font would draw it at its own width, so use the font's no-break space instead.
func monaspaced(_ text: String) -> String {
    text.replacingOccurrences(of: "\u{202F}", with: "\u{00A0}")
}
