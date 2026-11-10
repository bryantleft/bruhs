import AppKit
import CoreServices
import IOKit.ps
import Observation
import PithCore

/// The startup disk's map, kept current by the scanner's `serve` process from FSEvents, so nobody has to scan.
///
/// At launch it opens the map saved last and replays what FSEvents saw change since, or, with nothing saved, waits
/// for Disk to open the first time, then walks the disk once. From then on FSEvents' events go to the scanner, which
/// lists again only the folders that changed and reports how many it's waiting on.
@MainActor @Observable final class LiveMap {
    enum State: Equatable {
        /// Not started, as in automated runs.
        case off
        case opening
        /// No saved map: the first walk waits until Disk opens, since it can bring macOS's permission questions.
        case unmapped
        /// The first walk, or a new one after the saved map couldn't catch up.
        case mapping(DiskProgress?)
        /// Replaying what changed while Pith was closed.
        case catchingUp(Int)
        /// Current, with this many folders waiting to be listed again.
        case live(Int)
        case failed(String)

        var isMapped: Bool {
            switch self {
            case .catchingUp, .live: true
            default: false
            }
        }

        var isFailed: Bool {
            if case .failed = self { return true }
            return false
        }
    }

    let root: String
    private(set) var state: State = .off
    /// Why the last walk began, when the saved map couldn't catch up, for the progress view to say.
    private(set) var rebuildReason: String?
    /// The map opened on a saved one and caught up from FSEvents, rather than walking.
    private(set) var restored = false
    /// When the map shown was last brought up to date.
    private(set) var updatedAt: Date?
    /// The last check of every folder, for the verification notes and Settings.
    private(set) var lastCheck: LiveCheck?
    /// The checks of every folder: the daily one Pith asked for and hasn't heard end, and the one under way, as the
    /// scanner reports it.
    private(set) var checks = LiveChecks()
    /// Something the map shows changed since the last tree was asked for.
    private(set) var changedSinceTree = true
    /// Folders the map lacks until the person answers macOS's question about Pith, as for iCloud Drive: opening one
    /// waits on that answer, and the map goes on without them meanwhile.
    private(set) var asking = 0
    /// A tree arrived: the map for `path`, as asked for, with its JSON for the page, what its index holds at the places
    /// asked about, which of the person's changes asked about its index doesn't show yet, and how many folders wait to be
    /// listed for a change, or nil when the scanner didn't say.
    var received: ((DiskResult, String, [LivePlace], LiveEdits.Answer, Int?) -> Void)?
    /// The map changed, so a view on screen should ask for its tree again.
    var changed: (() -> Void)?
    /// The tree asked for last couldn't be made, as for a folder the map lacks.
    var treeFailed: ((String) -> Void)?
    /// The person's Check Again has landed: the folder, and everything in it, listed again (`checkAgain`).
    var checkedAgain: (() -> Void)?

    private var process: LiveProcess?
    private var stream: LiveStream?
    private var snapshot: URL?
    private var volume: String?
    private var historyDone = false
    private var pending = 0
    private var nextRequest = 0
    /// The tree asked for last; older answers are dropped. None once the person changed the map since (`dropTree`).
    private var wanted = 0
    /// The person's changes the tree asked for last asked about.
    private var askedEdits: Set<String> = []
    /// The requests of the person's Check Agains whose relists haven't landed yet.
    private var checksAsked: Set<Int> = []
    private var stopped: (@MainActor () -> Void)?
    private var checker: NSBackgroundActivityScheduler?
    /// Whether this map registered the daily check with macOS's scheduler. An automated run's never does: macOS keeps
    /// the schedule for the app's bundle ID, which the person's own Pith shares, so the smoke test's map would take its
    /// turns and move when it next comes.
    private(set) var schedulesDailyCheck = false
    /// Disk asked for the first map while the scanner was still opening.
    private var firstMapWanted = false
    /// When a walk or a check last listed every folder.
    private var listedAt: Date?

    init(root: String) {
        self.root = root
    }

    /// Starts the scanner and opens the saved map at `snapshot`, or none when Pith doesn't keep it.
    func start(binary: URL, snapshot: URL?) {
        guard state == .off else { return }
        state = .opening
        self.snapshot = snapshot
        volume = DiskWatcher.volumeUUID(for: root)
        let process = LiveProcess(binary: binary, receive: { [weak self] report in
            Task { @MainActor in self?.handle(report) }
        }, exited: { [weak self] status in
            Task { @MainActor in self?.exited(status) }
        })
        do {
            try process.start()
        } catch {
            state = .failed("Pith couldn’t start its disk map: \(error.localizedDescription)")
            return
        }
        self.process = process
        process.open(root: root, snapshot: snapshot, volume: volume)
        scheduleChecks()
    }

    /// Walks the disk for the first map, if there's none yet. Asked before the scanner has opened what's saved, it
    /// waits for that answer.
    func makeFirstMap() {
        switch state {
        case .unmapped: walk(reason: nil)
        case .opening: firstMapWanted = true
        default: break
        }
    }

    private func walk(reason: String?) {
        guard let process else { return }
        stream?.stop()
        rebuildReason = reason
        // A walk starts the scanner's index over, and the relists Check Again asked for with it, which the walk lists.
        checksAsked = []
        // Watching from before the walk begins catches what changes while it runs.
        let since = FSEventsGetCurrentEventId()
        historyDone = true
        // A walk lists every folder, so a daily check it cuts short is done with.
        if checks.walkBegan() { endDailyCheck(.finished) }
        state = .mapping(nil)
        startStream(since: since, replay: false)
        process.walk(since: since)
    }

    private func startStream(since: UInt64, replay: Bool) {
        let process = process
        stream = LiveStream(root: root, since: since, replay: replay) { events in process?.events(events) }
        if stream == nil { state = .failed("FSEvents can’t watch \(root), so Pith can’t keep its map current.") }
    }

    /// Asks for the map of `path`, with `focus` in finer detail, what it holds at each of `places`, and which of the
    /// person's changes, the items moved to the Trash (`gone`) and put back (`back`), it doesn't show yet, from the same
    /// index. The answer goes to `received`; asking again first drops it.
    func request(path: String, focus: String?, places: [String], gone: [String] = [], back: [String] = []) {
        guard let process, state.isMapped else { return }
        nextRequest += 1
        wanted = nextRequest
        askedEdits = Set(gone + back)
        changedSinceTree = false
        process.tree(path: path, focus: focus, request: nextRequest, places: places, gone: gone, back: back)
    }

    /// The person changed the map, as Move to Trash and Undo do: the tree asked for before is dropped when it comes, as
    /// it was asked without the change, and the next refresh asks again.
    func dropTree() {
        wanted = 0
        changedSinceTree = true
    }

    /// Lists a folder again now, past its cooldown too, everything in it with `deep`.
    func relist(_ path: String, deep: Bool) { process?.relist(path: path, deep: deep) }

    /// The person's Check Again: lists `path` again now, past its cooldown, with everything in it, and says when that has
    /// landed (`checkedAgain`), however long it takes.
    func checkAgain(_ path: String) {
        guard let process else { return }
        nextRequest += 1
        checksAsked.insert(nextRequest)
        process.relist(path: path, deep: true, request: nextRequest)
    }

    /// Lists the folders the map couldn't read again, as after Full Disk Access is granted.
    func retryUnreadable() { process?.retryUnreadable() }

    func save() { process?.save() }

    /// Keeps the map in `snapshot` from now on, or nowhere.
    func keep(_ snapshot: URL?) {
        self.snapshot = snapshot
        process?.keep(snapshot: snapshot)
        if snapshot != nil { process?.save() }
    }

    /// Lists every folder again, slowly, to catch what FSEvents didn't report.
    func check() {
        guard state.isMapped else { return }
        process?.check()
    }

    /// Stops at quit: the scanner saves and exits, waited for here for up to `timeout` seconds. It waits on the main
    /// thread rather than calling back, since AppKit runs none of Pith's tasks while a quit waits on
    /// `.terminateLater`, and a quit waiting on one never finished.
    func stopNow(timeout: TimeInterval) {
        stream?.stop()
        stream = nil
        checker?.invalidate()
        if checks.stopped() { endDailyCheck(.deferred) }
        guard let process, process.isRunning else { return }
        process.close()
        if !process.waitUntilExit(timeout: timeout) {
            NSLog("Pith: the disk map didn’t finish saving within \(timeout) s, so Pith quit without waiting.")
            process.terminate()
        }
    }

    /// Stops watching and lets the scanner save and exit, then calls `done`, or after `timeout` whatever happened.
    func stop(timeout: Duration, done: @escaping @MainActor () -> Void) {
        stream?.stop()
        stream = nil
        checker?.invalidate()
        if checks.stopped() { endDailyCheck(.deferred) }
        guard let process, process.isRunning else { Task { @MainActor in done() }; return }
        stopped = done
        process.close()
        Task { [weak self] in
            try? await Task.sleep(for: timeout)
            guard let self, let stopped = self.stopped else { return }
            self.stopped = nil
            NSLog("Pith: the disk map didn’t finish saving within \(timeout), so Pith quit without waiting.")
            self.process?.terminate()
            stopped()
        }
    }

    /// Takes one of the scanner's reports. The smoke test hands it reports of its own too, as when macOS would be asking.
    func handle(_ report: LiveReport) {
        switch report {
        case .opened(let opened):
            if opened.locked { NSLog("Pith: another copy of Pith keeps the disk map, so this one won’t save it.") }
            guard opened.restored, let through = opened.through, let savedAt = opened.savedAt else {
                state = .unmapped
                if firstMapWanted { walk(reason: nil) }
                return
            }
            updatedAt = savedAt
            let plan = LivePlan.after(through: through, savedAt: savedAt, current: FSEventsGetCurrentEventId()) { [root] date in
                LivePlan.lastEvent(before: date, onVolumeOf: root)
            }
            switch plan {
            case .replay(let since):
                restored = true
                historyDone = false
                state = .catchingUp(0)
                startStream(since: since, replay: true)
                // The saved map shows at once, while the replay catches it up.
                changedSinceTree = true
                changed?()
            case .rebuild(let reason):
                walk(reason: reason)
            }
        case .progress(_, let files, let bytes, let errors, let asking):
            self.asking = asking
            if case .mapping = state { state = .mapping(DiskProgress(files: files, bytes: bytes, errors: errors)) }
        case .walked(_, _, _, _, let asking):
            self.asking = asking
            listedAt = Date()
            rebuildReason = nil
            updatedAt = Date()
            state = .live(0)
            changedSinceTree = true
            changed?()
        case .status(let status):
            pending = status.pending
            asking = status.asking
            // Pith's daily check runs until the scanner says it's done; any other comes from the scanner itself.
            checks.status(checking: status.checking)
            historyDone = historyDone || status.historyDone
            if status.changed {
                updatedAt = Date()
                changedSinceTree = true
            }
            guard state.isMapped else { return }
            state = historyDone ? .live(status.pending) : .catchingUp(status.pending)
            if status.changed { changed?() }
        case .historyDone:
            historyDone = true
            if case .catchingUp(let waiting) = state { state = .live(waiting) }
        case .rebuild(let reason):
            walk(reason: reason)
        case .tree(let request, let result, let json, let places, let unlisted, let pending):
            guard request == wanted else { return }
            received?(result, json, places, LiveEdits.Answer(asked: askedEdits, unlisted: Set(unlisted)), pending)
        case .relisted(let request):
            if checksAsked.remove(request) != nil { checkedAgain?() }
        case .saved(let through, let bytes, let ms):
            NSLog("Pith: kept the disk map through event \(through): \(bytes) bytes in \(ms) ms.")
        case .checked(let check):
            lastCheck = check
            listedAt = Date()
            if checks.checked() { endDailyCheck(.finished) }
            NSLog("Pith: checked \(check.folders) folders in \(check.ms) ms; \(check.corrected) had changed without an event, by \(check.bytes) bytes.")
        case .stats(let line):
            NSLog("Pith: disk map \(line)")
        case .failed(let request, let reason):
            NSLog("Pith: the disk map reported: \(reason)")
            if let request, request == wanted { treeFailed?(reason) }
        case .fatal(let reason):
            state = .failed(reason)
        }
    }

    private func exited(_ status: Int32) {
        if checks.stopped() { endDailyCheck(.deferred) }
        stream?.stop()
        stream = nil
        process = nil
        if let stopped {
            self.stopped = nil
            stopped()
            return
        }
        if state != .off { state = .failed("Pith’s disk map stopped (exit code \(status)). Quit and reopen Pith to start it again.") }
    }

    // MARK: The daily check

    private var checkDone: NSBackgroundActivityScheduler.CompletionHandler?

    /// Lists every folder again once a day, as Apple asks backup software to sweep in full now and then: FSEvents is
    /// a hint, and in research one deletion never arrived. Only on power, and not when macOS asks Pith to wait.
    /// macOS keeps the schedule across launches, so a check that's overdue comes as Pith opens. It keeps it for the
    /// app's bundle ID, the person's Pith's as much as an automated run's, so an automated run schedules none
    /// (`Launch.isAutomated`).
    private func scheduleChecks() {
        guard !Launch.isAutomated else { return }
        let scheduler = NSBackgroundActivityScheduler(identifier: "app.bruhs.pith.disk-check")
        scheduler.repeats = true
        scheduler.interval = Self.checkInterval
        scheduler.tolerance = Self.checkTolerance
        scheduler.qualityOfService = .background
        scheduler.schedule { [weak self] completion in
            Task { @MainActor in
                // Not while the map is made or catches up, which list what changed anyway: macOS asks again later.
                guard let self, case .live = self.state, Self.checkMayRun else { completion(.deferred); return }
                // A walk or a check lists every folder; one within the day leaves a check nothing to find.
                if let listedAt = self.listedAt, Date().timeIntervalSince(listedAt) < Self.checkInterval - Self.checkTolerance {
                    completion(.finished)
                    return
                }
                self.checkDone = completion
                self.checks.askedForDaily()
                self.check()
            }
        }
        checker = scheduler
        schedulesDailyCheck = true
    }

    private static let checkInterval: TimeInterval = 24 * 60 * 60
    private static let checkTolerance: TimeInterval = 4 * 60 * 60

    /// On power, outside Low Power Mode, and not running hot.
    private static var checkMayRun: Bool {
        let info = ProcessInfo.processInfo
        guard !info.isLowPowerModeEnabled, info.thermalState == .nominal || info.thermalState == .fair else { return false }
        return PowerSource.onPower
    }

    /// Tells macOS's scheduler how the daily check it started ended, once: `.finished`, or `.deferred` to ask again later.
    private func endDailyCheck(_ result: NSBackgroundActivityScheduler.Result) {
        checkDone?(result)
        checkDone = nil
    }

    /// The map as Disk shows it: what it's doing, and how many folders macOS is asking about (`LiveMapStatus`).
    var status: LiveMapStatus { LiveMapStatus(activity, asking: asking) }

    /// What the map is doing, as Disk's caption tells it (`DiskCaption.live`).
    private var activity: DiskCaption.Live {
        switch state {
        case .off, .opening, .unmapped: .quiet
        case .mapping(let progress): .mapping(found: progress.map { DiskCaption.Found(bytes: $0.bytes, files: $0.files) })
        case .catchingUp(let waiting): .catchingUp(waiting: waiting)
        case .live(let waiting): .live(waiting: waiting, check: checks.running, updatedAt: updatedAt)
        case .failed(let message): .failed(message)
        }
    }
}

/// Whether the Mac runs on power rather than its battery, from IOKit's power sources.
enum PowerSource {
    static var onPower: Bool {
        guard let blob = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(),
              let type = IOPSGetProvidingPowerSourceType(blob)?.takeUnretainedValue() as String? else { return true }
        return type == kIOPMACPowerKey
    }
}
