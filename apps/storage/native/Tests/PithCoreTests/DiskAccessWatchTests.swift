import XCTest
@testable import PithCore

/// Full Disk Access opens the locations macOS guards without the person answering macOS's question for each, so losing
/// it leaves them unanswered, and macOS asks at the next access. From the moment a probe finds it lost, those locations
/// count as asking, so the icon rule looks nothing up by its path there, until the scanner has listed every folder again
/// since, or Pith has Full Disk Access again. The probes here are given; the real one is tested on files of the test's
/// own.
final class DiskAccessWatchTests: XCTestCase {
    private let start = Date(timeIntervalSince1970: 1_800_000_000)

    func testLosingFullDiskAccessCountsTheGuardedLocationsAsAskingUntilTheyreListedAgain() {
        var watch = DiskAccessWatch()
        watch.probed(.granted, at: start)
        XCTAssertTrue(watch.granted)
        XCTAssertFalse(watch.countsAsAsking(listedSince: nil), "Pith has it")
        let lost = start.addingTimeInterval(600)
        watch.probed(.denied, at: lost)
        XCTAssertFalse(watch.granted)
        XCTAssertEqual(watch.lostAt, lost)
        XCTAssertTrue(watch.countsAsAsking(listedSince: nil), "nothing listed since")
        XCTAssertTrue(watch.countsAsAsking(listedSince: start), "a map listed while Pith had it")
        XCTAssertFalse(watch.countsAsAsking(listedSince: lost.addingTimeInterval(1)), "a map listed since, as a scan made after")
        watch.probed(.denied, at: lost.addingTimeInterval(60))
        XCTAssertEqual(watch.lostAt, lost, "lost since the first probe that found it gone")
        watch.listedEveryFolder(since: lost.addingTimeInterval(-30))
        XCTAssertFalse(watch.relisted, "a check begun before the loss lists some folders from before it")
        XCTAssertTrue(watch.countsAsAsking(listedSince: nil))
        watch.listedEveryFolder(since: lost.addingTimeInterval(30))
        XCTAssertTrue(watch.relisted, "the scanner has listed the startup disk again, so macOS has asked about what it needed to")
        XCTAssertEqual(watch.lostAt, lost, "Pith still hasn't Full Disk Access")
        XCTAssertFalse(watch.countsAsAsking(listedSince: nil))
    }

    func testFullDiskAccessBackEndsTheLoss() {
        var watch = DiskAccessWatch(granted: true, lostAt: nil)
        watch.probed(.denied, at: start)
        XCTAssertTrue(watch.countsAsAsking(listedSince: nil))
        watch.listedEveryFolder(since: start.addingTimeInterval(2))
        watch.probed(.granted, at: start.addingTimeInterval(5))
        XCTAssertEqual(watch, DiskAccessWatch(granted: true, lostAt: nil, relisted: false))
        XCTAssertFalse(watch.countsAsAsking(listedSince: nil))
        XCTAssertFalse(watch.countsAsAsking(listedSince: nil, onStartupDisk: false))
        watch.probed(.denied, at: start.addingTimeInterval(9))
        XCTAssertFalse(watch.relisted, "a second loss is a loss of its own")
        XCTAssertTrue(watch.countsAsAsking(listedSince: start.addingTimeInterval(6)))
    }

    /// Full Disk Access opened removable and network volumes too without the person's answer, and the live map lists the
    /// startup disk alone, so a scan of another disk, a share or the home automount made before the loss counts as
    /// guarded throughout until a scan of it since, or Full Disk Access back: listing the startup disk again lifts only
    /// the startup disk's hold. Pith keeps both across launches. A scan of the startup disk is held as its map is.
    func testAScanOfAnotherDiskIsHeldUntilAScanOfItSince() {
        let places = KnownPlaces(home: URL(fileURLWithPath: "/Users/tester", isDirectory: true), searchPaths: [:], mounts: { MountTableTests.table }) { _ in nil }
        let scanned = start, lost = start.addingTimeInterval(600)
        let holds = { (watch: DiskAccessWatch, root: String, since: Date?) in watch.holdsScan(of: root, listedSince: since, guards: places.guardsVolume) }
        var watch = DiskAccessWatch(granted: true, lostAt: nil)
        XCTAssertFalse(holds(watch, "/Volumes/Archive", scanned), "Pith has it")
        watch.probed(.denied, at: lost)
        for disk in ["/Volumes/Archive", "/Volumes/share/Photos", "/System/Volumes/Data/home/tester"] {
            XCTAssertTrue(holds(watch, disk, scanned), disk)
            XCTAssertTrue(holds(watch, disk, nil), "\(disk), listed at no known time")
        }
        XCTAssertFalse(holds(watch, "/Users/tester/Projects", scanned), "the startup disk, where only the locations macOS guards are held")
        XCTAssertTrue(watch.countsAsAsking(listedSince: scanned))
        watch.listedEveryFolder(since: lost.addingTimeInterval(30))
        XCTAssertFalse(watch.countsAsAsking(listedSince: scanned), "the live map listed the startup disk again since")
        XCTAssertTrue(holds(watch, "/Volumes/Archive", scanned), "but not the other disk")
        XCTAssertFalse(holds(watch, "/Volumes/Archive", lost.addingTimeInterval(60)), "a scan of it since")
        let relaunched = DiskAccessWatch(granted: watch.granted, lostAt: watch.lostAt, relisted: watch.relisted)
        XCTAssertEqual(relaunched, watch, "as Pith keeps it")
        XCTAssertFalse(relaunched.countsAsAsking(listedSince: nil))
        XCTAssertTrue(holds(relaunched, "/Volumes/Archive", nil))
        watch.probed(.granted, at: lost.addingTimeInterval(120))
        XCTAssertFalse(holds(watch, "/Volumes/Archive", scanned), "Full Disk Access back")
    }

    /// The hold follows the icons' own test of where macOS guards (`MountTable.guards`): an internal disk of another
    /// container, which macOS doesn't guard, isn't held after the loss, while a disk image is, as an external disk is.
    func testAScanOfAnInternalDiskOfAnotherContainerIsntHeld() {
        let table = MountTable(MountTableTests.table.mounts + [.init(path: "/Volumes/Second", from: "/dev/disk6s1", isInternal: true)])
        let places = KnownPlaces(home: URL(fileURLWithPath: "/Users/tester", isDirectory: true), searchPaths: [:], mounts: { table }) { _ in nil }
        var watch = DiskAccessWatch(granted: true, lostAt: nil)
        watch.probed(.denied, at: start.addingTimeInterval(600))
        let holds = { (root: String) in watch.holdsScan(of: root, listedSince: self.start, guards: places.guardsVolume) }
        XCTAssertFalse(holds("/Volumes/Second"), "an internal disk of another container")
        XCTAssertFalse(holds("/Volumes/Second/Projects"))
        XCTAssertFalse(holds("/System/Volumes/xarts"), "the internal system container")
        XCTAssertTrue(holds("/Volumes/Installer"), "a disk image")
        XCTAssertTrue(holds("/Volumes/Archive/Photos"), "an external disk")
    }

    /// The icon rule follows: a held scan counts among the locations macOS guards, so while it's held no folder of it is
    /// looked up by its path, its own included, natively or by the page, whose rule carries it.
    func testTheIconRuleLooksNothingUpOnAHeldDisk() {
        let places = KnownPlaces(home: URL(fileURLWithPath: "/Users/tester", isDirectory: true), searchPaths: [:], mounts: { MountTableTests.table }) { _ in nil }
        let photos = DiskNode(kind: .dir, name: "Photos", path: "/Volumes/Archive/Photos", size: 4096, files: 1, children: [])
        let disk = DiskNode(kind: .dir, name: "Archive", path: "/Volumes/Archive", size: 4096, files: 1, children: [photos])
        XCTAssertEqual(places.iconKey(for: photos, asking: true), .item(photos.path), "unheld, it isn't where macOS guards")
        let held = places.holding("/Volumes/Archive")
        XCTAssertEqual(held.iconKey(for: photos, asking: true), .folder)
        XCTAssertEqual(held.iconKey(for: disk, asking: true), .folder)
        XCTAssertTrue(held.isProtected("/Volumes/Archive/Photos"))
        XCTAssertFalse(held.isProtected("/Volumes/Archive 2"))
        XCTAssertEqual(held.iconRule(asking: true).guarded, places.guarded + ["/Volumes/Archive"])
        XCTAssertEqual(places.iconRule(asking: true).guarded, places.guarded, "the table itself is as it was")
    }

    /// Without Full Disk Access at the probe before, nothing is lost: the person's answers stand. A probe that can't tell
    /// changes nothing, and a loss found at an earlier launch lasts through this one.
    func testOnlyAGrantedProbeThenADeniedOneIsALoss() {
        var never = DiskAccessWatch()
        never.probed(.denied, at: start)
        XCTAssertNil(never.lostAt)
        XCTAssertFalse(never.countsAsAsking(listedSince: nil))
        var unsure = DiskAccessWatch(granted: true, lostAt: nil)
        unsure.probed(.unknown, at: start)
        XCTAssertEqual(unsure, DiskAccessWatch(granted: true, lostAt: nil))
        let kept = DiskAccessWatch(granted: false, lostAt: start)
        XCTAssertTrue(kept.countsAsAsking(listedSince: nil), "lost at an earlier launch, listed nothing since")
    }

    /// The icon rule follows: a folder Documents' map listed while Pith had Full Disk Access is looked up by its path,
    /// and isn't once Pith has lost it, until the map is listed again.
    func testTheIconRuleLooksNothingUpWhereMacOSGuardsWhileItsLost() {
        let home = URL(fileURLWithPath: "/Users/tester", isDirectory: true)
        let places = KnownPlaces(home: home, searchPaths: [.documentDirectory: home.appendingPathComponent("Documents")]) { _ in nil }
        let taxes = DiskNode(kind: .dir, name: "Taxes", path: "/Users/tester/Documents/Taxes", size: 4096, files: 1, children: [])
        let projects = DiskNode(kind: .dir, name: "Projects", path: "/Users/tester/Projects", size: 4096, files: 1, children: [])
        var watch = DiskAccessWatch(granted: true, lostAt: nil)
        let listed = start
        XCTAssertEqual(places.iconKey(for: taxes, asking: watch.countsAsAsking(listedSince: listed)), .item(taxes.path))
        watch.probed(.denied, at: start.addingTimeInterval(60))
        XCTAssertEqual(places.iconKey(for: taxes, asking: watch.countsAsAsking(listedSince: listed)), .folder, "where macOS guards")
        XCTAssertEqual(places.iconKey(for: projects, asking: watch.countsAsAsking(listedSince: listed)), .item(projects.path), "elsewhere as before")
        watch.listedEveryFolder(since: start.addingTimeInterval(120))
        XCTAssertEqual(places.iconKey(for: taxes, asking: watch.countsAsAsking(listedSince: start.addingTimeInterval(120))), .item(taxes.path))
    }

    /// The probe opens its file and closes it at once, reading nothing: opened, Full Disk Access; refused, none; missing,
    /// nothing said. The real file is the person's own privacy database, which only Full Disk Access opens.
    func testTheProbeOpensItsFileAndReadsNothing() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("pith-probe-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let open = folder.appendingPathComponent("open.db"), shut = folder.appendingPathComponent("shut.db")
        try Data("x".utf8).write(to: open)
        try Data("x".utf8).write(to: shut)
        try FileManager.default.setAttributes([.posixPermissions: 0], ofItemAtPath: shut.path)
        defer { try? FileManager.default.setAttributes([.posixPermissions: 0o644], ofItemAtPath: shut.path) }
        XCTAssertEqual(DiskAccessWatch.probe(open.path), .granted)
        XCTAssertEqual(DiskAccessWatch.probe(shut.path), .denied)
        XCTAssertEqual(DiskAccessWatch.probe(folder.appendingPathComponent("missing.db").path), .unknown)
        XCTAssertEqual(DiskAccessWatch.probePath(home: "/Users/tester"), "/Users/tester/Library/Application Support/com.apple.TCC/TCC.db")
    }
}
