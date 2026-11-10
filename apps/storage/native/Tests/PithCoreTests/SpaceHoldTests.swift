import XCTest
@testable import PithCore

/// Not measured holds while the live index has changes it hasn't listed: each live map lags a change by the scanner's
/// settle, so the volume's space measured with it would count a large write the map doesn't have yet, growing Not
/// measured for a few seconds, then shrinking it. The scanner says with each map how many folders wait to be listed,
/// and the figures measured with the last map that had none stand meanwhile, for a minute at most.
final class SpaceHoldTests: XCTestCase {
    private let start = Date(timeIntervalSinceReferenceDate: 800_000_000)
    private func at(_ seconds: TimeInterval) -> Date { start.addingTimeInterval(seconds) }

    /// A run of maps, as the live map sends them while a large file is written and listed: whether each is measured.
    func testTheFiguresMeasuredWithAMapThatHadNothingWaitingStandUntilTheNextSuchMap() {
        var hold = SpaceHold()
        // (seconds, folders waiting, figures held for the map's root)
        let maps: [(TimeInterval, Int?, Bool)] = [
            (0, 0, false),   // the first map: measured
            (2, 1, true),    // the write's folder waits its settle: the figures stand
            (4, 1, true),
            (6, 0, true),    // listed: measured with the map that has it
            (8, 3, true),
            (6 + LiveEdits.longestHold - 1, 2, true),  // folders keep waiting, and the figures are nearly a minute old
            (6 + LiveEdits.longestHold + 1, 2, true),  // past a minute since they were measured: measured again
            (6 + LiveEdits.longestHold + 3, 2, true),  // and they stand again from then
        ]
        var measured: [Bool] = []
        for (seconds, pending, holding) in maps {
            let measures = hold.measures(root: "/", pending: pending, holding: holding, at: at(seconds))
            if measures { hold.measured(root: "/", at: at(seconds)) }
            measured.append(measures)
        }
        XCTAssertEqual(measured, [true, false, false, true, false, false, true, false])
    }

    func testAMapIsMeasuredWhenNothingStandsForItOrTheScannerDoesntSay() {
        var hold = SpaceHold()
        hold.measured(root: "/", at: at(0))
        XCTAssertTrue(hold.measures(root: "/", pending: 4, holding: false, at: at(1)), "no figures held, as after another map's")
        XCTAssertTrue(hold.measures(root: "/Users/x", pending: 4, holding: true, at: at(1)), "the figures are another root's")
        XCTAssertTrue(hold.measures(root: "/", pending: nil, holding: true, at: at(1)), "a scanner that doesn't say, measured as before")
        XCTAssertFalse(hold.measures(root: "/", pending: 4, holding: true, at: at(1)))
    }
}
