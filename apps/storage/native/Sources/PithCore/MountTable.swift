import Darwin
import Foundation

/// The file systems mounted on this Mac, as the kernel's mount table lists them: each one's mount point and what it's
/// mounted from. Reading the table asks no file system, a network one included (`MNT_NOWAIT`), as the scanner reads it
/// (scanner/src/volumes.rs). Pith looks an app's icon up by its bundle's path only on the startup disk, and draws a
/// volume on another disk by its type while it hasn't Full Disk Access, since macOS guards removable and network
/// volumes, and the table says which disk a path is on without touching it.
public struct MountTable: Sendable, Equatable {
    public struct Mount: Sendable, Equatable {
        /// Where it's mounted.
        public let path: String
        /// What it's mounted from, such as "/dev/disk3s5", "map auto_home" or "//me@nas.local/share".
        public let from: String

        public init(path: String, from: String) { self.path = path; self.from = from }
    }

    public let mounts: [Mount]

    public init(_ mounts: [Mount]) { self.mounts = mounts }

    /// The table as it is now, read from the kernel again at every call. Asking no file system, a read takes a few
    /// microseconds. A table kept until the number of file systems changed went stale when one disk was ejected and
    /// another mounted between two calls, and an app on the new disk counted as on the startup disk.
    public static func current() -> MountTable { kernel.current() }

    /// Reads the kernel's table through `fsstat`, which is `getfsstat` but in a test, every time it's asked.
    struct Reader: Sendable {
        let fsstat: @Sendable (UnsafeMutablePointer<statfs>?, Int32, Int32) -> Int32

        func current() -> MountTable { MountTable.read(fsstat) }
    }

    private static let kernel = Reader { getfsstat($0, $1, $2) }

    /// Whether `path` lies on the startup disk: the file system mounted deepest above it is in the APFS container that
    /// `/` is mounted from, as the startup disk's system and data volumes, Preboot and VM are. Another disk, a disk image,
    /// a network share or the home automount is mounted from elsewhere.
    public func isOnStartupDisk(_ path: String) -> Bool {
        guard let startup = mounts.first(where: { $0.path == "/" }).flatMap({ Self.container(of: $0.from) }) else { return false }
        let under = mounts.filter { DiskChanges.isInside(path, $0.path) }.max { $0.path.utf8.count < $1.path.utf8.count }
        return under.flatMap { Self.container(of: $0.from) } == startup
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
            Mount(path: Self.string(system.f_mntonname), from: Self.string(system.f_mntfromname))
        })
    }

    private static func string<T>(_ characters: T) -> String {
        withUnsafeBytes(of: characters) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
    }
}
