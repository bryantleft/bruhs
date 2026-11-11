import AppKit
import Observation
import os
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
    /// No record of who wrote: history holds nothing for the stretch, or isn't kept at all.
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
    var resultJSON: String?
    @ObservationIgnored var settingLive = false
    /// When a scan made the map; nil while the map is the live one, which says when it was last brought up to date.
    var scannedAt: Date?
    /// When that scan began, by Pith's clock as it started the scanner: a start worked out from how long the scanner
    /// says it ran falls as much later as the Mac slept meanwhile, since the scanner's clock stops while the Mac sleeps.
    var scanBegan: Date?
    /// True once a scanned map has changed since its scan: an item moved to the Trash, or a folder scanned again.
    var edited = false
    /// The items selected on the map, in the order they were picked, none inside another (`DiskSelection`). Pith keeps
    /// them, and the map's page outlines them.
    var selection = DiskSelection()
    /// The selected items as the map has them, in that order.
    var selectedItems: [DiskNode] = []
    /// What moving the selected items to the Trash would do, or why they can't go.
    var selectedPlan: Result<TrashBatch, DiskFailure>?
    /// What deleting the selected items frees now, from one measurement of them all, once the scanner has made it: clones,
    /// hard links and snapshots outside them can keep part of their size, and those shared among them count once.
    var selectedFrees: DiskFrees?
    /// How old that figure is: what the items free now, or what they freed when Pith last measured them, before they
    /// changed, while it waits to measure them again or measures them (`FreesAge`).
    var freesAge: FreesAge?
    @ObservationIgnored var frees = FreesSchedule()
    var freesTask: Task<Void, Never>?
    /// A measurement of the same selection held back until the last one's rest ends (`FreesSchedule`), and when.
    @ObservationIgnored var freesLater: (task: Task<Void, Never>, until: Date)?
    @ObservationIgnored var plannedFor: PlannedSelection?
    @ObservationIgnored var planning: Task<Void, Never>?
    /// A move to the Trash waiting for the person to confirm what it does to a synced item or a Photos library.
    var confirming: TrashBatch?
    /// Where the volume's space went, for a map of a whole volume: the volume's own figures set against the map as it is
    /// now (`account`), so what the map gains or loses, as by Move to Trash and Undo, moves Not measured at once.
    private(set) var accounting: DiskAccounting?
    /// The volume's own figures for the map shown (`figures(for:full:)`), measured before the map went out and set
    /// against it with it.
    @ObservationIgnored var volumeUse: VolumeFigures? {
        didSet { account() }
    }
    /// Measures a whole volume's own figures for a map of `root`, off the main thread, or nil for a map of a folder, which
    /// nothing can account for. The smoke test gives figures of its own, so its fixture stands in for a volume.
    @ObservationIgnored var measures: @Sendable (String) -> VolumeUse? = DiskModel.measure
    /// Measures a whole volume's space alone for a map of `root`, off the main thread: its used space and that of the
    /// volumes a walk enters, or nil for a map of a folder. The smoke test gives figures of its own.
    @ObservationIgnored var measuresSpace: @Sendable (String) -> VolumeUse.Space? = DiskModel.measureSpace

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

    /// The live map's folder sizes against a baseline kept from up to a day before, so the map shows what grew. A day
    /// old, the baseline is replaced by the map as it is then, and so is one dated after now, as when the clock went
    /// back. A map in finer detail around the open folder holds items the baseline never could, so only items the
    /// baseline has are compared, and a baseline is only ever taken from a map without that detail.
    func compareWithBaseline(_ value: DiskResult) {
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

    /// Compares a finished scan with the last one of the same folder, then keeps this one for next time. A last scan
    /// dated after this one, as when the clock went back, isn't compared.
    func compareWithLastScan(_ value: DiskResult) {
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

    /// Folders FSEvents says changed since a scanned map's scan began. The live map follows changes itself.
    var changes = DiskChanges()
    var watcher: DiskWatcher?
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
    var scope: String?
    /// A folder inside the map being scanned again, while that runs.
    var rescanning: String?
    var progress: DiskProgress?
    /// How the last scan ended when it didn't produce a map.
    var note: String?
    /// The latest move to the Trash, while its notice shows: its Undo button undoes it.
    var trashed: TrashRecord?
    /// Every move to the Trash Undo can still put back, each registered with the window's undo manager on its own, so
    /// each ⌘Z undoes its own move, the latest first, wherever the map is by then.
    @ObservationIgnored lazy var undos = TrashUndoStack { [weak self] record in self?.undoTrash(record) }
    /// The move to the Trash or Undo under way, which the next waits for, so ⌘Z pressed meanwhile undoes its move once
    /// that one ends rather than being lost. `trashWork` counts the moves, plans and Undos begun and not ended.
    @ObservationIgnored var trashing: Task<Void, Never>?
    @ObservationIgnored var trashWork = 0
    /// The moves to the Trash under way, from their planning until they land. Undo waits for them (`canUndoMove`): a move
    /// registers its own Undo once it lands, so ⌘Z or the note's Undo meanwhile would put back the move before it.
    var movesUnderWay = 0
    /// Whether Undo may put back a move to the Trash now: none is under way. Edit > Undo and the note's Undo are off
    /// otherwise.
    var canUndoMove: Bool { movesUnderWay == 0 }
    /// The folder the map is showing, as the page reports it. Nil until the page reports a new map's folder.
    private(set) var openFolder: String?
    /// A folder the page went back or forward to that the map's tree leaves out: the live map shows it in detail, so
    /// the next tree holds it.
    @ObservationIgnored var wantedFolder: String?
    /// Whether the page's Back and Forward have somewhere to go, which the Go menu follows.
    private(set) var canGoBack = false
    private(set) var canGoForward = false
    /// Runs a command of the path bar or the Go menu in the map's page; the page's coordinator connects it.
    @ObservationIgnored var pageCommand: ((MapCommand) -> Void)?
    /// The mounted volumes, for the disk menu, the path bar's names and the list shown when the live map can't run.
    private(set) var choices: [DiskVolumeChoice] = [] {
        didSet { icons.volumes = Set(choices.map(\.url.path)) }
    }

    /// The smoke test's own listing of the volumes, with figures of its own, fresher than the Mac's: each listing gives
    /// it, as it would give the Mac's, until it's set back to nil.
    func smokeTestListsVolumes(_ volumes: [DiskVolumeChoice]?) {
        smokeVolumes.withLock { $0 = volumes }
    }
    @ObservationIgnored private let smokeVolumes = OSAllocatedUnfairLock<[DiskVolumeChoice]?>(initialState: nil)

    /// Lists the volumes on a queue of its own, one listing at a time, however often they're asked for meanwhile
    /// (`VolumeLister`): a network share that hangs holds that queue, and never Swift's shared pool.
    @ObservationIgnored private lazy var volumeLister: VolumeLister<[DiskVolumeChoice]> = {
        let smoke = smokeVolumes
        return VolumeLister(list: { smoke.withLock { $0 } ?? DiskModel.mountedVolumes() }) { [weak self] found in
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    guard let self, found != self.choices else { return }
                    self.choices = found
                }
            }
        }
    }()

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

    let runner = ScannerRunner()
    var operation: Task<Void, Never>?
    var generation = UUID()
    var binary: URL { Bundle.main.bundleURL.appendingPathComponent("Contents/MacOS/storage-scanner") }

    /// The startup disk's live map.
    var live: LiveMap?
    /// The folder of the live map the view shows: its root, or a folder in it someone chose. Nil while the view
    /// shows a scan of somewhere else.
    var liveView: String?
    /// Whether Disk is on screen, where the map refreshes as it changes.
    var isVisible = false
    var lastTree = Date.distantPast
    var treeLater: Task<Void, Never>?
    /// Which of the live map's trees answer the person's own action: shown at once, or fallen back on with a scan of
    /// theirs.
    @ObservationIgnored var treeAsks = LiveTreeAsks()
    var detailAsked: String?
    /// The live map's baseline for what grew, kept rather than read from disk for every map.
    @ObservationIgnored private var baseline: ScanMemory?
    /// The live maps that came, counted: a map whose volume's figures were still being measured when a newer one came is
    /// dropped for it, and so is one the person changed the map before (`followChange`).
    @ObservationIgnored var liveMaps = 0
    /// The person's own changes to the live map, Move to Trash and Undo, which the maps it sends show until its index has
    /// them (`LiveEdits`).
    @ObservationIgnored var liveEdits = LiveEdits()
    /// How many live maps were shown, which the smoke test counts.
    @ObservationIgnored var liveMapsShown = 0
    /// The smoke test's seam: in the very turn Pith follows the person's change, once the map asked for before is dropped
    /// and before the folders the change touched are listed again (`followChange`), it asks for the next map at once, so
    /// that map comes from an index that hasn't listed the change, as any map asked for meanwhile can, and the person's
    /// change has to hold on it. Off but in the smoke test.
    @ObservationIgnored var smokeTestAsksBeforeRelisting = false
    /// The smoke test sees each live map as it's shown, as the person's changes have it, with what the scanner said of
    /// those changes: which it was asked about, and which of those its index doesn't show yet.
    @ObservationIgnored var smokeTestSawLiveMap: ((DiskResult, LiveEdits.Answer) -> Void)?
    /// What the map's page may load from Pith's icon route, by the same rule: an item's own icon only for what the map
    /// shows with that key, for the disks the disk menu lists and for the apps the page names under Wrote the most
    /// since. It's given the map, the disks and the apps as they change.
    @ObservationIgnored lazy var icons = IconPolicy(places: Icons.places)
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
    /// Whether Pith still has Full Disk Access, as the probe last found, kept across launches in Pith's settings.
    private(set) var diskAccess = DiskModel.keptDiskAccess()

    /// What Pith kept of its watch on Full Disk Access when it last changed, in its settings (`keepDiskAccess`).
    nonisolated private static func keptDiskAccess() -> DiskAccessWatch {
        let settings = UserDefaults.standard, lostAt = settings.double(forKey: Setting.fullDiskAccessLostAt.rawValue)
        return DiskAccessWatch(granted: settings.bool(forKey: Setting.hadFullDiskAccess.rawValue), lostAt: lostAt > 0 ? Date(timeIntervalSince1970: lostAt) : nil,
                               relisted: settings.bool(forKey: Setting.listedSinceFullDiskAccessLost.rawValue))
    }

    /// Looks whether Pith still has Full Disk Access, as Pith becomes active and with each live map: an open and a close
    /// of a file only it opens, 8 to 11 µs (`DiskAccessWatch.probe`), which never brings a question.
    func probeDiskAccess() {
        var watch = diskAccess
        watch.probed(DiskAccessWatch.probe(DiskAccessWatch.probePath(home: NSHomeDirectory())), at: Date())
        keepDiskAccess(watch)
    }

    /// The live map, the startup disk's, listed every folder again, in a walk or a check that began at `since`: one
    /// begun since Pith lost Full Disk Access lifts the startup disk's hold as its report comes, and Pith keeps that for
    /// the next launch, where the map it opens on lists nothing again until something changes.
    func listedEveryFolder(since: Date) {
        var watch = diskAccess
        watch.listedEveryFolder(since: since)
        keepDiskAccess(watch)
    }

    /// Keeps `watch` as Pith's watch on Full Disk Access, and in Pith's settings, which an automated run keeps in memory.
    func keepDiskAccess(_ watch: DiskAccessWatch) {
        guard watch != diskAccess else { return }
        diskAccess = watch
        UserDefaults.standard.set(watch.granted, for: .hadFullDiskAccess)
        UserDefaults.standard.set(watch.lostAt?.timeIntervalSince1970 ?? 0, for: .fullDiskAccessLostAt)
        UserDefaults.standard.set(watch.relisted, for: .listedSinceFullDiskAccessLost)
    }

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
}
