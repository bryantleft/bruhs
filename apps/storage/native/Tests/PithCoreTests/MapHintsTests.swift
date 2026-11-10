import XCTest
@testable import PithCore

/// The disk map's click hints, kept in Pith's settings so they stay learned for the next window and the next launch.
final class MapHintsTests: XCTestCase {
    /// Settings as a test keeps them: what's stored, and each write.
    private final class Stored {
        var value: Any?
        var writes = 0
    }

    private func hints(_ stored: Stored) -> MapHints {
        MapHints(read: { stored.value }, write: { stored.value = $0; stored.writes += 1 })
    }

    func testAHintLearnedStaysLearnedForTheNextWindowAndLaunch() {
        let stored = Stored()
        XCTAssertEqual(hints(stored).learned, [])
        hints(stored).learn("selected")
        // A new window's page, or the next launch, reads them again from the settings.
        XCTAssertEqual(hints(stored).learned, ["selected"])
        hints(stored).learn("opened")
        XCTAssertEqual(hints(stored).learned, ["opened", "selected"])
    }

    func testOnlyTheHintsTheMapLearnsAreKept() {
        let stored = Stored()
        hints(stored).learn("hovered")
        hints(stored).learn("")
        XCTAssertNil(stored.value)
        XCTAssertEqual(stored.writes, 0)
    }

    func testLearningAHintAgainWritesNothing() {
        let stored = Stored()
        hints(stored).learn("opened")
        hints(stored).learn("opened")
        XCTAssertEqual(stored.writes, 1)
    }

    func testWhatsKeptIsReadAsTheMapKnowsIt() {
        let stored = Stored()
        stored.value = ["opened", "x", "opened"]
        XCTAssertEqual(hints(stored).learned, ["opened"])
        stored.value = "selected"
        XCTAssertEqual(hints(stored).learned, [], "a setting of another type is none learned")
        stored.value = ["opened", "x"]
        hints(stored).learn("selected")
        XCTAssertEqual(stored.value as? [String], ["opened", "selected"], "what it doesn't know is dropped as it writes")
    }
}
