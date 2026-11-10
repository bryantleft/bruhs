import XCTest
@testable import PithCore

/// Which of the live map's maps answer the person's own action, so the page shows them at once though the pointer holds
/// the map still: the one after their Check Again has landed. And whether the scan a failed tree falls back on answers
/// them: only when the tree it replaces was asked for by their own action, opening a folder or Check Again.
final class LiveTreeAsksTests: XCTestCase {
    func testTheMapAfterCheckAgainShowsAtOnceAndTheRefreshesAfterItWait() {
        var asks = LiveTreeAsks()
        asks.asked(.refresh)
        XCTAssertFalse(asks.arrived(), "the live map's own refresh waits for the hold")
        asks.asked(.opening)
        XCTAssertFalse(asks.arrived(), "a folder opened shows its finer tree as the page fills in a new folder")
        asks.asked(.checkAgain)
        XCTAssertTrue(asks.arrived(), "Check Again's map")
        asks.asked(.refresh)
        XCTAssertFalse(asks.arrived(), "once")
    }

    func testAFallbackScanIsThePersonsOnlyForTheirOwnTree() {
        var asks = LiveTreeAsks()
        asks.asked(.refresh)
        XCTAssertFalse(asks.failed(), "a two-second refresh's fallback waits for the hold like any refresh")
        asks.asked(.opening)
        XCTAssertTrue(asks.failed(), "a folder the person opened")
        asks.asked(.checkAgain)
        XCTAssertTrue(asks.failed(), "Check Again")
        asks.asked(.refresh)
        XCTAssertFalse(asks.failed(), "the person's tree was answered, by its failure")
    }

    /// The person's tree can be overtaken by one the live map asks for after it, which takes its place: that tree answers
    /// them in its stead, until a tree comes or fails.
    func testThePersonsAskHoldsUntilATreeAnswersIt() {
        var asks = LiveTreeAsks()
        asks.asked(.opening)
        asks.asked(.refresh)
        XCTAssertTrue(asks.failed())
        asks.asked(.checkAgain)
        asks.asked(.refresh)
        XCTAssertTrue(asks.arrived())
        XCTAssertFalse(asks.failed(), "answered by the map that came")
        asks.asked(.checkAgain)
        XCTAssertTrue(asks.failed())
        asks.asked(.refresh)
        XCTAssertFalse(asks.arrived(), "a Check Again whose tree failed leaves nothing to show at once")
    }
}
