import XCTest
@testable import PithCore

final class FlowFigureTests: XCTestCase {
    func testDigitsAreKeyedByTheirPlace() {
        XCTAssertEqual(FlowFigure("3.11 GB").parts, [
            .digit(place: "i0", value: 3), .literal(place: ".", text: "."), .digit(place: "f1", value: 1), .digit(place: "f2", value: 1),
            .literal(place: "s", text: " GB"),
        ])
        XCTAssertEqual(FlowFigure("1.20 MB/s").parts.map(\.id), ["i0", ".", "f1", "f2", "s"])
        XCTAssertEqual(FlowFigure("0 B").parts, [.digit(place: "i0", value: 0), .literal(place: "s", text: " B")])
        XCTAssertEqual(FlowFigure("22.9 GB of 32.0 GB").parts.last, .literal(place: "s", text: " GB of 32.0 GB"), "the first number flows")
    }

    func testTheOnesKeepTheirWheelAsTheNumberGainsAPlace() {
        let before = FlowFigure("9.9%"), after = FlowFigure("10%")
        XCTAssertEqual(before.parts.map(\.id), ["i0", ".", "f1", "s"])
        XCTAssertEqual(after.parts.map(\.id), ["i1", "i0", "s"])
        XCTAssertEqual(before.digit(at: "i0"), 9)
        XCTAssertEqual(after.digit(at: "i0"), 0)
        XCTAssertNil(before.digit(at: "i1"), "the tens slide in")
    }

    func testSeparatorsAndWordsAreLiterals() {
        XCTAssertEqual(FlowFigure("8,190,945").parts.map(\.id), ["i6", "g6", "i5", "i4", "i3", "g3", "i2", "i1", "i0"])
        XCTAssertEqual(FlowFigure("82%, charging").parts, [.digit(place: "i1", value: 8), .digit(place: "i0", value: 2), .literal(place: "s", text: "%, charging")])
        XCTAssertEqual(FlowFigure("82, charging").parts.last, .literal(place: "s", text: ", charging"))
        XCTAssertEqual(FlowFigure("Paused").parts, [.literal(place: "s", text: "Paused")])
        XCTAssertEqual(FlowFigure("").parts, [])
        XCTAssertEqual(FlowFigure("3.").parts, [.digit(place: "i0", value: 3), .literal(place: "s", text: ".")], "a point with no digits after it isn't one")
    }

    func testWheelsTurnTheWayTheNumberMoved() {
        XCTAssertEqual(FlowFigure.steps(from: 9, to: 0, trend: 1), 1, "rising, 9 rolls on to 0")
        XCTAssertEqual(FlowFigure.steps(from: 0, to: 9, trend: -1), -1, "falling, 0 rolls back to 9")
        XCTAssertEqual(FlowFigure.steps(from: 1, to: 5, trend: 1), 4, "through 2, 3 and 4")
        XCTAssertEqual(FlowFigure.steps(from: 2, to: 8, trend: -1), -4, "down through 1, 0 and 9")
        XCTAssertEqual(FlowFigure.steps(from: 7, to: 7, trend: 1), 0)
        XCTAssertEqual(FlowFigure.steps(from: 2, to: 8, trend: 0), -4, "held still: the short way")
        XCTAssertEqual(FlowFigure.steps(from: 3, to: 5, trend: 0), 2)
    }

    func testInterruptedTurnsKeepBothEndsInsideTheDigitStrip() {
        for trend in [-1, 0, 1] {
            for raw in stride(from: -205.75, through: 205.75, by: 0.25) {
                for digit in 0...9 {
                    let turn = FlowFigure.turn(from: raw, to: digit, trend: trend)
                    XCTAssertTrue((0..<10).contains(turn.start))
                    XCTAssertTrue((-10...19).contains(turn.target))
                    XCTAssertEqual((turn.target.truncatingRemainder(dividingBy: 10) + 10).truncatingRemainder(dividingBy: 10), Double(digit), accuracy: 0.000_001)
                    if trend > 0 { XCTAssertGreaterThanOrEqual(turn.target, turn.start) }
                    if trend < 0 { XCTAssertLessThanOrEqual(turn.target, turn.start) }
                    if trend == 0 { XCTAssertLessThanOrEqual(abs(turn.target - turn.start), 5) }
                }
            }
        }
    }

    func testRepeatedFrameRateInterruptionsDoNotRunOffTheStrip() {
        for direction in [-1, 1] {
            var current = 9.0
            for value in 1...500 {
                // A new target arrives before the previous ease has finished, as during range dragging.
                let digit = ((direction * value * 9) % 10 + 10) % 10
                let turn = FlowFigure.turn(from: current, to: digit, trend: direction)
                current = turn.start + (turn.target - turn.start) * 0.2
                XCTAssertTrue((-10...19).contains(current))
                XCTAssertTrue((0..<10).contains(turn.start))
            }
        }
    }
}
