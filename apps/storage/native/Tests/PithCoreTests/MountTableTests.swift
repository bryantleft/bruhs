import XCTest
@testable import PithCore

/// Which disk a path lies on, from the kernel's mount table alone, and which volumes macOS guards, from the table and
/// what DiskArbitration says of each disk. Pith looks an app's icon up by its bundle's path only on the startup disk,
/// and a volume's own icon only where macOS doesn't guard it, or while Pith has Full Disk Access.
final class MountTableTests: XCTestCase {
    /// A Mac's table as `mount` lists it on Apple silicon, with another disk, a share, the home automount and a disk
    /// image beside the startup disk's volumes and the internal system container's, as DiskArbitration describes each.
    static let table = MountTable([
        .init(path: "/", from: "/dev/disk3s1s1", isInternal: true),
        .init(path: "/dev", from: "devfs"),
        .init(path: "/System/Volumes/VM", from: "/dev/disk3s6", isInternal: true),
        .init(path: "/System/Volumes/Preboot", from: "/dev/disk3s2", isInternal: true),
        .init(path: "/System/Volumes/xarts", from: "/dev/disk1s2", isInternal: true),
        .init(path: "/System/Volumes/Data", from: "/dev/disk3s5", isInternal: true),
        .init(path: "/System/Volumes/Data/home", from: "map auto_home", isLocal: false),
        .init(path: "/Volumes/Archive", from: "/dev/disk4s1", isInternal: false),
        .init(path: "/Volumes/share", from: "//me@nas.local/share", isLocal: false),
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

    /// macOS guards a network volume, which the kernel doesn't mark local, the home automount and other automounts among
    /// them, and a volume on a disk DiskArbitration doesn't say is internal: a removable or external one, or a disk
    /// image, which it describes with no word of where it's attached. The startup disk's container keeps its own icons,
    /// as does an internal disk of another container, and the startup disk does even when it's external. A file system
    /// mounted from no disk that the kernel marks local, such as devfs, has no word from DiskArbitration either.
    func testWhichVolumesMacOSGuardsComesFromTheTableAndDiskArbitration() {
        let table = MountTable(Self.table.mounts + [.init(path: "/Volumes/Second", from: "/dev/disk6s1", isInternal: true)])
        for path in ["/", "/System/Volumes/Data", "/System/Volumes/Preboot", "/Applications", "/System/Volumes/xarts", "/Volumes/Second", "/Volumes/Second/Projects"] {
            XCTAssertFalse(table.guards(path), path)
        }
        for path in ["/Volumes/Archive", "/Volumes/Archive/Photos", "/Volumes/Installer", "/Volumes/share", "/System/Volumes/Data/home", "/System/Volumes/Data/home/tester", "/dev"] {
            XCTAssertTrue(table.guards(path), path)
        }
        let external = MountTable([.init(path: "/", from: "/dev/disk8s1s1", isInternal: false), .init(path: "/System/Volumes/Data", from: "/dev/disk8s5", isInternal: false)])
        XCTAssertFalse(external.guards("/"), "the startup disk, external")
        XCTAssertFalse(external.guards("/System/Volumes/Data"))
        XCTAssertTrue(MountTable([]).guards("/Volumes/Archive"), "with nothing in the table to say, guarded")
    }

    /// The reader marks each file system local as the kernel does, and asks DiskArbitration about each disk a file system
    /// is mounted from, by its BSD name, once while the table stays as it was, and again once it changes, as when one
    /// disk is ejected and another mounted where it was. A file system mounted from no disk is never asked about.
    func testTheReaderAsksAboutEachDiskOnceWhileTheTableStays() {
        let said: [String: Bool] = ["disk3s1s1": true, "disk3s5": true, "disk4s1": false]
        let asked = Asked()
        let kernel = Kernel([.init(path: "/", from: "/dev/disk3s1s1"), .init(path: "/dev", from: "devfs"), .init(path: "/System/Volumes/Data", from: "/dev/disk3s5"),
                             .init(path: "/Volumes/share", from: "//me@nas.local/share", isLocal: false), .init(path: "/Volumes/Archive", from: "/dev/disk4s1"),
                             .init(path: "/Volumes/Installer", from: "/dev/disk12s1")])
        let reader = MountTable.Reader(fsstat: { kernel.fsstat($0, $1, $2) }) { disk in asked.add(disk); return said[disk] }
        let first = reader.current()
        XCTAssertEqual(first.mounts.map(\.isLocal), [true, true, true, false, true, true])
        XCTAssertEqual(first.mounts.map(\.isInternal), [true, nil, true, nil, false, nil])
        XCTAssertEqual(reader.current(), first)
        XCTAssertEqual(asked.disks, ["disk3s1s1", "disk3s5", "disk4s1", "disk12s1"], "once for each disk, and never for devfs or the share")
        kernel.mounts = kernel.mounts.dropLast(2) + [.init(path: "/Volumes/Archive", from: "/dev/disk5s1")]
        XCTAssertNil(reader.current().mounts.last?.isInternal, "another disk where the first was")
        XCTAssertEqual(asked.disks.suffix(3), ["disk3s1s1", "disk3s5", "disk5s1"], "asked again once the table changed")
    }

    /// DiskArbitration says this Mac's startup disk is internal, read from its description alone, and has no word of a
    /// disk that isn't there.
    func testDiskArbitrationSaysThisMacsStartupDiskIsInternal() throws {
        let startup = try XCTUnwrap(MountTable.current().mounts.first { $0.path == "/" })
        XCTAssertTrue(startup.from.hasPrefix("/dev/disk"), startup.from)
        XCTAssertEqual(startup.isInternal, true)
        XCTAssertEqual(MountTable.diskArbitrationSaysInternal(String(startup.from.dropFirst("/dev/".count))), true)
        XCTAssertNil(MountTable.diskArbitrationSaysInternal("disk999s9"))
    }

    /// One disk ejected and another mounted where it was, between two looks, leave as many file systems mounted as
    /// before: the table is read again at every look, so an app on the new disk never counts as on the startup disk.
    func testAnEjectAndAMountBetweenTwoLooksAreBothSeen() {
        let startup: [MountTable.Mount] = [.init(path: "/", from: "/dev/disk3s1s1"), .init(path: "/System/Volumes/Data", from: "/dev/disk3s5")]
        let kernel = Kernel(startup + [.init(path: "/Volumes/Fast", from: "/dev/disk3s7")])
        let reader = MountTable.Reader(fsstat: { kernel.fsstat($0, $1, $2) }) { _ in nil }
        XCTAssertTrue(reader.current().isOnStartupDisk("/Volumes/Fast/Xcode.app"), "a volume of the startup disk's own container")
        kernel.mounts = startup + [.init(path: "/Volumes/Fast", from: "/dev/disk5s1")]
        XCTAssertFalse(reader.current().isOnStartupDisk("/Volumes/Fast/Xcode.app"), "another disk, mounted where it was")
        kernel.mounts = startup
        XCTAssertEqual(reader.current(), MountTable(startup), "and ejected")
    }

    /// The disks DiskArbitration was asked about, in order.
    private final class Asked: @unchecked Sendable {
        private let lock = NSLock()
        private var asked: [String] = []
        func add(_ disk: String) { lock.lock(); asked.append(disk); lock.unlock() }
        var disks: [String] { lock.lock(); defer { lock.unlock() }; return asked }
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
                entry.f_flags = mount.isLocal ? UInt32(MNT_LOCAL) : 0
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
