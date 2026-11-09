import CoreServices
import Foundation

/// What the scanner's `serve` command reports, one JSON line each (scanner/src/serve.rs).
public enum LiveReport: Sendable {
    case opened(LiveOpened)
    /// A walk's progress: folders listed, the files and bytes found so far, and folders waiting on macOS.
    case progress(dirs: UInt64, files: UInt64, bytes: UInt64, errors: UInt64, asking: Int)
    /// The walk is over but for the folders waiting on macOS, which join the map once the person answers.
    case walked(ms: UInt64, folders: UInt64, files: UInt64, bytes: UInt64, asking: Int)
    case status(LiveStatus)
    /// FSEvents finished replaying what changed while Pith wasn't watching.
    case historyDone
    /// The index can't follow on from here, and only a new walk catches up.
    case rebuild(reason: String)
    /// A map, decoded, with the scanner's own JSON of it, which the disk map's page takes as it is.
    case tree(request: Int, result: DiskResult, json: String)
    case saved(through: UInt64, bytes: UInt64, ms: UInt64)
    case checked(LiveCheck)
    case stats(String)
    case failed(request: Int?, reason: String)
    /// The scanner couldn't run at all.
    case fatal(String)
}

public struct LiveOpened: Sendable, Equatable {
    /// Whether a saved map was read.
    public let restored: Bool
    /// The FSEvents event ID through which every change is in it.
    public let through: UInt64?
    public let savedAt: Date?
    public let folders: UInt64?
    /// Why no saved map was read.
    public let reason: String?
    /// Another copy of Pith keeps the map, so this one won't save it.
    public let locked: Bool

    public init(restored: Bool, through: UInt64?, savedAt: Date?, folders: UInt64?, reason: String?, locked: Bool) {
        self.restored = restored; self.through = through; self.savedAt = savedAt; self.folders = folders; self.reason = reason; self.locked = locked
    }
}

public struct LiveStatus: Sendable, Equatable {
    public let through: UInt64
    /// Folders waiting to be listed again, or being listed.
    public let pending: Int
    /// Something the map shows changed since the last status.
    public let changed: Bool
    public let checking: Bool
    public let historyDone: Bool
    /// Folders waiting for macOS to let Pith read them, as while it asks the person about iCloud Drive, or waiting
    /// behind one that is.
    public let asking: Int

    public init(through: UInt64, pending: Int, changed: Bool, checking: Bool, historyDone: Bool, asking: Int) {
        self.through = through; self.pending = pending; self.changed = changed; self.checking = checking; self.historyDone = historyDone
        self.asking = asking
    }
}

/// What a check of every folder found: how many folders FSEvents hadn't reported changes in, and how many bytes.
public struct LiveCheck: Sendable, Equatable {
    public let folders: UInt64
    public let corrected: UInt64
    public let bytes: UInt64
    public let ms: UInt64
}

public enum LiveDecoder {
    /// The `result` object of a tree line as the scanner wrote it, `{"type":"tree","request":N,"result":{…}}`, so
    /// the page gets the scanner's own JSON rather than Pith encoding the map again: 48 ms on the main thread for the
    /// development Mac's whole disk.
    static func resultJSON(_ line: Data) throws -> String {
        let marker = Data(#","result":"#.utf8)
        guard line.last == UInt8(ascii: "}"), let found = line.range(of: marker) else {
            throw DiskFailure("The scanner sent a map in a shape Pith doesn't know.")
        }
        return String(decoding: line[found.upperBound..<(line.endIndex - 1)], as: UTF8.self)
    }

    public static func decode(_ line: Data) throws -> LiveReport {
        struct Tag: Decodable { let type: String }
        let decoder = JSONDecoder()
        switch try decoder.decode(Tag.self, from: line).type {
        case "opened":
            struct Opened: Decodable { let restored: Bool; let through: UInt64?; let savedAt: UInt64?; let folders: UInt64?; let reason: String?; let locked: Bool? }
            let o = try decoder.decode(Opened.self, from: line)
            return .opened(LiveOpened(restored: o.restored, through: o.through, savedAt: o.savedAt.map { Date(timeIntervalSince1970: TimeInterval($0)) },
                                      folders: o.folders, reason: o.reason, locked: o.locked ?? false))
        case "progress":
            struct Progress: Decodable { let dirs: UInt64; let files: UInt64; let bytes: UInt64; let errors: UInt64; let asking: Int }
            let p = try decoder.decode(Progress.self, from: line)
            return .progress(dirs: p.dirs, files: p.files, bytes: p.bytes, errors: p.errors, asking: p.asking)
        case "walked":
            struct Walked: Decodable { let ms: UInt64; let folders: UInt64; let files: UInt64; let bytes: UInt64; let asking: Int }
            let w = try decoder.decode(Walked.self, from: line)
            return .walked(ms: w.ms, folders: w.folders, files: w.files, bytes: w.bytes, asking: w.asking)
        case "status":
            struct Status: Decodable { let through: UInt64; let pending: Int; let changed: Bool; let checking: Bool; let historyDone: Bool; let asking: Int }
            let s = try decoder.decode(Status.self, from: line)
            return .status(LiveStatus(through: s.through, pending: s.pending, changed: s.changed, checking: s.checking, historyDone: s.historyDone, asking: s.asking))
        case "historyDone":
            return .historyDone
        case "rebuild":
            struct Rebuild: Decodable { let reason: String }
            return .rebuild(reason: try decoder.decode(Rebuild.self, from: line).reason)
        case "tree":
            struct Tree: Decodable { let request: Int; let result: DiskResult }
            let tree = try decoder.decode(Tree.self, from: line)
            try tree.result.validate()
            return .tree(request: tree.request, result: tree.result, json: try resultJSON(line))
        case "saved":
            struct Saved: Decodable { let through: UInt64; let bytes: UInt64; let ms: UInt64 }
            let s = try decoder.decode(Saved.self, from: line)
            return .saved(through: s.through, bytes: s.bytes, ms: s.ms)
        case "checked":
            struct Checked: Decodable { let folders: UInt64; let corrected: UInt64; let bytes: UInt64; let ms: UInt64 }
            let c = try decoder.decode(Checked.self, from: line)
            return .checked(LiveCheck(folders: c.folders, corrected: c.corrected, bytes: c.bytes, ms: c.ms))
        case "stats":
            return .stats(String(decoding: line, as: UTF8.self))
        case "error":
            struct Failure: Decodable { let request: Int?; let reason: String }
            let f = try decoder.decode(Failure.self, from: line)
            return .failed(request: f.request, reason: f.reason)
        case "fatal":
            struct Fatal: Decodable { let reason: String }
            return .fatal(try decoder.decode(Fatal.self, from: line).reason)
        case let other:
            throw DiskFailure("The scanner sent a report Pith doesn't know: \(other).")
        }
    }
}

/// The scanner's `serve` process: commands go in on its stdin, reports come back on its stdout. Reports are decoded
/// off the main thread, a large map included, and handed to `receive` in order.
public final class LiveProcess: @unchecked Sendable {
    private let process = Process()
    private let input = Pipe()
    private let output = Pipe()
    private let writes = DispatchQueue(label: "app.bruhs.pith.live-commands", qos: .utility)
    private let receive: @Sendable (LiveReport) -> Void
    private let exited: @Sendable (Int32) -> Void

    public init(binary: URL, receive: @escaping @Sendable (LiveReport) -> Void, exited: @escaping @Sendable (Int32) -> Void) {
        self.receive = receive
        self.exited = exited
        process.executableURL = binary
        process.arguments = ["serve"]
        // A scanner that exits closes its end of the pipe: writing to it must fail as an error, not kill Pith with
        // SIGPIPE, as an event or command sent before Pith hears of the exit would.
        _ = fcntl(input.fileHandleForWriting.fileDescriptor, F_SETNOSIGPIPE, 1)
        process.standardInput = input
        process.standardOutput = output
        process.standardError = FileHandle.nullDevice
        // Its listings set their own priorities; this is the floor for applying them and answering for the map.
        process.qualityOfService = .utility
    }

    public func start() throws {
        let handle = output.fileHandleForReading
        let receive = receive, exited = exited
        process.terminationHandler = { process in exited(process.terminationStatus) }
        try process.run()
        Thread.detachNewThread {
            var lines = LineSplitter()
            // Each read gets a pool of its own: `availableData` hands back an autoreleased buffer, and this thread's
            // pool would drain only when the thread ends. Every byte the scanner sent stayed, 1.8 GB within half an
            // hour of Disk on screen.
            while autoreleasepool(invoking: { () -> Bool in
                let data = handle.availableData
                if data.isEmpty { return false }
                for line in lines.feed(data) where !line.isEmpty {
                    do { receive(try LiveDecoder.decode(line)) } catch {
                        receive(.failed(request: nil, reason: "Pith couldn’t read the map’s report: \(error.localizedDescription)"))
                    }
                }
                return true
            }) {}
        }
    }

    public var isRunning: Bool { process.isRunning }
    public var pid: Int32 { process.processIdentifier }

    /// Sends one command. Commands go out in the order they're sent, from any thread.
    public func send(_ command: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: command, options: [.withoutEscapingSlashes]) else { return }
        let handle = input.fileHandleForWriting
        writes.async {
            // A scanner that's gone has closed the pipe; what it would have been told no longer matters.
            try? handle.write(contentsOf: data + Data([10]))
        }
    }

    public func open(root: String, snapshot: URL?, volume: String?) {
        send(["cmd": "open", "root": root, "snapshot": snapshot?.path ?? NSNull(), "volume": volume ?? NSNull()])
    }
    public func walk(since: UInt64) { send(["cmd": "walk", "since": since]) }
    public func tree(path: String, focus: String?, request: Int) { send(["cmd": "tree", "path": path, "focus": focus ?? NSNull(), "request": request]) }
    public func relist(path: String, deep: Bool) { send(["cmd": "relist", "path": path, "deep": deep]) }
    public func retryUnreadable() { send(["cmd": "retry"]) }
    public func save() { send(["cmd": "save"]) }
    public func check() { send(["cmd": "check"]) }
    public func keep(snapshot: URL?) { send(["cmd": "keep", "snapshot": snapshot?.path ?? NSNull()]) }
    public func stats() { send(["cmd": "stats"]) }

    public func events(_ events: [LiveStream.Event]) {
        guard !events.isEmpty else { return }
        send(["cmd": "events", "events": events.map { [$0.id, $0.flags, $0.path, $0.inode] as [Any] }])
    }

    /// Closes its stdin, after the commands already sent: it saves the map if it changed, then exits.
    public func close() {
        let handle = input.fileHandleForWriting
        writes.async { try? handle.close() }
    }

    public func terminate() {
        if process.isRunning { process.terminate() }
    }

    /// Waits on the calling thread for the scanner to exit, up to `timeout` seconds; whether it did.
    public func waitUntilExit(timeout: TimeInterval) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while process.isRunning && Date() < deadline { usleep(10_000) }
        return !process.isRunning
    }
}

/// FSEvents for the mapped folder, file by file with each item's inode, delivered on a queue of its own and passed
/// straight on: during a replay of history that's tens of thousands of events a second, which the main thread
/// mustn't carry.
public final class LiveStream: @unchecked Sendable {
    public struct Event: Sendable, Equatable {
        public let id: UInt64
        public let flags: UInt32
        public let path: String
        /// The item's inode, or 0 when FSEvents gives none.
        public let inode: UInt64
    }

    private var stream: FSEventStreamRef?
    private let queue = DispatchQueue(label: "app.bruhs.pith.live-events", qos: .utility)
    private let receive: @Sendable ([Event]) -> Void

    /// Watches `root` from event `since`. With `replay`, it asks for full history: without it FSEvents can skip events
    /// stored near an unclean exit. Nil when FSEvents can't watch it.
    public init?(root: String, since: UInt64, replay: Bool, receive: @escaping @Sendable ([Event]) -> Void) {
        self.receive = receive
        var context = FSEventStreamContext(version: 0, info: Unmanaged.passUnretained(self).toOpaque(), retain: nil, release: nil, copyDescription: nil)
        let callback: FSEventStreamCallback = { _, info, count, paths, flags, ids in
            guard let info else { return }
            let stream = Unmanaged<LiveStream>.fromOpaque(info).takeUnretainedValue()
            let items = unsafeBitCast(paths, to: NSArray.self)
            var events: [Event] = []
            events.reserveCapacity(count)
            for i in 0..<min(count, items.count) {
                guard let item = items[i] as? NSDictionary, let path = item[kFSEventStreamEventExtendedDataPathKey] as? String else { continue }
                let inode = (item[kFSEventStreamEventExtendedFileIDKey] as? NSNumber)?.uint64Value ?? 0
                events.append(Event(id: ids[i], flags: flags[i], path: path, inode: inode))
            }
            stream.receive(events)
        }
        var options = kFSEventStreamCreateFlagUseCFTypes | kFSEventStreamCreateFlagFileEvents | kFSEventStreamCreateFlagUseExtendedData
        if replay { options |= kFSEventStreamCreateFlagFullHistory }
        // A second's latency batches a burst of writes, such as a build, into one delivery; the scanner waits a few
        // more for each folder to settle.
        guard let stream = FSEventStreamCreate(nil, callback, &context, [root] as CFArray, since, 1.0, FSEventStreamCreateFlags(options)) else { return nil }
        FSEventStreamSetDispatchQueue(stream, queue)
        guard FSEventStreamStart(stream) else {
            FSEventStreamInvalidate(stream)
            FSEventStreamRelease(stream)
            return nil
        }
        self.stream = stream
    }

    /// Stops the events. Nothing is delivered after this returns.
    public func stop() {
        queue.sync {
            guard let stream else { return }
            FSEventStreamStop(stream)
            FSEventStreamInvalidate(stream)
            FSEventStreamRelease(stream)
            self.stream = nil
        }
    }

    deinit {
        // A stream outliving its owner would call back into freed memory.
        if let stream {
            FSEventStreamStop(stream)
            FSEventStreamInvalidate(stream)
            FSEventStreamRelease(stream)
        }
    }
}

/// Whether a saved map can catch up from FSEvents' history, or has to be walked again.
public enum LivePlan: Equatable, Sendable {
    case replay(since: UInt64)
    case rebuild(String)

    /// Past this many event IDs a replay costs about what a walk does: 10 million took 40-45 s on the development
    /// Mac, with fseventsd doing most of the work, against 66-73 s for a walk.
    public static let replayLimit: UInt64 = 10_000_000

    /// The plan for a map saved through event `through` at `savedAt`, with FSEvents now at `current`. `historyStart`
    /// is FSEvents' last event before a time, which is 0 when its history doesn't reach back that far.
    public static func after(through: UInt64, savedAt: Date, current: UInt64, historyStart: (Date) -> UInt64) -> LivePlan {
        guard through <= current else { return .rebuild("FSEvents’ event IDs started over since the map was saved.") }
        if current - through > replayLimit { return .rebuild("Too much changed while Pith was closed to catch up quickly.") }
        if historyStart(savedAt) == 0 { return .rebuild("The disk’s history of changes doesn’t reach back to when the map was saved.") }
        return .replay(since: through)
    }

    /// Whether the live map of `mapRoot` holds `path`: inside it and on the same volume. Every folder of the startup
    /// disk reports one device, its system and data volumes alike, where Preboot, VM and other disks report their own,
    /// and the map stops at them, so a folder there is scanned instead.
    public static func holds(_ path: String, mapOf mapRoot: String) -> Bool {
        guard DiskChanges.isInside(path, mapRoot) else { return false }
        var folder = stat(), map = stat()
        return stat(path, &folder) == 0 && stat(mapRoot, &map) == 0 && folder.st_dev == map.st_dev
    }

    /// FSEvents' last event ID before `date` on the volume holding `path`. The time is declared as a CFAbsoluteTime
    /// but read as seconds since 1970: given 2001-based seconds it answers 0 for any time, and Pith would replay
    /// everything fseventsd holds.
    public static func lastEvent(before date: Date, onVolumeOf path: String) -> UInt64 {
        var info = stat()
        guard stat(path, &info) == 0 else { return 0 }
        return FSEventsGetLastEventIdForDeviceBeforeTime(info.st_dev, date.timeIntervalSince1970)
    }
}
