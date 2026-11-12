import Darwin
import DiskArbitration
import Foundation

/// The file systems mounted on this Mac, as the kernel's mount table lists them: each one's mount point, what it's
/// mounted from and whether the kernel marks it local, with what DiskArbitration says of the disk it's on. Reading the
/// table asks no file system, a network one included (`MNT_NOWAIT`), as the scanner reads it (scanner/src/volumes.rs).
/// Pith looks an app's icon up by its bundle's path only on the startup disk, and a volume's own icon only where macOS
/// doesn't guard the volume (`guards`) or while Pith has Full Disk Access, and the table says both without touching
/// anything on a volume.
public struct MountTable: Sendable, Equatable {
    public struct Mount: Sendable, Equatable {
        /// Where it's mounted.
        public let path: String
        /// What it's mounted from, such as "/dev/disk3s5", "map auto_home" or "//me@nas.local/share".
        public let from: String
        /// The kernel marks the file system local (`MNT_LOCAL`), as a network volume or an automount it isn't.
        public let isLocal: Bool
        /// Whether DiskArbitration says the disk it's mounted from is internal (`MountTable.diskArbitrationDescribes`).
        /// Nil where it doesn't say, as of a disk image, which it describes with no word of where it's attached, or a disk
        /// it hasn't described yet, and for a file system mounted from no disk.
        public let isInternal: Bool?

        public init(path: String, from: String, isLocal: Bool = true, isInternal: Bool? = nil) {
            self.path = path; self.from = from; self.isLocal = isLocal; self.isInternal = isInternal
        }
    }

    public let mounts: [Mount]

    public init(_ mounts: [Mount]) { self.mounts = mounts }

    /// The table as it is now, read from the kernel again at every call. Asking no file system, a read takes a few
    /// microseconds. A table kept until the number of file systems changed went stale when one disk was ejected and
    /// another mounted between two calls, and an app on the new disk counted as on the startup disk.
    public static func current() -> MountTable { kernel.current() }

    /// What DiskArbitration's description of a disk says of where it's attached: whether it's internal, or nil where the
    /// description has no word of it, as a disk image's hasn't.
    struct Described: Sendable, Equatable {
        let isInternal: Bool?
    }

    /// Reads the kernel's table through `fsstat`, which is `getfsstat` but in a test, every time it's asked, and asks
    /// `describe`, which is DiskArbitration but in a test, for each disk a file system is mounted from, by its BSD name:
    /// once for each disk while the table reads as it did, and again for all of them once it doesn't, as when one disk is
    /// ejected and another mounted. A disk it has no description of yet, as one the kernel lists before diskarbitrationd
    /// has described it, has no answer, so it's guarded, and is asked about again at the next read rather than kept
    /// guarded until the table changes. 56 µs a disk, median of 11 on the development Mac (VERIFICATION.md).
    final class Reader: @unchecked Sendable {
        let fsstat: @Sendable (UnsafeMutablePointer<statfs>?, Int32, Int32) -> Int32
        let describe: @Sendable (String) -> Described?
        private let lock = NSLock()
        /// The table as the kernel gave it last, and what `describe` said of each of its disks it described.
        private var read: [Mount] = []
        private var said: [String: Described] = [:]

        init(fsstat: @escaping @Sendable (UnsafeMutablePointer<statfs>?, Int32, Int32) -> Int32, describe: @escaping @Sendable (String) -> Described?) {
            self.fsstat = fsstat
            self.describe = describe
        }

        func current() -> MountTable {
            let kernel = MountTable.read(fsstat).mounts
            lock.lock()
            defer { lock.unlock() }
            if kernel != read {
                read = kernel
                said = [:]
            }
            return MountTable(kernel.map { mount in
                guard mount.from.hasPrefix("/dev/disk") else { return mount }
                let disk = String(mount.from.dropFirst("/dev/".count))
                var described = said[disk]
                if described == nil {
                    described = describe(disk)
                    if let described { said[disk] = described }
                }
                return Mount(path: mount.path, from: mount.from, isLocal: mount.isLocal, isInternal: described?.isInternal)
            })
        }
    }

    private static let kernel = Reader(fsstat: { getfsstat($0, $1, $2) }, describe: diskArbitrationDescribes)

    /// What DiskArbitration says of the disk `bsdName` names, such as "disk4s1": whether it's internal, with no word of it
    /// for a disk image, which it describes without saying where it's attached; or nil when it has no description of the
    /// disk, as of one it doesn't know or hasn't described yet. Its description is what diskarbitrationd recorded of the
    /// device when it appeared, from IOKit's registry: the media and the interconnect the device is attached by. Asking
    /// for it is a message to that daemon, which opens nothing on any volume, and macOS asks its question about a volume
    /// only when something on it is accessed.
    static func diskArbitrationDescribes(_ bsdName: String) -> Described? {
        guard let session = DASessionCreate(kCFAllocatorDefault), let disk = DADiskCreateFromBSDName(kCFAllocatorDefault, session, bsdName),
              let description = DADiskCopyDescription(disk) as? [CFString: Any] else { return nil }
        return Described(isInternal: description[kDADiskDescriptionDeviceInternalKey] as? Bool)
    }

    /// Whether macOS guards the volume `path` lies on, the file system mounted deepest above it: a network volume, which
    /// the kernel doesn't mark local, the home automount and other automounts among them, or one on a disk DiskArbitration
    /// doesn't say is internal, a removable or external disk or a disk image. The startup disk's container isn't, external
    /// or not, nor is an internal disk of another container. With nothing in the table above `path`, it is.
    public func guards(_ path: String) -> Bool {
        guard let mount = mount(holding: path) else { return true }
        if isOnStartupDisk(path) { return false }
        return !(mount.isLocal && mount.isInternal == true)
    }

    /// Whether a map of `root` holds `path`: it lies inside `root` and on the volume the map shows, the file system mounted
    /// deepest above `root` itself. Being inside `root` alone doesn't say so, since every path is inside `/`: the scan
    /// stops at a volume mounted inside the map, another disk at /Volumes or the home automount, and shows the startup
    /// disk's data volume at its firmlinked paths, /Users and the rest, never at /System/Volumes/Data. Undo puts an item
    /// back on the map open then, and the live map lists a changed folder again, only where the map holds it. The table
    /// says so without touching anything on either volume. With nothing in the table above them, it holds nothing.
    public func mapOf(_ root: String, holds path: String) -> Bool {
        guard DiskChanges.isInside(path, root), let volume = mount(holding: root) else { return false }
        return mount(holding: path) == volume
    }

    /// The file system mounted deepest above `path`.
    private func mount(holding path: String) -> Mount? {
        mounts.filter { DiskChanges.isInside(path, $0.path) }.max { $0.path.utf8.count < $1.path.utf8.count }
    }

    /// Whether `path` lies on the startup disk: the file system mounted deepest above it is in the APFS container that
    /// `/` is mounted from, as the startup disk's system and data volumes, Preboot and VM are. Another disk, a disk image,
    /// a network share or the home automount is mounted from elsewhere.
    public func isOnStartupDisk(_ path: String) -> Bool {
        guard let startup = mounts.first(where: { $0.path == "/" }).flatMap({ Self.container(of: $0.from) }) else { return false }
        return mount(holding: path).flatMap { Self.container(of: $0.from) } == startup
    }

    /// The disk a `/dev/diskNsM…` device belongs to, such as "disk3": APFS volumes in one container share it.
    static func container(of device: String) -> String? {
        guard device.hasPrefix("/dev/disk") else { return nil }
        let digits = device.dropFirst("/dev/disk".count).prefix { $0.isASCII && $0.isNumber }
        return digits.isEmpty ? nil : "disk" + digits
    }

    /// The kernel's table, with room for a few more file systems in case some mount meanwhile.
    fileprivate static func read(_ fsstat: (UnsafeMutablePointer<statfs>?, Int32, Int32) -> Int32) -> MountTable {
        let count = fsstat(nil, 0, MNT_NOWAIT)
        guard count > 0 else { return MountTable([]) }
        var table: [statfs] = Array(repeating: statfs(), count: Int(count) + 4)
        let read = table.withUnsafeMutableBufferPointer { buffer in
            fsstat(buffer.baseAddress, Int32(MemoryLayout<statfs>.stride * buffer.count), MNT_NOWAIT)
        }
        return MountTable(table.prefix(Int(max(0, read))).map { system in
            Mount(path: Self.string(system.f_mntonname), from: Self.string(system.f_mntfromname), isLocal: system.f_flags & UInt32(MNT_LOCAL) != 0)
        })
    }

    private static func string<T>(_ characters: T) -> String {
        withUnsafeBytes(of: characters) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
    }
}

/// Which of the volumes mounted macOS guards, worked out from one reading of the mount table (`MountTable.guards`), which
/// Pith's icon rule goes by (`KnownPlaces.guardingVolumes`). Pith works it out off the main thread and keeps it until the
/// table changes, since the rule is built with every icon: reading the table and working it out for each of the icon
/// route's requests made a request 0.065 ms (median) on the development Mac, against 0.022 ms with the answer kept, and
/// the first reading after a change asks DiskArbitration about each disk, one blocking call at a time, 2.1 ms there for
/// 11 disks, which a busy or stuck diskarbitrationd would hold (VERIFICATION.md).
public struct GuardedVolumes: Sendable, Equatable {
    /// The table it was worked out from.
    public let table: MountTable
    /// The roots of the volumes macOS guards, in the table's order.
    public let roots: [String]
    /// The root of every volume in the table.
    private let mounted: Set<String>

    public init(_ table: MountTable) {
        self.table = table
        roots = table.mounts.map(\.path).filter(table.guards)
        mounted = Set(table.mounts.map(\.path))
    }

    /// Whether the table had a volume mounted at `root`.
    public func knows(_ root: String) -> Bool { mounted.contains(root) }
}
