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

/// A volume Pith can scan, for the disk menu and the list shown when the live map can't run.
struct DiskVolumeChoice: Identifiable, Equatable {
    let url: URL
    let name: String
    let total: UInt64?
    let available: UInt64?
    let isStartup: Bool
    var id: URL { url }
}

/// What the path bar and the Go menu ask of the map's page (`pithCommand` in native-web/main.tsx), which keeps the
/// open folders and the history Back and Forward go through.
enum MapCommand: Equatable {
    /// Opens a folder of the map shown.
    case open(String)
    case back, forward
    /// Opens the open folder's enclosing folder.
    case up
}

@MainActor @Observable final class DiskModel {
    var result: DiskResult? {
        didSet {
            // JSON kept for a map that's changed since is a stale picture of it.
            if !settingLive { resultJSON = nil }
            icons.map = result?.root
        }
    }
    /// The live map's own JSON of `result`, while `result` is just as the live map sent it.
    private(set) var resultJSON: String?
    @ObservationIgnored private var settingLive = false
    /// When a scan made the map; nil while the map is the live one, which says when it was last brought up to date.
    var scannedAt: Date?
    /// True once a scanned map has changed since its scan: an item moved to the Trash, or a folder scanned again.
    private(set) var edited = false
    var selected: String?
    /// The selected item as the map has it.
    private(set) var selectedItem: DiskNode?
    /// What moving the selected item to the Trash would do, or why it can't go.
    private(set) var selectedPlan: Result<TrashPlan, DiskFailure>?
    /// What deleting the selected item frees now, once the scanner has measured it: clones, hard links and snapshots
    /// outside it can keep part of its size.
    private(set) var selectedFrees: DiskFrees?
    private var freesTask: Task<Void, Never>?
    /// A move to the Trash waiting for the user to confirm what it does to a synced item.
    var confirming: TrashPlan?
    /// Where the volume's space went, for a map of a whole volume.
    private(set) var accounting: DiskAccounting?
    private var accountedAt = Date.distantPast
    /// Shows items in Quick Look; the app delegate owns the panel.
    var showQuickLook: (([URL]) -> Void)?
    /// Who wrote to disk since a date, from Activity's history; the app delegate connects it.
    var writers: ((Date) -> DiskWriters)?
    /// Keep the live map between launches, so Pith opens on it and catches up from what FSEvents saw, and a day's
    /// folder sizes, so the map shows what grew. On unless the user turns it off.
    var remembersScans = UserDefaults.standard.object(forKey: Setting.remembersScans.rawValue) as? Bool ?? true {
        didSet {
            UserDefaults.standard.set(remembersScans, for: .remembersScans)
            if !remembersScans { forgetScans() }
            live?.keep(remembersScans ? liveSnapshot : nil)
        }
    }
    /// How much items changed since the baseline, and when that was. The map's comparisons set them, and so does the
    /// smoke test, in memory, since it never reads or writes the person's scans.
    var growth: [String: Int64] = [:]
    var growthSince: Date?
    /// Folders FSEvents says changed since a scanned map's scan began. The live map follows changes itself.
    private(set) var changes = DiskChanges()
    private var watcher: DiskWatcher?
    /// Where kept maps go: the live map, a day's folder sizes, and each scanned folder's sizes, in
    /// ~/Library/Application Support/Pith/Scans. An automated run keeps none in the person's folder, so it has none,
    /// unless the smoke test points it at a folder of its own.
    var scansFolder = Launch.isAutomated
        ? nil : FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?.appendingPathComponent("Pith/Scans")
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
    /// The folder the map is showing, as the page reports it. Nil until the page reports a new map's folder.
    private(set) var openFolder: String? {
        didSet { if openFolder != oldValue, openFolder != nil, liveView != nil { refreshLive() } }
    }
    /// A folder the page went back or forward to that the map's tree leaves out: the live map shows it in detail, so
    /// the next tree holds it.
    @ObservationIgnored private var wantedFolder: String?
    /// Whether the page's Back and Forward have somewhere to go, which the Go menu follows.
    private(set) var canGoBack = false
    private(set) var canGoForward = false
    /// Runs a command of the path bar or the Go menu in the map's page; the page's coordinator connects it.
    @ObservationIgnored var pageCommand: ((MapCommand) -> Void)?
    /// The mounted volumes, for the disk menu, the path bar's names and the list shown when the live map can't run.
    private(set) var choices: [DiskVolumeChoice] = [] {
        didSet { icons.volumes = Set(choices.map(\.url.path)) }
    }
    @ObservationIgnored private var choicesTask: Task<Void, Never>?
    private let runner = ScannerRunner()
    private var operation: Task<Void, Never>?
    private var generation = UUID()
    var binary: URL { Bundle.main.bundleURL.appendingPathComponent("Contents/MacOS/storage-scanner") }

    /// The startup disk's live map.
    private(set) var live: LiveMap?
    /// The folder of the live map the view shows: its root, or a folder in it someone chose. Nil while the view
    /// shows a scan of somewhere else.
    private(set) var liveView: String?
    /// Whether Disk is on screen, where the map refreshes as it changes.
    private var isVisible = false
    private var lastTree = Date.distantPast
    private var treeLater: Task<Void, Never>?

    /// A figure in the caption under the path bar, such as "Files 123,697".
    struct Figure: Hashable {
        let label: String
        let value: String
    }

    /// The caption under the path bar: figures while scanning and for the map it holds, or a message about the map.
    enum Caption: Equatable {
        case message(String)
        case figures([Figure])
    }

    var caption: Caption? {
        if let live, liveView != nil {
            // Ahead of everything else: only the person can bring these folders into the map.
            if live.asking > 0, live.state.isMapped { return .message(Self.asking(live.asking)) }
            switch live.state {
            case .mapping(let progress?):
                return .figures([Figure(label: "Mapped", value: bytes(progress.bytes)), Figure(label: "Files", value: monaspaced(progress.files.formatted()))])
            case .mapping(nil): return .message("Starting the map…")
            case .catchingUp(let waiting) where waiting > 0:
                return .message("Catching up on \(waiting.formatted()) \(waiting == 1 ? "folder" : "folders") that changed while Pith was closed.")
            case .catchingUp: return .message("Catching up on what changed while Pith was closed.")
            // A busy Mac always has a few folders waiting their turn; the count matters only when many are.
            case .live(let waiting) where waiting >= Self.catchingUpCount:
                return .message("Catching up on \(waiting.formatted()) folders that changed.")
            case .live:
                return live.updatedAt.map { .figures([Figure(label: "Up to date", value: monaspaced(scanTime($0)))]) }
            case .failed(let message): return .message(message)
            case .off, .opening, .unmapped: return nil
            }
        }
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

    /// "Today 1:57 PM", "Yesterday 9:02 AM" or "Nov 3, 9:02 AM": a map can be days old, unlike Activity's ten minutes.
    private func scanTime(_ date: Date) -> String {
        let time = date.formatted(date: .omitted, time: .shortened)
        if Calendar.current.isDateInToday(date) { return "Today \(time)" }
        if Calendar.current.isDateInYesterday(date) { return "Yesterday \(time)" }
        return date.formatted(.dateTime.month(.abbreviated).day().hour().minute())
    }

    /// Folders the map couldn't read, so it leaves them out.
    var unreadableFolders: UInt64 { result?.summary.errors ?? 0 }

    /// What to say while macOS asks the person whether Pith may read `folders` folders, which the map lacks until then.
    static func asking(_ folders: Int) -> String {
        "macOS is asking whether Pith may read \(folders.formatted()) \(folders == 1 ? "folder" : "folders"). They join the map once you answer."
    }

    // MARK: The path bar

    /// The folder the path bar shows: the map's open folder, or the folder a scan is mapping.
    var location: String? {
        if isScanning, rescanning == nil { return scope }
        guard let result else { return scope }
        return openFolder.flatMap { DiskChanges.isInside($0, result.root.path) ? $0 : nil } ?? result.root.path
    }

    /// Where `location` is, as the path bar shows it: its disk, by the disk's name, then each folder down to it.
    var folderPath: FolderPath? {
        location.flatMap { FolderPath($0, volumes: volumes) }
    }

    /// The disks the path bar names: those the disk menu lists, and the startup disk even before it lists any.
    private var volumes: [FolderPath.Volume] {
        let listed = choices.map { FolderPath.Volume(path: $0.url.path, name: $0.name) }
        return listed.contains { $0.path == "/" } ? listed : listed + [FolderPath.Volume(path: "/", name: Self.startupDiskName)]
    }

    /// The startup disk's name, such as "Macintosh HD", for the path bar until the disks are listed.
    static let startupDiskName = (try? URL(fileURLWithPath: "/").resourceValues(forKeys: [.volumeLocalizedNameKey]))?.volumeLocalizedName ?? "Startup disk"

    /// Whether the live map runs, so the startup disk shows from it rather than from a scan.
    var liveMapRuns: Bool { live.map { !$0.state.isFailed } ?? false }

    /// Shows `path`, as the path bar's folders and the disk menu's disks ask. The map's page opens a folder of the map
    /// shown; anything else goes as `scan` routes it, to the live map or a scan.
    func show(_ path: String) {
        guard !isTrashing, !isScanning else { return }
        if let result, DiskChanges.isInside(path, result.root.path), let pageCommand {
            pageCommand(.open(path))
        } else {
            scan(URL(fileURLWithPath: path))
        }
    }

    /// The page moved the map: the folder it shows now, one it went back or forward to that the tree leaves out, and
    /// whether its Back and Forward can go anywhere.
    func pageMoved(to folder: String, wanting wanted: String?, canGoBack: Bool, canGoForward: Bool) {
        let refocus = wanted != wantedFolder
        wantedFolder = wanted
        // A new open folder asks for its tree in detail, the wanted folder's when there is one.
        openFolder = folder
        if refocus, wanted != nil, liveView != nil { refreshLive() }
        self.canGoBack = canGoBack
        self.canGoForward = canGoForward
    }

    /// The page opens a map at its root, with nowhere to go back or forward: the page loaded again, or the map is of
    /// another folder now.
    func mapStartsOver() {
        openFolder = nil
        wantedFolder = nil
        canGoBack = false
        canGoForward = false
    }

    // MARK: The live map

    private var liveSnapshot: URL? { scansFolder?.appendingPathComponent("startup-disk.index") }

    /// Folders waiting to be listed again before the caption says it's catching up. Following the development Mac's
    /// whole disk, 0 to 30 were waiting at any moment, each listed within seconds.
    static let catchingUpCount = 100

    /// Starts the live map of `root`, the startup disk unless a test gives a folder of its own, keeping it between
    /// launches as Settings says unless `keep` says otherwise.
    func startLive(root: String = "/", keep: Bool? = nil) {
        guard live == nil else { return }
        let live = LiveMap(root: root)
        live.received = { [weak self] value, json in self?.showLive(value, json: json) }
        live.treeFailed = { [weak self] reason in self?.liveTreeFailed(reason) }
        live.changed = { [weak self] in self?.refreshLive() }
        self.live = live
        liveView = root
        scope = root
        live.start(binary: binary, snapshot: keep ?? remembersScans ? liveSnapshot : nil)
    }

    /// Disk came on screen or left it. On screen, the map refreshes as it changes, and the first map gets made.
    func visibilityChanged(_ visible: Bool) {
        isVisible = visible
        guard visible, let live, liveView != nil else { return }
        live.makeFirstMap()
        refreshLive()
    }

    /// Shows `path` from the live map: the startup disk, or a folder in it.
    func showLive(_ path: String) {
        guard let live else { return }
        operation?.cancel()
        runner.cancelImmediately()
        watcher?.stop(); watcher = nil
        changes = DiskChanges()
        generation = UUID()
        isScanning = false; rescanning = nil; progress = nil
        problem = nil; note = nil; scannedAt = nil; edited = false; trashed = nil
        if result?.root.path != path {
            select(nil)
            result = nil
            mapStartsOver()
            accounting = nil
            revision = UUID()
        }
        liveView = path
        scope = path
        live.makeFirstMap()
        refreshLive(now: true)
    }

    /// Asks the live map for the view's tree, at most every two seconds. A map of the whole startup disk is a few
    /// megabytes of JSON for Pith to decode and the page to lay out, so it doesn't follow every listing.
    private func refreshLive(now: Bool = false) {
        guard let live, let path = liveView, live.state.isMapped, isVisible || result == nil || now else { return }
        guard live.changedSinceTree || result?.root.path != path || openFolderNeedsDetail else { return }
        let wait = 2.0 - Date().timeIntervalSince(lastTree)
        if wait > 0 && !now {
            guard treeLater == nil else { return }
            treeLater = Task { [weak self] in
                try? await Task.sleep(for: .seconds(wait))
                guard let self, !Task.isCancelled else { return }
                self.treeLater = nil
                self.refreshLive()
            }
            return
        }
        treeLater?.cancel(); treeLater = nil
        lastTree = Date()
        live.request(path: path, focus: detailFolder)
        detailAsked = detailFolder
    }

    /// The open folder, or the one the page wants while the tree leaves it out, when it's inside the view: the map
    /// shows it in finer detail.
    private var detailFolder: String? {
        guard let path = liveView, let open = wantedFolder ?? openFolder, open != path, open.hasPrefix(path == "/" ? "/" : path + "/") else { return nil }
        return open
    }
    private var detailAsked: String?
    /// The live map's baseline for what grew, kept rather than read from disk for every map.
    @ObservationIgnored private var baseline: ScanMemory?
    private var openFolderNeedsDetail: Bool { detailFolder != detailAsked }

    private func showLive(_ value: DiskResult, json: String) {
        guard value.root.path == liveView else { return }
        let rootChanged = result?.root.path != value.root.path
        settingLive = true
        result = value
        resultJSON = json
        settingLive = false
        scope = value.root.path
        if rootChanged || Date().timeIntervalSince(accountedAt) > 300 { refreshAccounting() }
        compareWithBaseline(value)
        keepSelection()
        revision = UUID()
    }

    /// The selection, as the newer map has it. What deleting it frees isn't measured again: a busy folder changes with
    /// every map, and measuring again each time would never finish.
    private func keepSelection() {
        guard let path = selected else { return }
        guard let item = result?.item(at: path) else { select(nil); return }
        selectedItem = item
        selectedPlan = trashPlan(path)
    }

    /// The live map's folder sizes against a baseline kept from up to a day before, so the map shows what grew. A day
    /// old, the baseline is replaced by the map as it is then. A map in finer detail around the open folder holds items
    /// the baseline never could, so only items the baseline has are compared, and a baseline is only ever taken from
    /// a map without that detail.
    private func compareWithBaseline(_ value: DiskResult) {
        guard remembersScans, let folder = scansFolder, let live, value.root.path == live.root else { return }
        let file = ScanMemory.file(for: value.root.path, in: folder)
        if baseline?.root != value.root.path {
            baseline = (try? Data(contentsOf: file)).flatMap { try? JSONDecoder().decode(ScanMemory.self, from: $0) }
        }
        if let kept = baseline, kept.comparable(to: value), Date().timeIntervalSince(kept.date) < 24 * 60 * 60 {
            growth = kept.changes(to: value, countingNew: false)
            growthSince = kept.date
            return
        }
        growth = [:]; growthSince = nil
        guard detailAsked == nil else { return }
        let memory = ScanMemory(value, date: Date())
        baseline = memory
        Task.detached(priority: .utility) {
            do {
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                try JSONEncoder().encode(memory).write(to: file, options: [.atomic])
            } catch {
                NSLog("Pith: couldn't keep the day's folder sizes of \(memory.root): \(error.localizedDescription)")
            }
        }
    }

    /// Lists a folder of the live map again, with everything in it, for when it looks off.
    func checkAgain(_ folder: String) {
        live?.relist(folder, deep: true)
    }

    /// Lists the folders the map couldn't read again, as after Full Disk Access is granted.
    func retryUnreadable() {
        live?.retryUnreadable()
    }

    // MARK: Scans

    func chooseFolder() {
        let picker = NSOpenPanel()
        picker.canChooseDirectories = true; picker.canChooseFiles = false
        picker.allowsMultipleSelection = false; picker.prompt = live == nil ? "Scan Folder" : "Show Folder"
        if picker.runModal() == .OK, let root = picker.url { scan(root) }
    }

    /// Lists the volumes again, off the main thread, since a network volume can be slow to answer: when Disk opens,
    /// when a disk is mounted, unmounted or renamed, and when the disk menu opens, for the free space it shows next.
    func refreshChoices() {
        choicesTask?.cancel()
        choicesTask = Task { [weak self] in
            let found = await Task.detached(priority: .userInitiated) { DiskModel.mountedVolumes() }.value
            guard !Task.isCancelled, let self, found != self.choices else { return }
            self.choices = found
        }
    }

    /// The startup disk, then other volumes in Finder's sidebar, each with its capacity.
    nonisolated private static func mountedVolumes() -> [DiskVolumeChoice] {
        let keys: [URLResourceKey] = [.volumeLocalizedNameKey, .volumeTotalCapacityKey, .volumeAvailableCapacityKey, .volumeIsRootFileSystemKey, .volumeIsBrowsableKey]
        let urls = FileManager.default.mountedVolumeURLs(includingResourceValuesForKeys: keys, options: [.skipHiddenVolumes]) ?? []
        return urls.compactMap { url -> DiskVolumeChoice? in
            guard let values = try? url.resourceValues(forKeys: Set(keys)), values.volumeIsBrowsable != false else { return nil }
            let startup = values.volumeIsRootFileSystem == true
            return DiskVolumeChoice(url: startup ? URL(fileURLWithPath: "/") : url, name: values.volumeLocalizedName ?? url.lastPathComponent,
                                    total: values.volumeTotalCapacity.map { UInt64(max(0, $0)) }, available: values.volumeAvailableCapacity.map { UInt64(max(0, $0)) },
                                    isStartup: startup)
        }
        .sorted { $0.isStartup && !$1.isStartup }
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
    /// is scanned instead.
    private func liveTreeFailed(_ reason: String) {
        guard let live, let path = liveView else { return }
        if path == live.root {
            problem = DiskProblem(message: reason)
        } else {
            scanOnce(URL(fileURLWithPath: path))
        }
    }

    /// Scans `root` once. The current map stays until the new one arrives, so a cancelled or failed scan leaves it.
    private func scanOnce(_ root: URL) {
        liveView = nil
        operation?.cancel()
        let id = UUID(); generation = id
        problem = nil; note = nil; progress = nil; isScanning = true; rescanning = nil
        let shown = scope
        scope = root.path
        // Watching from before the scan begins catches what changes while it runs.
        let since = DiskWatcher.currentEventID
        operation = Task {
            defer { if generation == id { isScanning = false } }
            await runner.cancel()
            do {
                let value = try await runner.scan(binary: binary, root: root) { [weak self] event in
                    await self?.record(event, generation: id)
                }
                guard !Task.isCancelled, generation == id else { return }
                select(nil)
                // The page opens a map of another folder at its root; a new scan of the same one stays where it was.
                if result?.root.path != value.root.path { mapStartsOver() }
                result = value; scannedAt = Date(); edited = false; trashed = nil
                compareWithLastScan(value)
                revision = UUID()
                refreshAccounting()
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

    /// Selects a real item from the current map; anything else clears the selection.
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

    /// The icon for an item of the map, by Pith's icon rule (`KnownPlaces.iconKey`).
    func iconKey(for item: DiskNode) -> IconKey {
        Icons.places.iconKey(for: item, asking: macOSMayHoldFolders)
    }

    /// What the map's page may load from Pith's icon route, by the same rule: an item's own icon only for what the map
    /// shows with that key, for the disks the disk menu lists and for the apps the page names under Wrote the most
    /// since. It's given the map, the disks and the apps as they change.
    @ObservationIgnored private lazy var icons = IconPolicy(places: Icons.places)

    /// The icon the page asks for at `url` on Pith's icon route, or nil when it may not have it.
    func iconRequest(for url: URL) -> IconRequest? {
        icons.request(for: url, asking: macOSMayHoldFolders)
    }

    /// Pith's icon rule as the map's page applies it, which goes to the page with the icons' base, so the page gives
    /// each item the key `iconKey(for:)` gives it.
    var iconRule: IconRule { Icons.places.iconRule(asking: macOSMayHoldFolders) }

    /// The apps the page names under Wrote the most since, as native last sent them: the page may load the icons of
    /// their bundles.
    @ObservationIgnored var pageWriters: [DiskWriter] = [] {
        didSet { icons.apps = Set(pageWriters.compactMap(\.bundle)) }
    }

    /// Whether macOS may be holding some of the live map's folders: it's asking about some, or the map is catching up
    /// after a launch, listing again what changed meanwhile and what was waiting on macOS when it was saved.
    private var macOSMayHoldFolders: Bool {
        guard let live, liveView != nil else { return false }
        if case .catchingUp = live.state { return true }
        return live.asking > 0
    }

    /// What moving `path` to the Trash would do, or why it can't go.
    func trashPlan(_ path: String) -> Result<TrashPlan, DiskFailure> {
        guard let result else { return .failure(DiskFailure("Open the map first.")) }
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

    /// Moves the item to the Trash and takes it off the map at once; the live map then follows the move itself.
    /// Undo puts it back.
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
            } else if liveView == nil {
                // The tree didn't hold it (an item inside a group of smaller ones): the next scan reflects it.
                edited = true
            }
            trashed = (trashedURL as URL?).map { TrashedItem(name: plan.name, size: plan.size, original: plan.target, trashed: $0, previous: result) }
            if liveView == nil { edited = true }
            revision = UUID()
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
        guard remembersScans, let folder = scansFolder, let date = scannedAt else { return }
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

    /// Deletes everything kept: the live map, the day's folder sizes and each scanned folder's. A live map Pith
    /// still keeps is saved again at its next save.
    func forgetScans() {
        growth = [:]; growthSince = nil; baseline = nil; revision = UUID()
        guard let folder = scansFolder else { return }
        try? FileManager.default.removeItem(at: folder)
    }

    /// Follows FSEvents for a scanned map's folder from `since`, noting which folders change.
    private func watch(_ root: String, since: UInt64) {
        watcher?.stop()
        watcher = DiskWatcher(root: root, since: since) { [weak self] events in
            guard let self, self.liveView == nil, self.result?.root.path == root else { return }
            for event in events { self.changes.note(event.path, flags: event.flags, root: root) }
        }
    }

    /// Works out where the space went for a map of a whole volume: what's on hidden volumes, what the map couldn't
    /// measure, local snapshots and purgeable space. Off the main thread: `tmutil` takes a moment.
    private func refreshAccounting() {
        guard let result else { accounting = nil; return }
        accountedAt = Date()
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
