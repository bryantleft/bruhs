import Foundation

/// A volume's own used space. `statfs` can't give it: APFS volumes in one container report the container's blocks.
/// `df` reads this attribute too.
public enum VolumeSpace {
    public static func used(_ path: String) -> UInt64? {
        var list = attrlist()
        list.bitmapcount = u_short(ATTR_BIT_MAP_COUNT)
        list.volattr = attrgroup_t(ATTR_VOL_INFO) | attrgroup_t(ATTR_VOL_SPACEUSED)
        var buffer = (UInt32(0), UInt32(0), UInt32(0))
        let status = withUnsafeMutableBytes(of: &buffer) { getattrlist(path, &list, $0.baseAddress, $0.count, 0) }
        guard status == 0 else { return nil }
        // A u32 length, then the off_t, packed on a 4-byte boundary.
        let used = UInt64(buffer.1) | UInt64(buffer.2) << 32
        return Int64(bitPattern: used) > 0 ? used : nil
    }
}

/// A whole volume's own figures, which a map of it is accounted with (`DiskAccounting.init(_:result:)`). The file system
/// gives its space (`Space`) at once, so the live map measures that again with every map it shows. The snapshots, from
/// `tmutil`, and what's purgeable take longer to learn, so they're measured now and then, off the main thread. A move
/// within the volume, as to its Trash and back, changes none of them.
public struct VolumeUse: Equatable, Sendable {
    /// A volume's space, which `statfs` and `getattrlist` give at once.
    public struct Space: Equatable, Sendable {
        /// The container's used space: its total less what's available.
        public let used: UInt64
        /// The used space of each volume a walk of the root enters (`DiskAccounting.walkedVolumes`).
        public let walkedVolumes: [UInt64]

        public init(used: UInt64, walkedVolumes: [UInt64]) {
            self.used = used; self.walkedVolumes = walkedVolumes
        }
    }

    /// The container's used space: its total less what's available.
    public let used: UInt64
    /// The used space of each volume a walk of the root enters (`DiskAccounting.walkedVolumes`).
    public let walkedVolumes: [UInt64]
    /// Local Time Machine snapshots on the disk; nil when Pith couldn't list them.
    public let snapshots: Int?
    /// Space macOS can free when it needs room; nil when macOS didn't say.
    public let purgeable: UInt64?

    public init(used: UInt64, walkedVolumes: [UInt64], snapshots: Int?, purgeable: UInt64?) {
        self.used = used; self.walkedVolumes = walkedVolumes; self.snapshots = snapshots; self.purgeable = purgeable
    }

    public init(_ space: Space, snapshots: Int?, purgeable: UInt64?) {
        self.init(used: space.used, walkedVolumes: space.walkedVolumes, snapshots: snapshots, purgeable: purgeable)
    }

    /// These figures with the volume's space measured again: what's written or deleted outside Pith moves the used
    /// space with the map, and leaves Not measured to what the map can't see. The snapshots and what's purgeable wait
    /// for their own next measure.
    public func with(_ space: Space) -> VolumeUse {
        VolumeUse(space, snapshots: snapshots, purgeable: purgeable)
    }
}

/// Where a volume's used space went, for a scan of a whole volume: what the map shows, what lies on volumes it
/// can't show, and what the walk couldn't measure, with the reasons. It never guesses a number for the last part.
public struct DiskAccounting: Equatable, Sendable {
    /// The root of the map it accounts for: the volume's own, where it's mounted.
    public let root: String
    /// The disk's used space: its total less what's available, across the APFS container.
    public let used: UInt64
    /// What the map holds.
    public let scanned: UInt64
    /// Volumes in the container that aren't mounted, such as Recovery, so no scan can enter them.
    public let hiddenVolumes: UInt64
    /// Space the scanned volumes use that the walk didn't find: folders it couldn't read, local snapshots, and the
    /// volumes' own bookkeeping. Nil when the walk found more than they use, as changed APFS clones count once per copy.
    public let notMeasured: UInt64?
    /// What the walk found beyond the volumes' use. The scan counts a full clone's blocks once, but a clone changed
    /// since it was made still shares some of them, and those count at every copy.
    public let overcounted: UInt64
    public let unreadableFolders: UInt64
    /// Local Time Machine snapshots on the disk; nil when Pith couldn't list them.
    public let snapshots: Int?
    /// Space macOS can free when it needs room, such as caches and snapshots; nil when macOS didn't say.
    public let purgeable: UInt64?

    /// - Parameters:
    ///   - used: the container's used space.
    ///   - walkedVolumes: the used space of each volume the walk entered: the startup disk's system and data
    ///     volumes, or a single volume.
    ///   - result: the scan, whose volume nodes that share the disk count as scanned.
    public init(used: UInt64, walkedVolumes: [UInt64], result: DiskResult, snapshots: Int?, purgeable: UInt64?) {
        let volumeNodes = result.volumes.filter(\.sharesDisk).reduce(0) { $0 + $1.bytes }
        let walked = result.summary.bytes.saturatingSubtract(volumeNodes)
        let covered = walkedVolumes.reduce(0, +)
        root = result.root.path
        self.used = used
        scanned = result.summary.bytes
        hiddenVolumes = used.saturatingSubtract(covered + volumeNodes)
        notMeasured = covered >= walked ? covered - walked : nil
        overcounted = walked.saturatingSubtract(covered)
        unreadableFolders = result.summary.errors
        self.snapshots = snapshots
        self.purgeable = purgeable
    }

    /// Where `use`'s space went for `result`, the map of its volume as it is now: what the map loses, as to Move to Trash
    /// when the map can't read the Trash, joins Not measured at once, and comes back with Undo.
    public init(_ use: VolumeUse, result: DiskResult) {
        self.init(used: use.used, walkedVolumes: use.walkedVolumes, result: result, snapshots: use.snapshots, purgeable: use.purgeable)
    }

    /// The volumes a scan of `root` walks, when `root` is a volume's root: the startup disk walks its data volume
    /// through firmlinks too. Nil for a folder, whose share of its volume nothing can account for.
    public static func walkedVolumes(root: String, mountPoint: String?) -> [String]? {
        guard let mountPoint, mountPoint == root else { return nil }
        return root == "/" ? ["/", "/System/Volumes/Data"] : [root]
    }

    /// Local snapshot names from `tmutil listlocalsnapshots`, one per line after its header.
    public static func snapshotCount(tmutilOutput: String) -> Int {
        tmutilOutput.split(separator: "\n").filter { $0.hasPrefix("com.apple.") }.count
    }
}
