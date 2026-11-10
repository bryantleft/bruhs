import XCTest
@testable import PithCore

final class DiskSelectionTests: XCTestCase {
    // MARK: Nested picks

    func testAnItemInsideAFolderAlsoPickedIsDropped() {
        XCTAssertEqual(DiskSelection.normalized(["/r/a/x.bin", "/r/b", "/r/a"]), ["/r/b", "/r/a"], "the folder holds the item picked first")
        XCTAssertEqual(DiskSelection.normalized(["/r/a", "/r/a/x.bin", "/r/a/deeper/y.bin"]), ["/r/a"], "the folder picked first holds the rest")
        XCTAssertEqual(DiskSelection.normalized(["/x.bin", "/"]), ["/"], "the root holds everything")
    }

    func testOnlyRealNestingDropsAPick() {
        XCTAssertEqual(DiskSelection.normalized(["/r/ab", "/r/a", "/r/a b"]), ["/r/ab", "/r/a", "/r/a b"], "a sibling sharing a prefix isn't inside")
        XCTAssertEqual(DiskSelection.normalized(["/r/a", "/r/b", "/r/a"]), ["/r/a", "/r/b"], "a path picked twice is kept once, first")
        XCTAssertEqual(DiskSelection.normalized([]), [])
    }

    // MARK: Clicks

    func testAClickSelectsJustTheItemsGiven() {
        var selection = DiskSelection(["/r/a"])
        selection.select(["/r/b"])
        XCTAssertEqual(selection.paths, ["/r/b"])
        selection.select(["/r/c/inner", "/r/c"])
        XCTAssertEqual(selection.paths, ["/r/c"], "nested picks drop on a click too")
        selection.select([])
        XCTAssertTrue(selection.isEmpty)
    }

    func testACommandClickTogglesAnItemAsInFinder() {
        var selection = DiskSelection()
        selection.toggle("/r/a")
        selection.toggle("/r/b")
        XCTAssertEqual(selection.paths, ["/r/a", "/r/b"], "each joins in the order it was picked")
        selection.toggle("/r/a")
        XCTAssertEqual(selection.paths, ["/r/b"], "one already selected leaves")
        selection.toggle("/r/b/inner.bin")
        XCTAssertEqual(selection.paths, ["/r/b"], "the folder already holds it, so nothing changes")
        selection.toggle("/r/c/x.bin")
        selection.toggle("/r/c")
        XCTAssertEqual(selection.paths, ["/r/b", "/r/c"], "a folder takes the place of what it holds")
    }

    // MARK: What stays

    func testTheSelectionKeepsOnlyWhatTheMapStillHas() {
        var selection = DiskSelection(["/r/a", "/r/b", "/r/c"])
        selection.keep { $0 != "/r/b" }
        XCTAssertEqual(selection.paths, ["/r/a", "/r/c"])
    }

    func testOpeningAFolderKeepsTheItemsStillOnTheMap() {
        var selection = DiskSelection(["/r/a/x.bin", "/r/b", "/r/a/y"])
        selection.keep(inside: "/r/a")
        XCTAssertEqual(selection.paths, ["/r/a/x.bin", "/r/a/y"], "what's outside the folder opened leaves the map")
        selection.keep(inside: "/r/a/y")
        XCTAssertTrue(selection.isEmpty, "the folder opened is the map itself, not an item on it")
        var everything = DiskSelection(["/x.bin", "/Users"])
        everything.keep(inside: "/")
        XCTAssertEqual(everything.paths, ["/x.bin", "/Users"])
    }

    // MARK: Measuring what deleting the selection frees

    func testTheThresholdIsAMegabyteInPithsOwnUnits() {
        XCTAssertEqual(FreesSchedule.threshold, 1_000_000)
        XCTAssertEqual(formatBytes(FreesSchedule.threshold), "1.00 MB")
    }

    func testAnItemsSizeMustMoveByMoreThanAMegabyte() {
        let measured: [String: UInt64] = ["/r/a": 10_000_000, "/r/b": 5_000_000]
        XCTAssertFalse(FreesSchedule.moved(from: measured, to: measured))
        XCTAssertFalse(FreesSchedule.moved(from: measured, to: ["/r/a": 11_000_000, "/r/b": 5_000_000]), "exactly 1 MB isn't more")
        XCTAssertTrue(FreesSchedule.moved(from: measured, to: ["/r/a": 11_000_001, "/r/b": 5_000_000]))
        XCTAssertTrue(FreesSchedule.moved(from: measured, to: ["/r/a": 10_000_000, "/r/b": 3_999_999]), "shrinking counts too")
        XCTAssertFalse(FreesSchedule.moved(from: measured, to: ["/r/a": 10_900_000, "/r/b": 4_100_000]), "each item by itself, not their sum")
        XCTAssertTrue(FreesSchedule.moved(from: measured, to: ["/r/a": 10_000_000]), "other items are another selection")
    }

    func testANewSelectionIsMeasuredAndTheSameOneOnlyWhenAnItemMoved() {
        var schedule = FreesSchedule()
        XCTAssertTrue(schedule.selected(["/r/a": 10_000_000]), "a new selection is measured")
        XCTAssertFalse(schedule.landed(now: ["/r/a": 10_000_000]))
        XCTAssertFalse(schedule.mapChanged(["/r/a": 10_600_000]))
        XCTAssertTrue(schedule.mapChanged(["/r/a": 11_200_000]), "1.2 MB since the measurement, though each map moved it less")
        XCTAssertFalse(schedule.mapChanged(["/r/a": 30_000_000]), "one measurement at a time")
        XCTAssertTrue(schedule.landed(now: ["/r/a": 30_000_000]), "it moved while being measured, so it's measured again")
        XCTAssertFalse(schedule.landed(now: ["/r/a": 30_500_000]))
        XCTAssertFalse(schedule.mapChanged(["/r/a": 30_500_000]))
    }

    func testAFailedMeasurementWaitsForTheNextMove() {
        var schedule = FreesSchedule()
        XCTAssertTrue(schedule.selected(["/r/a": 10_000_000]))
        schedule.failed()
        XCTAssertFalse(schedule.mapChanged(["/r/a": 10_000_000]), "trying again at once would fail again")
        XCTAssertTrue(schedule.mapChanged(["/r/a": 12_000_000]))
    }

    func testNothingSelectedIsNeverMeasured() {
        var schedule = FreesSchedule()
        XCTAssertFalse(schedule.selected([:]))
        XCTAssertFalse(schedule.mapChanged([:]))
        XCTAssertTrue(schedule.selected(["/r/a": 1]))
        XCTAssertFalse(schedule.selected([:]), "clearing the selection drops the measurement under way")
        XCTAssertFalse(schedule.landed(now: [:]))
    }
}
