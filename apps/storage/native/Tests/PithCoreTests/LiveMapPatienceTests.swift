import XCTest
@testable import PithCore

/// A smoke check that waits for the live map to show a change it made on the disk counts its patience only while the
/// live map has no folder waiting to be listed: while the scanner says folders wait, as a slow listing's cooldown holds
/// them on a loaded Mac, the map is behind, not wrong. A change that never shows still fails the wait, once the map has
/// had nothing waiting for the whole patience, or at the longest it waits in all. Looked at here every second.
final class LiveMapPatienceTests: XCTestCase {
    private let start = Date(timeIntervalSince1970: 1_800_000_000)

    /// Looks every second through `seconds`, the live map waiting on folders as `waiting` says at each, and says when the
    /// wait gave up, or nil if it never did.
    private func gaveUp(_ seconds: Int, waiting: (Int) -> Bool) -> Int? {
        var patience = LiveMapPatience(patience: 20, longest: 60, at: start)
        for second in 1...seconds where !patience.mayGoOn(at: start + TimeInterval(second), waiting: waiting(second)) { return second }
        return nil
    }

    func testWithNothingWaitingItGivesUpAfterThePatience() {
        XCTAssertEqual(gaveUp(30) { _ in false }, 20)
    }

    func testThePatienceDoesntRunWhileFoldersWaitToBeListed() {
        // A second for FSEvents to name the folder, then a cooldown of 30 s, then the listing and two seconds for the map.
        XCTAssertNil(gaveUp(40) { (2...32).contains($0) })
    }

    func testStretchesWithNothingWaitingAddUp() {
        XCTAssertEqual(gaveUp(59) { (11...30).contains($0) }, 40, "ten seconds before, and ten after twenty of waiting")
    }

    func testItGivesUpAtTheLongestHoweverLongFoldersWait() {
        XCTAssertEqual(gaveUp(90) { _ in true }, 60)
    }
}
