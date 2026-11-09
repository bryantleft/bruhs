import XCTest
@testable import PithCore

final class MarkLabelsTests: XCTestCase {
    /// Six points a character, as Monaspace's fixed advance at a small size.
    private let measure: (String) -> CGFloat = { CGFloat($0.count) * 6 }

    func testMarksFarApartAreEachNamed() {
        let labels = MarkLabels.place([.init(x: 10, name: "Xcode"), .init(x: 200, name: "Arc")], width: 600, measure: measure)
        XCTAssertEqual(labels.map(\.text), ["Xcode", "Arc"])
        XCTAssertEqual(labels.map(\.x), [13, 203])
    }

    /// Review of Activity's chart: Blender and two other apps opened within moments, and their names covered each other.
    func testMarksTooCloseToNameApartShareOneLabel() {
        let marks: [MarkLabels.Mark] = [.init(x: 400, name: "Blender"), .init(x: 404, name: "Minecraft"), .init(x: 409, name: "Mail")]
        let labels = MarkLabels.place(marks, width: 600, measure: measure)
        XCTAssertEqual(labels.map(\.text), ["Blender +2"])
        // After the last of the three lines, so none runs through it.
        XCTAssertEqual(labels.first?.x, 412)
        XCTAssertEqual(labels.first?.count, 3)
    }

    func testCrowdedLinesAtTheTrailingEdgeShareOneLabelBeforeThem() {
        // No room after them: one label ends before the first line, rather than one there and "Mail" after the last.
        let marks: [MarkLabels.Mark] = [.init(x: 580, name: "Blender"), .init(x: 584, name: "Minecraft"), .init(x: 589, name: "Mail")]
        let labels = MarkLabels.place(marks, width: 600, measure: measure)
        XCTAssertEqual(labels.map(\.text), ["Blender +2"])
        XCTAssertEqual(labels.first?.x, 517)
    }

    func testALabelThatWouldCrossTheNextLineTakesItIn() {
        let marks: [MarkLabels.Mark] = [.init(x: 100, name: "Xcode"), .init(x: 125, name: "Arc")]
        let labels = MarkLabels.place(marks, width: 600, measure: measure)
        XCTAssertEqual(labels.map(\.text), ["Xcode +1"])
        XCTAssertEqual(labels.first?.x, 128)
    }

    func testTheOrderMarksArriveInDoesntMatter() {
        let marks: [MarkLabels.Mark] = [.init(x: 409, name: "Mail"), .init(x: 100, name: "Notes"), .init(x: 400, name: "Blender")]
        XCTAssertEqual(MarkLabels.place(marks, width: 600, measure: measure).map(\.text), ["Notes", "Blender +1"])
    }

    func testALabelAtTheTrailingEdgeEndsBeforeItsMarkAndMergesIfItThenTouches() {
        // "Photos" would run past 600, so it ends just before its line instead, onto "Safari", which then names both,
        // ending before Safari's line.
        let marks: [MarkLabels.Mark] = [.init(x: 520, name: "Safari"), .init(x: 590, name: "Photos")]
        let labels = MarkLabels.place(marks, width: 600, measure: measure)
        XCTAssertEqual(labels.map(\.text), ["Safari +1"])
        XCTAssertEqual(labels.first?.x, 463)
        // Alone, it only moves to the other side of its line.
        let alone = MarkLabels.place([.init(x: 590, name: "Photos")], width: 600, measure: measure)
        XCTAssertEqual(alone.first?.x, 551)
    }

    func testALabelMovedBeforeItsMarksCanReachTheOneBeforeIt() {
        // "Ann" fits after "Xavier", but "Bob" joins it at the trailing edge, and "Ann +1", moved before its lines,
        // reaches "Xavier": all three share one label, which goes no further than the plot's leading edge.
        let marks: [MarkLabels.Mark] = [.init(x: 50, name: "Xavier"), .init(x: 96, name: "Ann"), .init(x: 110, name: "Bob")]
        let labels = MarkLabels.place(marks, width: 120, measure: measure)
        XCTAssertEqual(labels.map(\.text), ["Xavier +2"])
        XCTAssertEqual(labels.first?.x, 0)
    }
}
