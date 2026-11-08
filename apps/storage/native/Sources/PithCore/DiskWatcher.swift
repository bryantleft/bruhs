import CoreServices
import Foundation

/// Watches a scanned folder with FSEvents, from the event ID a scan began at, so changes made during the scan, or
/// since an earlier launch, still arrive. Events name folders, not files, which is all a map of folder sizes needs,
/// and leave out Pith's own changes, such as its moves to the Trash, which the map already reflects.
public final class DiskWatcher: @unchecked Sendable {
    public struct Event: Sendable, Equatable {
        public let path: String
        public let flags: UInt32
    }

    // Created, started and stopped on the main thread, which also receives the events.
    private var stream: FSEventStreamRef?
    private let receive: @MainActor ([Event]) -> Void

    /// FSEvents' position now, to store with a scan that's about to begin.
    public static var currentEventID: UInt64 { FSEventsGetCurrentEventId() }

    /// The FSEvents UUID of the volume holding `path`. Stored event IDs describe its history only while it stays the same.
    public static func volumeUUID(for path: String) -> String? {
        var info = stat()
        guard stat(path, &info) == 0, let uuid = FSEventsCopyUUIDForDevice(info.st_dev) else { return nil }
        return CFUUIDCreateString(nil, uuid) as String
    }

    /// Starts watching `root`, replaying what changed since `since`. Nil when FSEvents can't watch it.
    @MainActor public init?(root: String, since: UInt64, receive: @escaping @MainActor ([Event]) -> Void) {
        self.receive = receive
        var context = FSEventStreamContext(version: 0, info: Unmanaged.passUnretained(self).toOpaque(), retain: nil, release: nil, copyDescription: nil)
        let callback: FSEventStreamCallback = { _, info, count, paths, flags, _ in
            guard let info else { return }
            let watcher = Unmanaged<DiskWatcher>.fromOpaque(info).takeUnretainedValue()
            let names = unsafeBitCast(paths, to: NSArray.self) as? [String] ?? []
            let events = (0..<min(count, names.count)).map { Event(path: names[$0], flags: flags[$0]) }
            MainActor.assumeIsolated { watcher.receive(events) }
        }
        let options = FSEventStreamCreateFlags(kFSEventStreamCreateFlagUseCFTypes | kFSEventStreamCreateFlagWatchRoot | kFSEventStreamCreateFlagIgnoreSelf)
        // A second's latency batches a burst of writes, such as a build, into one delivery.
        guard let stream = FSEventStreamCreate(nil, callback, &context, [root] as CFArray, since, 1.0, options) else { return nil }
        FSEventStreamSetDispatchQueue(stream, .main)
        guard FSEventStreamStart(stream) else {
            FSEventStreamInvalidate(stream)
            FSEventStreamRelease(stream)
            return nil
        }
        self.stream = stream
    }

    /// Stops the events. The watcher delivers nothing after this.
    @MainActor public func stop() {
        guard let stream else { return }
        FSEventStreamStop(stream)
        FSEventStreamInvalidate(stream)
        FSEventStreamRelease(stream)
        self.stream = nil
    }

    deinit {
        // A stream outliving its watcher would call back into freed memory.
        if let stream {
            FSEventStreamStop(stream)
            FSEventStreamInvalidate(stream)
            FSEventStreamRelease(stream)
        }
    }
}
