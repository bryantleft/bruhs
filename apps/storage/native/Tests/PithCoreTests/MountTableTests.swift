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
        XCTAssertEqual(MountTable.current(), table, "read again only once the number of file systems changes")
    }
}
