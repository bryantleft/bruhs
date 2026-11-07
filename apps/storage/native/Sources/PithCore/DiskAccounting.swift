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

/// Where a volume's used space went, for a scan of a whole volume: what the map shows, what lies on volumes it
/// can't show, and what the walk couldn't measure, with the reasons. It never guesses a number for the last part.
public struct DiskAccounting: Equatable, Sendable {
    /// The disk's used space: its total less what's available, across the APFS container.
    public let used: UInt64
    /// What the map holds.
    public let scanned: UInt64
    /// Volumes in the container that aren't mounted, such as Recovery, so no scan can enter them.
    public let hiddenVolumes: UInt64
    /// Space the scanned volumes use that the walk didn't find: folders it couldn't read, local snapshots, and the
    /// volumes' own bookkeeping. Nil when the walk found more than they use, as APFS clones count once per copy.
    public let notMeasured: UInt64?
    /// What the walk found beyond the volumes' use: clones that share their blocks count once per copy.
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
        self.used = used
        scanned = result.summary.bytes
        hiddenVolumes = used.saturatingSubtract(covered + volumeNodes)
        notMeasured = covered >= walked ? covered - walked : nil
        overcounted = walked.saturatingSubtract(covered)
        unreadableFolders = result.summary.errors
        self.snapshots = snapshots
        self.purgeable = purgeable
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
