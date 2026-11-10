import XCTest
@testable import PithCore

/// Which of the live map's maps answer the person's own action, so the page shows them at once though the pointer holds
/// the map still: the one after their Check Again has landed. And whether the scan a failed tree falls back on answers
/// them: only when the tree it replaces was asked for by their own action, opening a folder or Check Again. Each tree is
/// asked for by a request of its own, numbered in order.
final class LiveTreeAsksTests: XCTestCase {
    func testTheMapAfterCheckAgainShowsAtOnceAndTheRefreshesAfterItWait() {
        var asks = LiveTreeAsks()
        asks.asked(.refresh, request: 1)
        XCTAssertFalse(asks.arrived(request: 1), "the live map's own refresh waits for the hold")
        asks.asked(.opening, request: 2)
        XCTAssertFalse(asks.arrived(request: 2), "a folder opened shows its finer tree as the page fills in a new folder")
        asks.asked(.checkAgain, request: 3)
        XCTAssertTrue(asks.arrived(request: 3), "Check Again's map")
        asks.asked(.refresh, request: 4)
        XCTAssertFalse(asks.arrived(request: 4), "once")
    }

    func testAFallbackScanIsThePersonsOnlyForTheirOwnTree() {
        var asks = LiveTreeAsks()
        asks.asked(.refresh, request: 1)
        XCTAssertFalse(asks.failed(request: 1), "a two-second refresh's fallback waits for the hold like any refresh")
        asks.asked(.opening, request: 2)
        XCTAssertTrue(asks.failed(request: 2), "a folder the person opened")
        asks.asked(.checkAgain, request: 3)
        XCTAssertTrue(asks.failed(request: 3), "Check Again")
        asks.asked(.refresh, request: 4)
        XCTAssertFalse(asks.failed(request: 4), "the person's tree was answered, by its failure")
    }

    /// The person's tree can be overtaken by one the live map asks for after it, which takes its place: that tree answers
    /// them in its stead, until a tree comes or fails.
    func testThePersonsAskHoldsUntilATreeAnswersIt() {
        var asks = LiveTreeAsks()
        asks.asked(.opening, request: 1)
        asks.asked(.refresh, request: 2)
        XCTAssertTrue(asks.failed(request: 2))
        asks.asked(.checkAgain, request: 3)
        asks.asked(.refresh, request: 4)
        XCTAssertTrue(asks.arrived(request: 4))
        XCTAssertFalse(asks.failed(request: 5), "answered by the map that came")
        asks.asked(.checkAgain, request: 6)
        XCTAssertTrue(asks.failed(request: 6))
        asks.asked(.refresh, request: 7)
        XCTAssertFalse(asks.arrived(request: 7), "a Check Again whose tree failed leaves nothing to show at once")
    }

    /// A map asked for before the person's ask, which came and is still being measured when they ask, goes out after it:
    /// it says nothing of their ask, which the tree asked for after it answers.
    func testATreeAskedForBeforeThePersonsAskSaysNothingOfIt() {
        var asks = LiveTreeAsks()
        asks.asked(.refresh, request: 1)
        asks.asked(.checkAgain, request: 2)
        XCTAssertFalse(asks.arrived(request: 1), "the refresh's map, from before the relist landed")
        XCTAssertTrue(asks.arrived(request: 2), "Check Again's own")
        asks.asked(.refresh, request: 3)
        asks.asked(.opening, request: 4)
        XCTAssertFalse(asks.arrived(request: 3))
        XCTAssertTrue(asks.failed(request: 4), "the opened folder's tree is still theirs")
    }
}
