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

    /// /r holds a (10 B) and b (20 B, a folder), each with a block of its own, or, in the newer map, with b folded into
    /// /r's smaller items and a grown to 15 B.
    private func map(folding b: Bool = false) -> DiskResult {
        let a = DiskNode(kind: .file, name: "a.bin", path: "/r/a.bin", size: b ? 15 : 10, children: nil)
        let folder = DiskNode(kind: .dir, name: "b", path: "/r/b", size: 20, files: 2, children: [])
        let group = DiskNode(kind: .aggregate, name: "(smaller items)", path: "/r/__other__", size: 20, files: 2, children: nil)
        let summary = DiskSummary(dirs: 2, files: 3, bytes: b ? 35 : 30, errors: 0, unreadable: .init(protected: 0, denied: 0, other: 0), entryErrors: 0,
                                  cloudOnly: .init(files: 0, bytes: 0, folders: 0), elapsedMs: 1, engine: "bulk")
        return DiskResult(root: DiskNode(kind: .dir, name: "r", path: "/r", size: b ? 35 : 30, files: 3, children: b ? [group, a] : [folder, a]),
                          topFiles: [], summary: summary)
    }

    /// An item a newer map folds into its folder's smaller items stays selected while it's on the disk, with the last
    /// size the map showed for it, so the bar's count and Size hold. Each item the map still shows takes its newer node.
    func testAnItemTheMapFoldsAwayStaysSelectedWithItsLastSize() throws {
        var selection = DiskSelection(["/r/b", "/r/a.bin"])
        XCTAssertEqual(selection.follow(map()), [], "the map shows both")
        XCTAssertEqual(selection.items.map(\.size), [20, 10])
        let before = selection
        XCTAssertEqual(selection.follow(map(folding: true)), ["/r/b"], "the map no longer shows b, so Pith checks it's still on the disk")
        XCTAssertEqual(selection.paths, ["/r/b", "/r/a.bin"])
        XCTAssertEqual(selection.items.map(\.size), [20, 15], "b as it last showed, a as it shows now")
        XCTAssertEqual(selection.items.first?.kind, .dir)
        XCTAssertEqual(selection, before, "the same items, so the same selection")
        // The check found b gone from the disk.
        selection.drop(["/r/b", "/r/elsewhere"])
        XCTAssertEqual(selection.paths, ["/r/a.bin"])
        XCTAssertEqual(selection.items.map(\.path), ["/r/a.bin"])
        // An item the selection takes out, by a click or a move, takes its last size with it.
        var picked = DiskSelection(["/r/b", "/r/a.bin"])
        _ = picked.follow(map())
        picked.toggle("/r/b")
        picked.toggle("/r/b")
        XCTAssertEqual(picked.follow(map(folding: true)), ["/r/b"])
        XCTAssertEqual(picked.items.map(\.path), ["/r/a.bin"], "b came back after the map stopped showing it, so it has no size to show")
    }

    /// Items Undo puts back are selected with what the map had of each, so one the map folds away is still counted.
    func testItemsSelectedWithTheirNodesKeepThem() {
        let tiny = DiskNode(kind: .dir, name: "tiny", path: "/r/b/tiny", size: 6, files: 2, children: [])
        var selection = DiskSelection(items: [tiny, DiskNode(kind: .file, name: "a.bin", path: "/r/a.bin", size: 9, children: nil)])
        XCTAssertEqual(selection.paths, ["/r/b/tiny", "/r/a.bin"])
        XCTAssertEqual(selection.follow(map()), ["/r/b/tiny"])
        XCTAssertEqual(selection.items.map(\.size), [6, 10])
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
