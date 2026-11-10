import XCTest
@testable import PithCore

/// When Pith measures what deleting the selection frees: once for each selection, again only once an item moved by more
/// than a megabyte, one measurement at a time, and never back to back: the next of one selection rests after the last.
final class FreesScheduleTests: XCTestCase {
    private let start = Date(timeIntervalSinceReferenceDate: 0)
    private func at(_ seconds: TimeInterval) -> Date { start.addingTimeInterval(seconds) }

    func testTheThresholdIsAMegabyteInPithsOwnUnits() {
        XCTAssertEqual(FreesSchedule.threshold, 1_000_000)
        XCTAssertEqual(formatBytes(FreesSchedule.threshold), "1.00 MB")
    }

    func testTheRestComesFromTheScannersOwnPacing() {
        XCTAssertEqual(FreesSchedule.leastRest, 3, "SETTLE in scanner/src/serve.rs")
        XCTAssertEqual(FreesSchedule.restPerCore, 200, "COOLDOWN_FACTOR in scanner/src/serve.rs")
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

    func testTheSameSelectionIsMeasuredAgainOnlyOnceAnItemMovedAndItsRestIsOver() {
        // One core, so the rest is 200 times as long as the measurement took.
        var schedule = FreesSchedule(cores: 1)
        XCTAssertEqual(schedule.selected(["/r/a": 10_000_000]), .measure, "a new selection is measured")
        XCTAssertEqual(schedule.landed(["/r/a": 10_000_000], at: at(1), took: 1), .keep)
        XCTAssertEqual(schedule.mapChanged(["/r/a": 10_600_000], at: at(2)), .keep)
        XCTAssertEqual(schedule.mapChanged(["/r/a": 11_200_000], at: at(2)), .wait(until: at(201)),
                       "1.2 MB since the measurement, though each map moved it less, but the last one rests for 200 s")
        XCTAssertEqual(schedule.mapChanged(["/r/a": 11_200_000], at: at(201)), .measure)
        XCTAssertEqual(schedule.mapChanged(["/r/a": 30_000_000], at: at(202)), .keep, "one measurement at a time")
        XCTAssertEqual(schedule.landed(["/r/a": 30_000_000], at: at(204), took: 2), .wait(until: at(604)),
                       "it moved while being measured, so it's measured again once this one has rested")
        XCTAssertEqual(schedule.mapChanged(["/r/a": 30_000_000], at: at(604)), .measure)
        XCTAssertEqual(schedule.landed(["/r/a": 30_500_000], at: at(605), took: 1), .keep)
        XCTAssertEqual(schedule.mapChanged(["/r/a": 30_500_000], at: at(1_000)), .keep)
    }

    func testAQuickMeasurementRestsAsLongAsTheLiveMapWaits() {
        var schedule = FreesSchedule(cores: 1)
        XCTAssertEqual(schedule.selected(["/r/a": 1]), .measure)
        XCTAssertEqual(schedule.landed(["/r/a": 1], at: at(1), took: 0.001), .keep)
        XCTAssertEqual(schedule.mapChanged(["/r/a": 2_000_000], at: at(3.9)), .wait(until: at(4)), "never sooner than 3 s after the last")
        XCTAssertEqual(schedule.mapChanged(["/r/a": 2_000_000], at: at(4)), .measure)
    }

    func testTheRestGrowsWithEveryCoreAMeasurementCanTake() {
        var schedule = FreesSchedule(cores: 12)
        XCTAssertEqual(schedule.selected(["/r/a": 1]), .measure)
        // A walk of 88,188 files took 0.7 s here, on 12 cores: it next waits 200 × 12 × 0.7 s, 28 minutes.
        XCTAssertEqual(schedule.landed(["/r/a": 9_000_000], at: at(10), took: 0.7), .wait(until: at(10 + 1_680)))
    }

    func testANewSelectionIsMeasuredWithoutWaiting() {
        var schedule = FreesSchedule(cores: 1)
        XCTAssertEqual(schedule.selected(["/r/a": 1]), .measure)
        XCTAssertEqual(schedule.landed(["/r/a": 1], at: at(10), took: 10), .keep)
        XCTAssertEqual(schedule.selected(["/r/b": 1]), .measure, "another selection is the person's own action")
    }

    func testAFailedMeasurementRestsAndWaitsForTheNextMove() {
        var schedule = FreesSchedule(cores: 1)
        XCTAssertEqual(schedule.selected(["/r/a": 10_000_000]), .measure)
        schedule.failed(at: at(1), took: 1)
        XCTAssertEqual(schedule.mapChanged(["/r/a": 10_000_000], at: at(1_000)), .keep, "trying again unmoved would fail again")
        XCTAssertEqual(schedule.mapChanged(["/r/a": 12_000_000], at: at(10)), .wait(until: at(201)))
        XCTAssertEqual(schedule.mapChanged(["/r/a": 12_000_000], at: at(201)), .measure)
    }

    func testNothingSelectedIsNeverMeasured() {
        var schedule = FreesSchedule(cores: 1)
        XCTAssertEqual(schedule.selected([:]), .keep)
        XCTAssertEqual(schedule.mapChanged([:], at: at(1)), .keep)
        XCTAssertEqual(schedule.selected(["/r/a": 1]), .measure)
        XCTAssertEqual(schedule.selected([:]), .keep, "clearing the selection drops the measurement under way")
        XCTAssertEqual(schedule.landed([:], at: at(2), took: 1), .keep)
    }
}
