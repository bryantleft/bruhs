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
        XCTAssertEqual(watch.lostAt, lost, "a check begun before the loss lists some folders from before it")
        watch.listedEveryFolder(since: lost.addingTimeInterval(30))
        XCTAssertNil(watch.lostAt, "the scanner has listed everything again, so macOS has asked about what it needed to")
        XCTAssertFalse(watch.countsAsAsking(listedSince: nil))
    }

    func testFullDiskAccessBackEndsTheLoss() {
        var watch = DiskAccessWatch(granted: true, lostAt: nil)
        watch.probed(.denied, at: start)
        XCTAssertTrue(watch.countsAsAsking(listedSince: nil))
        watch.probed(.granted, at: start.addingTimeInterval(5))
        XCTAssertNil(watch.lostAt)
        XCTAssertTrue(watch.granted)
        XCTAssertFalse(watch.countsAsAsking(listedSince: nil))
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
