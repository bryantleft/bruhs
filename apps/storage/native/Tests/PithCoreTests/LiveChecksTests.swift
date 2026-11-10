import XCTest
@testable import PithCore

/// The live map's checks of every folder: the daily one Pith asks for, and those the scanner begins itself when FSEvents
/// loses track, which the caption names apart.
final class LiveChecksTests: XCTestCase {
    func testTheDailyCheckIsTheOnePithAskedFor() {
        var checks = LiveChecks()
        checks.askedForDaily()
        checks.status(checking: true)
        XCTAssertEqual(checks.running, .daily)
        XCTAssertTrue(checks.checked(), "the scheduler hears the daily check is done")
        XCTAssertNil(checks.running)
        checks.status(checking: true)
        XCTAssertEqual(checks.running, .lostTrack, "a check after it is the scanner's own")
    }

    func testACheckPithDidntAskForIsTheScannersOwn() {
        var checks = LiveChecks()
        checks.status(checking: true)
        XCTAssertEqual(checks.running, .lostTrack)
        XCTAssertFalse(checks.checked(), "no daily check to tell the scheduler of")
        checks.status(checking: false)
        XCTAssertNil(checks.running)
    }

    func testAWalkThatCutsTheDailyCheckShortEndsIt() {
        var checks = LiveChecks()
        checks.askedForDaily()
        checks.status(checking: true)
        // A rebuild walks the disk again, which lists every folder, so the daily check it cut short is done.
        XCTAssertTrue(checks.walkBegan())
        XCTAssertNil(checks.running)
        // The scanner's next check is its own, not the daily one.
        checks.status(checking: true)
        XCTAssertEqual(checks.running, .lostTrack)
        XCTAssertFalse(checks.walkBegan(), "no daily check is cut short twice")
    }

    func testTheScannerStoppingEndsTheDailyCheckUnfinished() {
        var checks = LiveChecks()
        checks.askedForDaily()
        checks.status(checking: true)
        XCTAssertTrue(checks.stopped(), "the scheduler hears the daily check didn't run, so it asks again later")
        XCTAssertNil(checks.running)
        XCTAssertFalse(checks.stopped())
        checks.status(checking: true)
        XCTAssertEqual(checks.running, .lostTrack)
    }
}
