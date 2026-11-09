import Foundation

/// Folders that changed after a scan, as FSEvents reports them, and what to scan again to catch up. FSEvents reports
/// a folder when entries directly in it change, and a whole subtree when it lost track of the detail.
public struct DiskChanges: Codable, Equatable, Sendable {
    /// Folders whose own entries changed, by path without a trailing slash.
    public private(set) var folders: Set<String> = []
    /// Folders anything inside of which may have changed.
    public private(set) var subtrees: Set<String> = []
    /// Events were lost, their IDs restarted, or the scanned folder itself moved: anything may have changed, and only
    /// a full scan catches up.
    public private(set) var everything = false

    public init() {}

    public var isEmpty: Bool { folders.isEmpty && subtrees.isEmpty && !everything }

    /// How many folders changed, when that's known.
    public var count: Int { folders.union(subtrees).count }

    /// The `FSEventStreamEventFlags` these depend on (`<CoreServices/FSEvents.h>`).
    public enum Flag {
        public static let mustScanSubDirs: UInt32 = 0x0000_0001
        public static let userDropped: UInt32 = 0x0000_0002
        public static let kernelDropped: UInt32 = 0x0000_0004
        public static let eventIdsWrapped: UInt32 = 0x0000_0008
        public static let historyDone: UInt32 = 0x0000_0010
        public static let rootChanged: UInt32 = 0x0000_0020
    }

    /// Past this many changed folders, only a full scan catches up anyway, so the list stops growing. A day of a whole
    /// disk's history can name hundreds of thousands.
    public static let limit = 5_000

    /// Notes one event for a scan of `root`.
    public mutating func note(_ path: String, flags: UInt32, root: String) {
        guard !everything else { return }
        if flags & (Flag.userDropped | Flag.kernelDropped | Flag.eventIdsWrapped | Flag.rootChanged) != 0 {
            markEverything()
            return
        }
        // The marker that a replay of past events is done names the root; nothing changed there.
        if flags & Flag.historyDone != 0 { return }
        guard let folder = Self.folder(path, root: root) else { return }
        if flags & Flag.mustScanSubDirs != 0 { subtrees.insert(folder) } else { folders.insert(folder) }
        if folders.count + subtrees.count > Self.limit { markEverything() }
    }

    /// Marks the whole scan out of date, as when the volume's event history doesn't cover it.
    public mutating func markEverything() {
        everything = true
        folders = []
        subtrees = []
    }

    /// Forgets what changed at or inside `folder`, which a new scan of it covers.
    public mutating func clear(inside folder: String) {
        let inside = { (path: String) in Self.isInside(path, folder) }
        folders = folders.filter { !inside($0) }
        subtrees = subtrees.filter { !inside($0) }
    }

    /// Adds what `other` noted, for a scan of a folder that failed after its changes were cleared.
    public mutating func merge(_ other: DiskChanges) {
        folders.formUnion(other.folders)
        subtrees.formUnion(other.subtrees)
        everything = everything || other.everything
    }

    /// Whether the item at `path` may have changed size: something inside it changed, or a subtree around it did.
    public func touches(_ path: String) -> Bool {
        everything
            || folders.contains { Self.isInside($0, path) }
            || subtrees.contains { Self.isInside($0, path) || Self.isInside(path, $0) }
    }

    /// The fewest folders of `result`'s map to scan again: each change's nearest folder on the map, none inside another.
    /// Nil when only a full scan catches up: events were lost, the root changed, or more than `limit` folders did.
    public func refreshTargets(in result: DiskResult, limit: Int = 24) -> [String]? {
        guard !everything else { return nil }
        let root = result.root.path
        let mapped = Set(result.root.entries.lazy.filter { $0.kind == .dir }.map(\.path))
        var targets = Set<String>()
        for changed in folders.union(subtrees) {
            var folder = changed
            // A folder the map folded into a group of smaller items is scanned through the nearest folder it shows.
            while folder != root, !mapped.contains(folder) {
                let parent = (folder as NSString).deletingLastPathComponent
                guard parent != folder, Self.isInside(parent, root) else { folder = root; break }
                folder = parent
            }
            targets.insert(folder)
        }
        if targets.contains(root) { return nil }
        let outermost = targets.filter { target in !targets.contains { $0 != target && Self.isInside(target, $0) } }
        return outermost.count > limit ? nil : outermost.sorted()
    }

    /// `path` as a folder of the scan of `root`, or nil when it's outside. FSEvents names a folder with a trailing slash,
    /// and the startup disk's data volume at its visible paths, so a scan of `/System/Volumes/Data` gets those mapped back.
    static func folder(_ path: String, root: String) -> String? {
        var folder = path.count > 1 && path.hasSuffix("/") ? String(path.dropLast()) : path
        if !isInside(folder, root), root.hasPrefix(dataVolume + "/") || root == dataVolume {
            folder = dataVolume + folder
        }
        // FSEvents names /tmp and /var by their real /private paths, which Foundation's symlink resolution drops.
        if !isInside(folder, root), folder.hasPrefix("/private/"), !root.hasPrefix("/private/") {
            folder = String(folder.dropFirst("/private".count))
        }
        return isInside(folder, root) ? folder : nil
    }

    static let dataVolume = "/System/Volumes/Data"

    /// Whether `path` is `folder` or inside it.
    public static func isInside(_ path: String, _ folder: String) -> Bool {
        path == folder || folder == "/" || path.hasPrefix(folder + "/")
    }
}
