import XCTest
@testable import PithCore

final class OpenPacingTests: XCTestCase {
    private let start = Date(timeIntervalSinceReferenceDate: 800_000_000)
    private func at(_ seconds: TimeInterval) -> Date { start.addingTimeInterval(seconds) }

    func testAFolderOpenedAloneAsksForItsTreeAtOnce() {
        var pacing = OpenPacing()
        XCTAssertNil(pacing.opened(at: at(0), burst: 0.2))
        XCTAssertNil(pacing.opened(at: at(1), burst: 0.2), "a second open well after the first asks at once too")
    }

    func testOpensInABurstAskOnceItEnds() {
        var pacing = OpenPacing()
        XCTAssertNil(pacing.opened(at: at(0), burst: 0.2), "the first of the burst asks at once")
        // A held key repeats every 1/12 s: each open waits the burst's length again, so only the last one asks.
        XCTAssertEqual(pacing.opened(at: at(0.083), burst: 0.2), 0.2)
        XCTAssertEqual(pacing.opened(at: at(0.167), burst: 0.2), 0.2)
        XCTAssertEqual(pacing.opened(at: at(0.25), burst: 0.2), 0.2)
        XCTAssertNil(pacing.opened(at: at(0.5), burst: 0.2), "the burst ended 0.25 s before")
    }

    func testABurstLastsTwiceTheKeyRepeatIntervalAndNoLongerThanTheWaitBetweenTrees() {
        XCTAssertEqual(OpenPacing.burst(keyRepeat: 1.0 / 12), 1.0 / 6, accuracy: 1e-9)
        XCTAssertEqual(OpenPacing.burst(keyRepeat: 1.8), 2, "macOS's slowest repeat")
        XCTAssertEqual(OpenPacing.burst(keyRepeat: 0), 0)
        var pacing = OpenPacing()
        XCTAssertNil(pacing.opened(at: at(0), burst: 0))
        XCTAssertNil(pacing.opened(at: at(0.001), burst: 0), "without bursts every open asks at once")
    }
}
