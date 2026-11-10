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
struct DiskVolumeChoice: Identifiable, Equatable, Sendable {
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
            sideColumn.map = result
            // Every map, the person's own edits among them, is accounted against the volume's own figures at once.
            account()
        }
    }
    /// The live map's own JSON of `result`, while `result` is just as the live map sent it.
    private(set) var resultJSON: String?
    @ObservationIgnored private var settingLive = false
    /// When a scan made the map; nil while the map is the live one, which says when it was last brought up to date.
    var scannedAt: Date?
    /// True once a scanned map has changed since its scan: an item moved to the Trash, or a folder scanned again.
    private(set) var edited = false
    /// The items selected on the map, in the order they were picked, none inside another (`DiskSelection`). Pith keeps
    /// them, and the map's page outlines them.
    private(set) var selection = DiskSelection()
    /// The selected items as the map has them, in that order.
    private(set) var selectedItems: [DiskNode] = []
    /// What moving the selected items to the Trash would do, or why they can't go.
    private(set) var selectedPlan: Result<TrashBatch, DiskFailure>?
    /// What deleting the selected items frees now, from one measurement of them all, once the scanner has made it: clones,
    /// hard links and snapshots outside them can keep part of their size, and those shared among them count once.
    private(set) var selectedFrees: DiskFrees?
    /// How old that figure is: what the items free now, or what they freed when Pith last measured them, before they
    /// changed, while it waits to measure them again or measures them (`FreesAge`).
    private(set) var freesAge: FreesAge?
    @ObservationIgnored private var frees = FreesSchedule()
    private var freesTask: Task<Void, Never>?
    /// A measurement of the same selection held back until the last one's rest ends (`FreesSchedule`), and when.
    @ObservationIgnored private var freesLater: (task: Task<Void, Never>, until: Date)?
    /// A move to the Trash waiting for the person to confirm what it does to a synced item or a Photos library.
    var confirming: TrashBatch?
    /// Where the volume's space went, for a map of a whole volume: the volume's own figures set against the map as it is
    /// now (`account`), so what the map gains or loses, as by Move to Trash and Undo, moves Not measured at once.
    private(set) var accounting: DiskAccounting?
    /// The volume's own figures for the map shown (`figures(for:full:)`), measured before the map went out and set
    /// against it with it.
    @ObservationIgnored private var volumeUse: VolumeFigures? {
        didSet { account() }
    }
    /// Whether "Where the space is" is open: its link opens it, and so does a click on the map's Not measured block.
    var showsWhereTheSpaceIs = false
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
    /// smoke test, in memory, since it never reads or writes the person's scans (`smokeTestShowsGrowth`).
    private(set) var growth: [String: Int64] = [:]
    private(set) var growthSince: Date?

    /// The smoke test's growth, in memory: what grew and since when, which goes to the page with the next revision. Only
    /// the smoke test sets growth from outside.
    func smokeTestShowsGrowth(_ growth: [String: Int64], since: Date?) {
        self.growth = growth
        growthSince = since
        revision = UUID()
    }
    /// Folders FSEvents says changed since a scanned map's scan began. The live map follows changes itself.
    private(set) var changes = DiskChanges()
    private var watcher: DiskWatcher?
    /// Where kept maps go: the live map, a day's folder sizes, and each scanned folder's sizes, in
    /// ~/Library/Application Support/Pith/Scans. An automated run keeps none in the person's folder, so it has none,
    /// unless the smoke test points it at a folder of its own.
    var scansFolder = Launch.isAutomated
        ? nil : FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?.appendingPathComponent("Pith/Scans")
    /// Where an automated run's Move to Trash puts items, since it never touches the person's Trash: a folder the smoke
    /// test gives it, which Undo moves them back from. Without one, an automated run moves nothing to the Trash.
    var trashFolder: URL?
    var problem: DiskProblem?
    var isScanning = false
    var isTrashing = false
    var revision = UUID()
    /// Set when the person's own action changed the map, until the page has that map: moving an item to the Trash,
    /// putting it back, or a scan they asked for, such as Refresh. The page shows it at once, though the pointer or a
    /// click would hold a newer map still. The live map's own refreshes come unmarked, and wait.
    @ObservationIgnored var mapAnswersPerson = false
    /// The folder being scanned, or the one the map shows.
    private(set) var scope: String?
    /// A folder inside the map being scanned again, while that runs.
    private(set) var rescanning: String?
    private(set) var progress: DiskProgress?
    /// How the last scan ended when it didn't produce a map.
    private(set) var note: String?
    /// The latest move to the Trash, while its notice shows: its Undo button undoes it.
    private(set) var trashed: TrashRecord?
    /// Every move to the Trash Undo can still put back, each registered with the window's undo manager on its own, so
    /// each ⌘Z undoes its own move, the latest first, wherever the map is by then.
    @ObservationIgnored private lazy var undos = TrashUndoStack { [weak self] record in self?.undoTrash(record) }
    /// The move to the Trash or Undo under way, which the next waits for, so ⌘Z pressed meanwhile undoes its move once
    /// that one ends rather than being lost. `trashWork` counts the moves, plans and Undos begun and not ended.
    @ObservationIgnored private var trashing: Task<Void, Never>?
    @ObservationIgnored private var trashWork = 0
    /// The folder the map is showing, as the page reports it. Nil until the page reports a new map's folder.
    private(set) var openFolder: String?
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

    /// The smoke test's listing of the volumes, landed as a listing does: figures of its own, fresher than the last.
    func smokeTestListsVolumes(_ volumes: [DiskVolumeChoice]) {
        choices = volumes
    }

    /// Lists the volumes on a queue of its own, one listing at a time, however often they're asked for meanwhile
    /// (`VolumeLister`): a network share that hangs holds that queue, and never Swift's shared pool.
    @ObservationIgnored private lazy var volumeLister = VolumeLister(list: { DiskModel.mountedVolumes() }) { [weak self] found in
        DispatchQueue.main.async {
            MainActor.assumeIsolated {
                guard let self, found != self.choices else { return }
                self.choices = found
            }
        }
    }
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

    /// The caption under the path bar, one status at a time (`DiskCaption`): the live map's while the view shows it, and
    /// otherwise a scan's.
    var caption: DiskCaption? {
        if let live, liveView != nil { return DiskCaption.live(live.status) }
        return DiskCaption.scan(scanCaption)
    }

    /// What a scan is doing, or did, as the caption tells it.
    private var scanCaption: DiskCaption.Scan {
        if isScanning { return .scanning(found: progress.map { DiskCaption.Found(bytes: $0.bytes, files: $0.files) }, again: rescanning) }
        if result != nil, let scannedAt { return .scanned(at: scannedAt, edited: edited) }
        return note.map(DiskCaption.Scan.note) ?? .nothing
    }

    /// Folders the map couldn't read, so it leaves them out.
    var unreadableFolders: UInt64 { result?.summary.errors ?? 0 }

    /// How many folders the asking notice names (`AskingNotice.folders`), while the view shows the live map: the map goes
    /// on without them until the person answers macOS, or gives Pith Full Disk Access. Nil while it doesn't show.
    var askingFolders: Int? {
        guard let live, liveView != nil else { return nil }
        return AskingNotice.folders(for: live.status)
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
    /// whether its Back and Forward can go anywhere. The selection keeps the items still on the map, those inside the
    /// folder it shows.
    func pageMoved(to folder: String, wanting wanted: String?, canGoBack: Bool, canGoForward: Bool) {
        let opened = folder != openFolder || (wanted != wantedFolder && wanted != nil)
        if folder != openFolder {
            var kept = selection
            kept.keep(inside: folder)
            if kept != selection { setSelection(kept) }
        }
        wantedFolder = wanted
        openFolder = folder
        // A new open folder asks for its tree in detail, the wanted folder's when there is one.
        if opened, liveView != nil { folderOpened() }
        self.canGoBack = canGoBack
        self.canGoForward = canGoForward
    }

    @ObservationIgnored private var opens = OpenPacing()
    @ObservationIgnored private var openLater: Task<Void, Never>?

    /// A folder opened, from the map, the path bar, Back, Forward, Enclosing Folder or the Go menu: its tree comes at
    /// once, not through the two-second wait between refreshes. Within a burst of opens, as a held ⌘[ makes, the last
    /// asks once the burst is over (OpenPacing), its length from macOS's key repeat interval.
    private func folderOpened() {
        openLater?.cancel(); openLater = nil
        guard let wait = opens.opened(at: Date(), burst: OpenPacing.burst(keyRepeat: NSEvent.keyRepeatInterval)) else {
            refreshLive(opening: true)
            return
        }
        openLater = Task { [weak self] in
            try? await Task.sleep(for: .seconds(wait))
            guard let self, !Task.isCancelled else { return }
            self.openLater = nil
            self.refreshLive(opening: true)
        }
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

    /// Starts the live map of `root`, the startup disk unless a test gives a folder of its own, keeping it between
    /// launches as Settings says unless `keep` says otherwise.
    func startLive(root: String = "/", keep: Bool? = nil) {
        guard live == nil else { return }
        let live = LiveMap(root: root)
        live.received = { [weak self] request, value, json, places, answer in
            self?.liveTreeArrived(value, json: json, places: places, answer: answer, request: request)
        }
        live.treeFailed = { [weak self] request, reason in self?.liveTreeFailed(reason, request: request) }
        live.changed = { [weak self] in self?.refreshLive() }
        // Check Again's map comes at once, past the wait between refreshes, and shows at once, as Refresh's does.
        live.checkedAgain = { [weak self] in self?.refreshLive(now: true, checkedAgain: true) }
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
            select([])
            result = nil
            mapStartsOver()
            volumeUse = nil
            revision = UUID()
        }
        sideColumn.mapIsntLive()
        liveView = path
        scope = path
        live.makeFirstMap()
        refreshLive(now: true)
    }

    /// Asks the live map for the view's tree, at most every two seconds, unless a folder just opened whose detail the
    /// tree lacks. A map of the whole startup disk is a few megabytes of JSON for Pith to decode and the page to lay
    /// out, so it doesn't follow every listing. A folder shown `now`, or one opened, is the person's own ask, and so is
    /// the tree after their Check Again has landed (`checkedAgain`), which comes even when nothing changed
    /// (`LiveTreeAsks`).
    private func refreshLive(now: Bool = false, opening: Bool = false, checkedAgain: Bool = false) {
        guard let live, let path = liveView, live.state.isMapped, isVisible || result == nil || now else { return }
        guard live.changedSinceTree || result?.root.path != path || openFolderNeedsDetail || checkedAgain else { return }
        let wait = 2.0 - Date().timeIntervalSince(lastTree)
        if wait > 0 && !now && !(opening && openFolderNeedsDetail) {
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
        if let request = live.request(path: path, focus: detailFolder, places: sideColumn.places.shortcuts.map(\.path), gone: liveEdits.gone,
                                      back: liveEdits.back) {
            treeAsks.asked(checkedAgain ? .checkAgain : now || opening ? .opening : .refresh, request: request)
        }
        detailAsked = detailFolder
    }

    /// Which of the live map's trees answer the person's own action: shown at once, or fallen back on with a scan of
    /// theirs.
    @ObservationIgnored private var treeAsks = LiveTreeAsks()

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

    /// The live maps that came, counted: a map whose volume's figures were still being measured when a newer one came is
    /// dropped for it, and so is one the person changed the map before (`followChange`).
    @ObservationIgnored private var liveMaps = 0

    /// The person's own changes to the live map, Move to Trash and Undo, which the maps it sends show until its index has
    /// them (`LiveEdits`).
    @ObservationIgnored private var liveEdits = LiveEdits()
    /// How many live maps were shown, and how many of them came from an index that didn't show the person's changes yet
    /// and showed them all the same, which the smoke test reports.
    @ObservationIgnored private(set) var liveMapsShown = 0
    @ObservationIgnored private(set) var mapsShowingChanges = 0

    /// A live map came. Its volume's figures are measured off the main thread first, and whether the items the person
    /// changed are on the disk, and then the map goes out with its figures, as the person's changes have it.
    private func liveTreeArrived(_ value: DiskResult, json: String, places: [LivePlace], answer: LiveEdits.Answer, request: Int) {
        guard value.root.path == liveView else { return }
        liveMaps += 1
        let number = liveMaps
        // A change the index never shows, as a hard-linked file put back whose bytes it counts at another link, is held
        // for a minute at most (`LiveEdits.longestHold`).
        for edit in liveEdits.expire(at: Date()) {
            NSLog("Pith: the live map’s index didn’t show the change to \(edit.path) within \(Int(LiveEdits.longestHold)) s, so the maps after it no longer hold it.")
        }
        let changed = Set(liveEdits.gone + liveEdits.back)
        Task {
            async let figures = self.figures(for: value.root.path)
            let onDisk = changed.isEmpty ? [] : await Task.detached(priority: .utility) { Set(changed.filter(Self.exists)) }.value
            let measured = await figures
            guard number == liveMaps else { return }
            liveEdits.keep(onDisk: onDisk, of: changed)
            showLive(value, json: json, places: places, answer: answer, figures: measured, request: request)
        }
    }

    /// Whether something is at `path`, without following a symbolic link there.
    nonisolated private static func exists(_ path: String) -> Bool {
        var info = stat()
        return lstat(path, &info) == 0
    }

    private func showLive(_ value: DiskResult, json: String, places: [LivePlace], answer: LiveEdits.Answer, figures: VolumeFigures?, request: Int) {
        guard value.root.path == liveView else { return }
        // A map from an index that doesn't show the person's changes yet shows them anyway, and is then no longer the
        // scanner's own JSON.
        let edited = liveEdits.apply(to: value, places: places, answer: answer)
        liveMapsShown += 1
        if edited.changed { mapsShowingChanges += 1 }
        if let live { sideColumn.liveTreeArrived(root: live.root, places: edited.places) }
        settingLive = true
        volumeUse = figures
        result = edited.map
        resultJSON = edited.changed ? nil : json
        settingLive = false
        scope = value.root.path
        compareWithBaseline(edited.map)
        keepSelection()
        // The map after the person's Check Again shows at once, as Refresh's does.
        if treeAsks.arrived(request: request) { mapAnswersPerson = true }
        revision = UUID()
    }

    /// The person changed the live map, moving items to the Trash or putting them back: the map shows the change at once,
    /// and the maps after it show it too until the index has it. A map asked for before is dropped, as are the maps on
    /// their way, and the live map lists the folders the change touched again at once, past their cooldowns: each
    /// item's folder, and the folder it went to or came from where the map can read it, as the Trash once Pith has Full
    /// Disk Access.
    private func followChange(_ moves: [TrashMove]) {
        guard let live, liveView != nil else { return }
        liveMaps += 1
        live.dropTree()
        var folders = moves.map { $0.plan.target.deletingLastPathComponent().path }
        if trashOnMap != nil { folders += moves.compactMap { $0.trashed?.deletingLastPathComponent().path } }
        var asked = Set<String>()
        for folder in folders where DiskChanges.isInside(folder, live.root) && asked.insert(folder).inserted {
            live.relist(folder, deep: false)
        }
    }

    /// The selection as a newer map has it: an item the map no longer shows, folded into its folder's smaller items, stays
    /// with the size it last showed while it's on the disk (`DiskSelection.follow`), and only one gone from the disk
    /// leaves. What deleting them frees is measured again only once an item's size has moved by more than a megabyte
    /// since it was last measured, one measurement at a time and each after the last one's rest (`FreesSchedule`): a busy
    /// folder changes with every map, and measuring it each time would never stop.
    private func keepSelection() {
        guard !selection.isEmpty else { return }
        let unshown = selection.follow(result)
        refreshSelected()
        follow(frees.mapChanged(selectedSizes, at: Date()))
        dropGone(unshown)
    }

    /// Looks off the main thread for the selected items at `paths`, which the map no longer shows, and drops those no
    /// longer on the disk, once the selection is as it was. `lstat` never opens an item, and the map has read each.
    private func dropGone(_ paths: [String]) {
        guard !paths.isEmpty else { return }
        let picked = selection.paths
        Task {
            let gone = await Task.detached(priority: .utility) { Set(paths.filter { !Self.exists($0) }) }.value
            guard !gone.isEmpty, selection.paths == picked else { return }
            var kept = selection
            kept.drop(gone)
            setSelection(kept)
        }
    }

    /// The live map's folder sizes against a baseline kept from up to a day before, so the map shows what grew. A day
    /// old, the baseline is replaced by the map as it is then, and so is one dated after now, as when the clock went
    /// back. A map in finer detail around the open folder holds items the baseline never could, so only items the
    /// baseline has are compared, and a baseline is only ever taken from a map without that detail.
    private func compareWithBaseline(_ value: DiskResult) {
        guard remembersScans, let folder = scansFolder, let live, value.root.path == live.root else { return }
        let file = ScanMemory.file(for: value.root.path, in: folder)
        if baseline?.root != value.root.path {
            baseline = (try? Data(contentsOf: file)).flatMap { try? JSONDecoder().decode(ScanMemory.self, from: $0) }
        }
        if let kept = baseline, kept.isBaseline(of: value, at: Date(), within: 24 * 60 * 60) {
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

    /// Lists a folder of the live map again, with everything in it, for when it looks off. Once that has landed, its map
    /// comes at once and shows at once (`LiveMap.checkedAgain`).
    func checkAgain(_ folder: String) {
        live?.checkAgain(folder)
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

    /// Lists the volumes again, off the main thread, since a network volume can be slow to answer or hang: when Disk
    /// opens, when a disk is mounted, unmounted or renamed, and when the disk menu opens, for the free space it shows
    /// next. A listing runs on a queue of its own, and refreshes asked for while one runs make one more after it.
    func refreshChoices() {
        volumeLister.refresh()
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
    /// is scanned instead. The scan's map answers the person, and shows at once, only when the tree it replaces was the
    /// person's own ask, a folder they opened or Check Again; a refresh's waits for the hold like any refresh.
    private func liveTreeFailed(_ reason: String, request: Int) {
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
        let since = DiskWatcher.currentEventID
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
                result = value; scannedAt = Date(); edited = false; trashed = nil
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

    /// A click: selects the real items of `paths` in the map shown, none for anything else.
    func select(_ paths: [String]) {
        var next = DiskSelection(paths)
        next.keep { self.result?.item(at: $0) != nil }
        setSelection(next)
    }

    /// A ⌘-click: adds the item at `path` to the selection, or takes it out. A path that's no item of the map changes
    /// nothing.
    func toggle(_ path: String) {
        guard selection.paths.contains(path) || result?.item(at: path) != nil else { return }
        var next = selection
        next.toggle(path)
        setSelection(next)
    }

    /// Shift and an arrow key: adds the item at `path` to the selection, and an item selected already stays, though a
    /// held key asks for it again before the page shows it selected (`DiskSelection.add`). A path that's no item of the
    /// map changes nothing.
    func add(_ path: String) {
        guard result?.item(at: path) != nil else { return }
        var next = selection
        next.add(path)
        setSelection(next)
    }

    /// Makes `next` the selection, with its items, as the map shows them, and plan. Other items than before are measured
    /// afresh, and a measurement of the last ones is dropped.
    private func setSelection(_ next: DiskSelection) {
        let changed = next != selection
        var next = next
        let unshown = next.follow(result)
        selection = next
        refreshSelected()
        dropGone(unshown)
        guard changed else { return }
        freesTask?.cancel(); freesTask = nil
        selectedFrees = nil; freesAge = nil
        follow(frees.selected(selectedSizes))
    }

    /// The selected items, as the map shows them or last showed them, and their plan. The plan is made off the main
    /// thread when the selection changes, or a newer map changes what a selected path holds, as when a file becomes a
    /// folder; a map that only moves their sizes, or folds an item into its folder's smaller items, keeps it, since what
    /// can go to the Trash, and what Pith asks first, doesn't change with them. Moving them plans them again
    /// (`requestTrash`).
    private func refreshSelected() {
        selectedItems = selection.items
        let planned = PlannedSelection(root: result?.root.path, items: selection.paths.map { path in (path, selection.shown[path]?.kind) })
        guard planned != plannedFor else { return }
        if planned.paths != plannedFor?.paths { selectedPlan = nil }
        plannedFor = planned
        planning?.cancel(); planning = nil
        guard !selection.isEmpty else { return }
        let paths = selection.paths
        planning = Task { [weak self] in
            guard let plan = await self?.trashPlan(for: paths), !Task.isCancelled, let self, self.plannedFor == planned else { return }
            self.planning = nil
            self.selectedPlan = plan
        }
    }

    /// What the selection's plan was made for: the map's root, and each selected path with the kind of item the map has
    /// there.
    private struct PlannedSelection: Equatable {
        let root: String?
        let paths: [String]
        let kinds: [DiskNode.Kind?]

        init(root: String?, items: [(String, DiskNode.Kind?)]) {
            self.root = root; paths = items.map(\.0); kinds = items.map(\.1)
        }
    }
    @ObservationIgnored private var plannedFor: PlannedSelection?
    @ObservationIgnored private var planning: Task<Void, Never>?

    /// The selected items' sizes by path, which say when to measure what deleting them frees again.
    private var selectedSizes: [String: UInt64] {
        Dictionary(selectedItems.map { ($0.path, $0.size) }) { first, _ in first }
    }

    /// Does what the schedule says of what deleting the selection frees: measure now, keep the figure in hand, or measure
    /// once the last measurement's rest ends, if the items still differ then.
    private func follow(_ step: FreesSchedule.Step) {
        if case .wait(let until) = step, freesLater?.until == until { return }
        freesLater?.task.cancel(); freesLater = nil
        switch step {
        case .keep:
            // Back within a megabyte of what was measured, the figure is what they free now again. While a measurement
            // runs, the schedule keeps whatever comes, and the figure says what it said.
            if freesTask == nil, case .changed(let measured, _)? = freesAge { freesAge = .current(measured: measured) }
        case .measure:
            if let measured = freesAge?.measured { freesAge = .changed(measured: measured, again: nil) }
            measureFrees()
        case .wait(let until):
            if let measured = freesAge?.measured { freesAge = .changed(measured: measured, again: until) }
            let task = Task { [weak self] in
                try? await Task.sleep(for: .seconds(max(0, until.timeIntervalSinceNow)))
                guard let self, !Task.isCancelled else { return }
                self.freesLater = nil
                self.follow(self.frees.mapChanged(self.selectedSizes, at: Date()))
            }
            freesLater = (task, until)
        }
    }

    /// Asks the scanner what deleting the selected items frees, in one measurement of them all, so clone groups and
    /// hard links shared among them count once. It waits a moment first, so arrowing across the map doesn't start a walk
    /// for every item passed. One that lands once the selection has changed is dropped. How long it took sets the rest
    /// before the next.
    private func measureFrees() {
        let binary = binary, paths = selection.paths
        freesTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            let began = Date()
            do {
                let measured = try await ScannerRunner.frees(binary: binary, paths: paths)
                guard !Task.isCancelled, let self, self.selection.paths == paths else { return }
                self.freesTask = nil
                self.selectedFrees = measured
                self.freesAge = .current(measured: Date())
                // The items may have moved while they were measured.
                self.follow(self.frees.landed(self.selectedSizes, at: Date(), took: Date().timeIntervalSince(began)))
            } catch {
                guard !Task.isCancelled, let self, self.selection.paths == paths else { return }
                self.freesTask = nil
                NSLog("Pith: couldn't measure what deleting \(paths.joined(separator: ", ")) frees: \(error.localizedDescription)")
                // The figure in hand, if any, says again how old it is: the schedule judges the items by what it was
                // measured of, not by what this measurement began with.
                self.follow(self.frees.failed(self.selectedSizes, at: Date(), took: Date().timeIntervalSince(began)))
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

    /// The disk map's click hints the person has learned, kept in Pith's settings, which an automated run keeps in
    /// memory (`Setting`), so they stay learned in the next window and at the next launch.
    let mapHints = MapHints(read: { UserDefaults.standard.object(forKey: Setting.learnedMapHints.rawValue) },
                            write: { UserDefaults.standard.set($0, for: .learnedMapHints) })

    /// The apps the page names under Wrote the most since, as native last sent them: the page may load the icons of
    /// their bundles.
    @ObservationIgnored var pageWriters: [DiskWriter] = [] {
        didSet { sideColumn.writers = Set(pageWriters.compactMap(\.bundle)) }
    }

    /// What the map's side column shows beside the map: the Places section's table, and the apps that own the folders
    /// the map couldn't read, which LaunchServices finds off the main thread. It sets the apps the icon route serves.
    @ObservationIgnored private(set) lazy var sideColumn = SideColumnFeed(places: Icons.places, policy: icons) {
        NSWorkspace.shared.urlForApplication(withBundleIdentifier: $0)
    }

    /// The apps that own the folders the map couldn't read, by folder, which Couldn't read shows on the map's page.
    var owners: [String: IconKey] { sideColumn.owners }

    /// The icon of what `folder`, a folder the map couldn't read, belongs to, as the unreadable list shows it.
    func ownerKey(for folder: String) -> IconKey { sideColumn.ownerKey(for: folder) }

    /// What the map's Places section shows from: the live map's places, or nil for a scan, where it never shows.
    var placesTable: PlacesTable? { sideColumn.placesTable(for: result?.root) }

    /// Whether macOS may be holding some of the live map's folders: it's asking about some, or the map is catching up
    /// after a launch, listing again what changed meanwhile and what was waiting on macOS when it was saved.
    private var macOSMayHoldFolders: Bool {
        guard let live, liveView != nil else { return false }
        if case .catchingUp = live.state { return true }
        return live.asking > 0
    }

    /// What moving the items at `paths` to the Trash would do, or why they can't go (`TrashBatch.plan`), planned off the
    /// main thread: it looks each item and the folders Pith protects up on the disk.
    func trashPlan(for paths: [String]) async -> Result<TrashBatch, DiskFailure> {
        guard let result else { return .failure(DiskFailure("Open the map first.")) }
        // A selected item the map folds into its folder's smaller items since is planned from what it last showed.
        let home = FileManager.default.homeDirectoryForCurrentUser, kept = selection.shown
        return await Task.detached(priority: .userInitiated) { TrashBatch.plan(paths, result: result, home: home, kept: kept) }.value
    }

    /// The selection's plan when `paths` is the selection and its plan is in hand, waited for while it's being made, or a
    /// plan made for `paths` now.
    func trashPlan(forSelected paths: [String]) async -> Result<TrashBatch, DiskFailure> {
        if paths == selection.paths {
            if let selectedPlan { return selectedPlan }
            if let planning { await planning.value; if paths == selection.paths, let selectedPlan { return selectedPlan } }
        }
        return await trashPlan(for: paths)
    }

    /// Moves the items at `paths` to the Trash at once, as Finder does, since Undo can put them back. If any can't go,
    /// none do, and Pith says which and why. A synced item or Photos library asks first, once for them all: the Trash also
    /// takes it off the person's other devices or out of Photos. The items are planned again, off the main thread, since
    /// the disk can have changed since they were selected.
    func requestTrash(_ paths: [String], undoManager: UndoManager?) {
        guard result != nil, !isScanning, !isTrashing else { return }
        beganTrashWork()
        Task {
            let plan = await trashPlan(for: paths)
            endedTrashWork()
            switch plan {
            case .failure(let failure): problem = DiskProblem(message: failure.message)
            case .success(let batch) where batch.asks: confirming = batch
            // After an Undo ⌘Z began while the items were planned, rather than not at all.
            case .success(let batch): if result != nil, !isScanning { move(batch, undoManager: undoManager) }
            }
        }
    }

    /// Moves the items to the Trash, off the main thread, and takes them off the map once they've moved. On the live map,
    /// the maps after it leave them off too, until its index has them (`followChange`). One Undo puts back every item
    /// that moved. A move that stops at an item it can't move says which moved and which stayed, and its Undo puts back
    /// the ones that moved.
    func trash(_ batch: TrashBatch, undoManager: UndoManager?) {
        guard result != nil, !isScanning, !isTrashing else { return }
        move(batch, undoManager: undoManager)
    }

    private func move(_ batch: TrashBatch, undoManager: UndoManager?) {
        problem = nil
        let mover = Self.mover(into: trashFolder)
        afterTrashWork {
            let outcome = await Task.detached(priority: .userInitiated) { batch.move(with: mover) }.value
            self.moved(outcome, undoManager: undoManager)
        }
    }

    /// Runs `work` once the move to the Trash or Undo under way has ended, as trash work.
    private func afterTrashWork(_ work: @escaping @MainActor () async -> Void) {
        let earlier = trashing
        beganTrashWork()
        trashing = Task {
            await earlier?.value
            await work()
            endedTrashWork()
        }
    }

    private func beganTrashWork() { trashWork += 1; isTrashing = true }
    private func endedTrashWork() { trashWork -= 1; isTrashing = trashWork > 0 }

    /// Takes what `outcome` moved off the map shown: off its tree, its largest files and Places, out of the selection,
    /// and, on the live map, off the maps after it. What the map had of each item goes with the move's own record, which
    /// its own Undo puts back (`TrashUndoStack`).
    private func moved(_ outcome: TrashOutcome, undoManager: UndoManager?) {
        if let message = outcome.problem { problem = DiskProblem(message: message) }
        guard let note = outcome.note, let result else { return }
        var updated = result, items: [String: LiveEdits.Restored] = [:], nodes: [DiskNode] = []
        for move in outcome.moved {
            let path = move.plan.target.path
            // As the map shows it, or as it last showed it, for a selected item it folds into its folder's smaller items.
            let node = result.item(at: path) ?? selection.shown[path] ?? Self.node(of: move.plan)
            nodes.append(node)
            // A place it held leaves Places with it, its largest files leave Largest files, and the folders in it the map
            // couldn't read leave their list, until Undo puts them back.
            let inside = { (other: String) in DiskChanges.isInside(other, path) }
            items[path] = LiveEdits.Restored(node: node, topFiles: result.topFiles.filter { inside($0.path) }, places: sideColumn.tookOff(path),
                                             folded: result.root.node(at: path) == nil, unreadable: result.unreadableFolders.filter { inside($0.path) })
            // One the tree folds away takes its size out of the smaller items that count it.
            updated = updated.removing(path, folded: node) ?? updated
        }
        if liveView != nil {
            liveEdits.trashed(nodes)
            followChange(outcome.moved)
        }
        self.result = updated
        if liveView == nil { edited = true }
        // What moved leaves the selection; what stayed where it was stays selected.
        let gone = Set(outcome.moved.map(\.plan.target.path))
        var kept = selection
        kept.keep { !gone.contains($0) }
        setSelection(kept)
        let record = TrashRecord(moves: outcome.moved, note: note, items: items)
        trashed = record
        undos.moved(record, undoManager: undoManager)
        mapAnswersPerson = true
        revision = UUID()
    }

    /// An item the map didn't hold by itself when it moved, as its plan says it was.
    private static func node(of plan: TrashPlan) -> DiskNode {
        DiskNode(kind: plan.isFolder ? .dir : .file, name: plan.name, path: plan.target.path, size: plan.size, files: plan.isFolder ? plan.files : nil,
                 children: plan.isFolder ? [] : nil)
    }

    /// Moves an item to the person's Trash, as Finder does, and says where it went. An automated run never touches the
    /// person's Trash (`Launch.isAutomated`): it moves the item into `trashFolder` instead, and Undo moves it back from
    /// there as from the Trash. This is the one way Pith moves an item to the Trash.
    nonisolated private static func mover(into trashFolder: URL?) -> @Sendable (URL) throws -> URL? {
        { item in
            guard Launch.isAutomated else {
                var trashedURL: NSURL?
                try FileManager.default.trashItem(at: item, resultingItemURL: &trashedURL)
                return trashedURL as URL?
            }
            guard let trashFolder else { throw DiskFailure("An automated run of Pith doesn’t use your Trash.") }
            // A folder for each item, so two items of the same name never meet.
            let holder = trashFolder.appendingPathComponent(UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(at: holder, withIntermediateDirectories: true)
            let moved = holder.appendingPathComponent(item.lastPathComponent)
            try FileManager.default.moveItem(at: item, to: moved)
            return moved
        }
    }

    /// The notice's Undo: puts back the latest move, which ⌘Z then no longer undoes, so ⌘Z next undoes the one before.
    func undoTrash() {
        guard let trashed else { return }
        undos.undo(trashed)
    }

    /// Moves every item of `record`'s move back where it was, off the main thread, once the move or Undo under way has
    /// ended, and puts each back on the map open now, where it was, selecting them again. On the live map, the maps after
    /// it keep them, until its index has listed them again. Moving back never overwrites anything: one that can't go back
    /// stays in the Trash, and off the map, and Pith says which (`TrashUndo.putBack`).
    private func undoTrash(_ record: TrashRecord) {
        if trashed === record { trashed = nil }
        let moves = record.moves
        afterTrashWork {
            let (restored, stuck) = await Task.detached(priority: .userInitiated) {
                TrashUndo.putBack(moves) { try FileManager.default.moveItem(at: $0, to: $1) }
            }.value
            if let message = TrashUndo.problem(stuck: stuck) { self.problem = DiskProblem(message: message) }
            let items = restored.compactMap { record.items[$0.plan.target.path] }
            guard !items.isEmpty else { return }
            self.putBack(items, moved: restored)
        }
    }

    /// Puts `items`, which Undo moved back on the disk, on the map open now, where each was: in its folder, or in the
    /// smaller items of the deepest folder the map shows on its way, as the map had it or as the map is now. Places, the
    /// selection and the live map's maps after it follow.
    private func putBack(_ items: [LiveEdits.Restored], moved: [TrashMove]) {
        if liveView != nil {
            liveEdits.putBack(items)
            followChange(moved)
        }
        if let current = result {
            result = items.reduce(current) { map, item in
                let back = { (folding: Bool) in map.restoring(item.node, topFiles: item.topFiles, unreadable: item.unreadable, folding: folding) }
                return back(item.folded) ?? back(true) ?? map
            }
        }
        for item in items { sideColumn.putBack(item.places) }
        mapAnswersPerson = true
        revision = UUID()
        let root = result?.root.path
        setSelection(DiskSelection(items: items.reversed().map(\.node).filter { item in root.map { item.path != $0 && DiskChanges.isInside(item.path, $0) } ?? false }))
    }

    func dismissTrashNote() { trashed = nil }

    /// Shows the items at `paths` in Quick Look, or the selection's, as many as the map has, or last showed of those it
    /// folds away since they were selected: the panel goes through them.
    func quickLook(_ paths: [String]? = nil) {
        let urls = (paths ?? selection.paths).filter { result?.item(at: $0) != nil || selection.shown[$0] != nil }.map { URL(fileURLWithPath: $0) }
        guard !urls.isEmpty else { return }
        showQuickLook?(urls)
    }

    func reveal(_ paths: [String]) { NSWorkspace.shared.activateFileViewerSelecting(paths.map { URL(fileURLWithPath: $0) }) }

    /// Copies the paths, each on a line of its own, as Finder copies several items' pathnames.
    func copyPath(_ paths: [String]) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(paths.joined(separator: "\n"), forType: .string)
    }

    /// Compares a finished scan with the last one of the same folder, then keeps this one for next time. A last scan
    /// dated after this one, as when the clock went back, isn't compared.
    private func compareWithLastScan(_ value: DiskResult) {
        growth = [:]; growthSince = nil
        guard remembersScans, let folder = scansFolder, let date = scannedAt else { return }
        let file = ScanMemory.file(for: value.root.path, in: folder)
        if let data = try? Data(contentsOf: file), let last = try? JSONDecoder().decode(ScanMemory.self, from: data), last.isBaseline(of: value, at: date) {
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

    // MARK: Where the space is

    /// The used space the scan couldn't measure on the volume the map shows, which the map's page draws as its Not
    /// measured block at `root`, and all the volume's used space, which the root's shares are then of: the figures
    /// "Where the space is" gives as Not measured and Used on this disk.
    struct NotMeasured: Equatable {
        let root: String
        let bytes: UInt64
        let used: UInt64
    }

    /// What the map's page draws as Not measured, only for a map of a whole volume: the live map of the startup disk, or
    /// a scan of a volume's root.
    var notMeasured: NotMeasured? {
        guard let accounting, let bytes = accounting.notMeasuredBlock else { return nil }
        return NotMeasured(root: accounting.root, bytes: bytes, used: accounting.used)
    }

    /// "Where the space is" for a map of a whole volume, row by row, the Trash's from the map when the map can read it.
    var spaceRows: [SpaceRow]? {
        accounting?.rows(result: result, trash: trashOnMap)
    }

    /// The Trash's size as the map shows it, when the map can read the Trash: on the live map, the figure Places gives
    /// it, from the map's tree or its index, and in a scan, its folder's in the tree. Nil when the map can't read it or
    /// doesn't hold it. Pith never reads the Trash itself.
    var trashOnMap: UInt64? {
        guard let trash = sideColumn.places.place(id: "trash") else { return nil }
        if let table = placesTable { return table.places.first { $0.id == trash.id }?.size }
        // A folder the map couldn't read is no folder of the tree's.
        return result?.root.folder(at: trash.path)?.size
    }

    /// The map's Not measured block was clicked: "Where the space is" says what it holds and why. A scan under way leaves
    /// the map it was drawn from on screen, and the link with it, so it shows that map's accounting.
    func explainNotMeasured() {
        guard spaceRows != nil else { return }
        showsWhereTheSpaceIs = true
    }

    /// Measures a whole volume's own figures for a map of `root`, off the main thread, or nil for a map of a folder, which
    /// nothing can account for. The smoke test gives figures of its own, so its fixture stands in for a volume.
    @ObservationIgnored var measures: @Sendable (String) -> VolumeUse? = DiskModel.measure

    /// Measures a whole volume's space alone for a map of `root`, off the main thread: its used space and that of the
    /// volumes a walk enters, or nil for a map of a folder. The smoke test gives figures of its own.
    @ObservationIgnored var measuresSpace: @Sendable (String) -> VolumeUse.Space? = DiskModel.measureSpace

    /// A whole volume's own figures for a map of `root`, and when they were last all measured.
    private struct VolumeFigures {
        let root: String
        let use: VolumeUse
        let allMeasured: Date
    }

    /// The volume's own figures for a map of `root` about to go out, measured off the main thread, so the map and its
    /// Not measured go out together, measured for it: its space, which the file system gives at once, and its snapshots
    /// and what's purgeable too when `full`, when the figures held are another root's or none, or when they're five
    /// minutes old. Nil for a map of a folder, which nothing can account for.
    private func figures(for root: String, full: Bool = false) async -> VolumeFigures? {
        let measures = measures, measuresSpace = measuresSpace
        if !full, let held = volumeUse, held.root == root, Date().timeIntervalSince(held.allMeasured) < 300 {
            let space = await Task.detached(priority: .utility) { measuresSpace(root) }.value
            return VolumeFigures(root: root, use: space.map(held.use.with) ?? held.use, allMeasured: held.allMeasured)
        }
        let measured = Date()
        let use = await Task.detached(priority: .utility) { measures(root) }.value
        return use.map { VolumeFigures(root: root, use: $0, allMeasured: measured) }
    }

    /// Measures all the volume's own figures again and sets them against the map shown, without a new map. Every map goes
    /// out with figures measured for it; the smoke test calls this when it gives figures of its own, and when it takes
    /// them back.
    func refreshAccounting() {
        guard let root = result?.root.path else { volumeUse = nil; return }
        Task {
            let figures = await self.figures(for: root, full: true)
            guard self.result?.root.path == root else { return }
            volumeUse = figures
        }
    }

    /// Sets the volume's own figures against the map shown, whenever either changes. Pure arithmetic, so it follows
    /// every map: a live one every few seconds, or one Move to Trash or Undo edited.
    private func account() {
        guard let result, let volumeUse, volumeUse.root == result.root.path else {
            if accounting != nil { accounting = nil }
            return
        }
        let fresh = DiskAccounting(volumeUse.use, result: result)
        if fresh != accounting { accounting = fresh }
    }

    /// The figures of the volume at `root` when `root` is a volume's root: its used space and that of the volumes a walk
    /// enters, what's purgeable, and `tmutil`'s count of its local snapshots.
    nonisolated private static func measure(_ root: String) -> VolumeUse? {
        guard let space = measureSpace(root) else { return nil }
        let keys: Set<URLResourceKey> = [.volumeAvailableCapacityKey, .volumeAvailableCapacityForImportantUsageKey]
        let values = try? URL(fileURLWithPath: root).resourceValues(forKeys: keys)
        let available = values?.volumeAvailableCapacity.map { UInt64(max(0, $0)) }
        let important = values?.volumeAvailableCapacityForImportantUsage.map { UInt64(max(0, $0)) }
        let purgeable = important.flatMap { important in available.map { important.saturatingSubtract($0) } }
        return VolumeUse(space, snapshots: localSnapshots(root), purgeable: purgeable)
    }

    /// The space of the volume at `root` when `root` is a volume's root, which `statfs` and `getattrlist` give at once:
    /// its container's used space and that of the volumes a walk enters.
    nonisolated private static func measureSpace(_ root: String) -> VolumeUse.Space? {
        let keys: Set<URLResourceKey> = [.volumeURLKey, .volumeTotalCapacityKey, .volumeAvailableCapacityKey]
        guard let values = try? URL(fileURLWithPath: root).resourceValues(forKeys: keys),
              let walked = DiskAccounting.walkedVolumes(root: root, mountPoint: values.volume?.path),
              let total = values.volumeTotalCapacity, let available = values.volumeAvailableCapacity else { return nil }
        let volumes = walked.compactMap(VolumeSpace.used)
        guard volumes.count == walked.count else { return nil }
        return VolumeUse.Space(used: UInt64(max(0, total - available)), walkedVolumes: volumes)
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
}
