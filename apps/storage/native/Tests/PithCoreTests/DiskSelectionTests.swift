import XCTest
@testable import PithCore

final class DiskSelectionTests: XCTestCase {
    // MARK: Nested picks

    func testAnItemInsideAFolderAlsoPickedIsDropped() {
        XCTAssertEqual(DiskSelection.normalized(["/r/a/x.bin", "/r/b", "/r/a"]), ["/r/b", "/r/a"], "the folder holds the item picked first")
        XCTAssertEqual(DiskSelection.normalized(["/r/a", "/r/a/x.bin", "/r/a/deeper/y.bin"]), ["/r/a"], "the folder picked first holds the rest")
        XCTAssertEqual(DiskSelection.normalized(["/x.bin", "/"]), ["/"], "the root holds everything")
    }

    func testOnlyRealNestingDropsAPick() {
        XCTAssertEqual(DiskSelection.normalized(["/r/ab", "/r/a", "/r/a b"]), ["/r/ab", "/r/a", "/r/a b"], "a sibling sharing a prefix isn't inside")
        XCTAssertEqual(DiskSelection.normalized(["/r/a", "/r/b", "/r/a"]), ["/r/a", "/r/b"], "a path picked twice is kept once, first")
        XCTAssertEqual(DiskSelection.normalized([]), [])
    }

    // MARK: Clicks

    func testAClickSelectsJustTheItemsGiven() {
        var selection = DiskSelection(["/r/a"])
        selection.select(["/r/b"])
        XCTAssertEqual(selection.paths, ["/r/b"])
        selection.select(["/r/c/inner", "/r/c"])
        XCTAssertEqual(selection.paths, ["/r/c"], "nested picks drop on a click too")
        selection.select([])
        XCTAssertTrue(selection.isEmpty)
    }

    func testACommandClickTogglesAnItemAsInFinder() {
        var selection = DiskSelection()
        selection.toggle("/r/a")
        selection.toggle("/r/b")
        XCTAssertEqual(selection.paths, ["/r/a", "/r/b"], "each joins in the order it was picked")
        selection.toggle("/r/a")
        XCTAssertEqual(selection.paths, ["/r/b"], "one already selected leaves")
        selection.toggle("/r/b/inner.bin")
        XCTAssertEqual(selection.paths, ["/r/b"], "the folder already holds it, so nothing changes")
        selection.toggle("/r/c/x.bin")
        selection.toggle("/r/c")
        XCTAssertEqual(selection.paths, ["/r/b", "/r/c"], "a folder takes the place of what it holds")
    }

    // MARK: What stays

    /// Shift and an arrow key add the next item, and a held key repeats before Pith has answered, asking for the item it
    /// just added again: an add leaves an item selected already where it is, as a toggle wouldn't.
    func testShiftArrowAddsAnItemAndAskingAgainKeepsIt() {
        var selection = DiskSelection(["/r/a"])
        selection.add("/r/b")
        XCTAssertEqual(selection.paths, ["/r/a", "/r/b"])
        selection.add("/r/b")
        XCTAssertEqual(selection.paths, ["/r/a", "/r/b"], "the key's repeat keeps it")
        selection.add("/r/a/inner")
        XCTAssertEqual(selection.paths, ["/r/a", "/r/b"], "inside a folder selected, it's held already")
        selection.add("/r")
        XCTAssertEqual(selection.paths, ["/r"], "a folder holding them takes their place")
    }

    func testTheSelectionKeepsOnlyWhatTheMapStillHas() {
        var selection = DiskSelection(["/r/a", "/r/b", "/r/c"])
        selection.keep { $0 != "/r/b" }
        XCTAssertEqual(selection.paths, ["/r/a", "/r/c"])
    }

    func testOpeningAFolderKeepsTheItemsStillOnTheMap() {
        var selection = DiskSelection(["/r/a/x.bin", "/r/b", "/r/a/y"])
        selection.keep(inside: "/r/a")
        XCTAssertEqual(selection.paths, ["/r/a/x.bin", "/r/a/y"], "what's outside the folder opened leaves the map")
        selection.keep(inside: "/r/a/y")
        XCTAssertTrue(selection.isEmpty, "the folder opened is the map itself, not an item on it")
        var everything = DiskSelection(["/x.bin", "/Users"])
        everything.keep(inside: "/")
        XCTAssertEqual(everything.paths, ["/x.bin", "/Users"])
    }
}
