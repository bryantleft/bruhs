import XCTest
@testable import PithCore

/// Which disk a path lies on, from the kernel's mount table alone. Pith looks an app's icon up by its bundle's path only
/// on the startup disk, since macOS guards removable and network volumes too.
final class MountTableTests: XCTestCase {
    /// A Mac's table as `mount` lists it on Apple silicon, with another disk, a share, the home automount and a disk
    /// image beside the startup disk's volumes.
    static let table = MountTable([
        .init(path: "/", from: "/dev/disk3s1s1"),
        .init(path: "/dev", from: "devfs"),
        .init(path: "/System/Volumes/VM", from: "/dev/disk3s6"),
        .init(path: "/System/Volumes/Preboot", from: "/dev/disk3s2"),
        .init(path: "/System/Volumes/xarts", from: "/dev/disk1s2"),
        .init(path: "/System/Volumes/Data", from: "/dev/disk3s5"),
        .init(path: "/System/Volumes/Data/home", from: "map auto_home"),
        .init(path: "/Volumes/Archive", from: "/dev/disk4s1"),
        .init(path: "/Volumes/share", from: "//me@nas.local/share"),
        .init(path: "/Volumes/Installer", from: "/dev/disk12s1"),
    ])

    func testTheStartupDisksOwnVolumesAreOnIt() {
        for path in ["/", "/Applications/Xcode.app", "/System/Applications/Mail.app", "/System/Library/CoreServices/Finder.app",
                     "/System/Volumes/Preboot/Cryptexes/App/System/Applications/Safari.app", "/System/Volumes/Data/Applications/Pith.app",
                     "/Users/tester/Applications/Tool.app", "/Volumes/ArchiveOld/Tool.app"] {
            XCTAssertTrue(Self.table.isOnStartupDisk(path), path)
        }
    }

    func testAnotherDiskAShareAnAutomountOrADiskImageIsnt() {
        for path in ["/Volumes/Archive", "/Volumes/Archive/Tool.app", "/Volumes/share/Apps/Tool.app", "/System/Volumes/Data/home/tester/Tool.app",
                     "/Volumes/Installer/Install.app", "/System/Volumes/xarts/Thing.app", "/dev/fd"] {
            XCTAssertFalse(Self.table.isOnStartupDisk(path), path)
        }
    }

    func testWithoutTheStartupDiskInTheTableNothingIsOnIt() {
        XCTAssertFalse(MountTable([]).isOnStartupDisk("/Applications/Xcode.app"))
        XCTAssertFalse(MountTable([.init(path: "/", from: "map -hosts")]).isOnStartupDisk("/Applications/Xcode.app"))
    }

    func testThisMacsTableHasTheStartupDisk() {
        let table = MountTable.current()
        XCTAssertTrue(table.mounts.contains { $0.path == "/" })
        XCTAssertTrue(table.isOnStartupDisk("/System/Applications"))
        XCTAssertTrue(table.isOnStartupDisk(NSTemporaryDirectory()))
    }

    /// One disk ejected and another mounted where it was, between two looks, leave as many file systems mounted as
    /// before: the table is read again at every look, so an app on the new disk never counts as on the startup disk.
    func testAnEjectAndAMountBetweenTwoLooksAreBothSeen() {
        let startup: [MountTable.Mount] = [.init(path: "/", from: "/dev/disk3s1s1"), .init(path: "/System/Volumes/Data", from: "/dev/disk3s5")]
        let kernel = Kernel(startup + [.init(path: "/Volumes/Fast", from: "/dev/disk3s7")])
        let reader = MountTable.Reader { kernel.fsstat($0, $1, $2) }
        XCTAssertTrue(reader.current().isOnStartupDisk("/Volumes/Fast/Xcode.app"), "a volume of the startup disk's own container")
        kernel.mounts = startup + [.init(path: "/Volumes/Fast", from: "/dev/disk5s1")]
        XCTAssertFalse(reader.current().isOnStartupDisk("/Volumes/Fast/Xcode.app"), "another disk, mounted where it was")
        kernel.mounts = startup
        XCTAssertEqual(reader.current(), MountTable(startup), "and ejected")
    }

    /// The kernel's `getfsstat` as a test stands in for it: the mounts it holds now, written as the kernel writes them.
    private final class Kernel: @unchecked Sendable {
        private let lock = NSLock()
        private var mounted: [MountTable.Mount]

        init(_ mounts: [MountTable.Mount]) { mounted = mounts }

        var mounts: [MountTable.Mount] {
            get { lock.lock(); defer { lock.unlock() }; return mounted }
            set { lock.lock(); mounted = newValue; lock.unlock() }
        }

        func fsstat(_ buffer: UnsafeMutablePointer<statfs>?, _ size: Int32, _ flags: Int32) -> Int32 {
            let mounts = self.mounts
            guard let buffer else { return Int32(mounts.count) }
            let room = Int(size) / MemoryLayout<statfs>.stride
            for (index, mount) in mounts.prefix(room).enumerated() {
                var entry = statfs()
                Self.write(mount.path, into: &entry.f_mntonname)
                Self.write(mount.from, into: &entry.f_mntfromname)
                buffer[index] = entry
            }
            return Int32(min(room, mounts.count))
        }

        private static func write<Field>(_ text: String, into field: inout Field) {
            withUnsafeMutableBytes(of: &field) { raw in
                let bytes = Array(text.utf8.prefix(raw.count - 1))
                raw.copyBytes(from: bytes)
                raw[bytes.count] = 0
            }
        }
    }
}
