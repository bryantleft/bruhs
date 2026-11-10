import XCTest
@testable import PithCore

/// Move to Trash and Undo on the live map hold through the maps that come after them: Pith has the folders they changed
/// listed again at once, but a map asked for before that listing lands comes from the index as it was, and the scanner
/// says with each map which of the person's changes its index doesn't show yet (`unlisted`).
final class LiveEditsTests: XCTestCase {
    /// /r 60 B: a (40 B: big.bin 30 and small.bin 10, which Places names) and b (20 B: c.txt 10 and its smaller items
    /// 10, a 6 B folder among them). The live map as its index has it before the person changes anything.
    private func map(withoutBig: Bool = false, a pending: Bool = false) -> DiskResult {
        let big = DiskNode(kind: .file, name: "big.bin", path: "/r/a/big.bin", size: 30, children: nil)
        let small = DiskNode(kind: .file, name: "small.bin", path: "/r/a/small.bin", size: 10, children: nil)
        let aSize: UInt64 = pending ? 0 : withoutBig ? 10 : 40
        let a = DiskNode(kind: .dir, name: "a", path: "/r/a", size: aSize, files: pending ? 0 : withoutBig ? 1 : 2,
                         children: pending ? [] : withoutBig ? [small] : [big, small])
        let b = DiskNode(kind: .dir, name: "b", path: "/r/b", size: 20, files: 4, children: [
            DiskNode(kind: .file, name: "c.txt", path: "/r/b/c.txt", size: 10, children: nil),
            DiskNode(kind: .aggregate, name: "(smaller items)", path: "/r/b/__other__", size: 10, files: 3, children: nil),
        ])
        let root = DiskNode(kind: .dir, name: "r", path: "/r", size: aSize + 20, files: (pending ? 0 : withoutBig ? 1 : 2) + 4,
                            children: [a, b].sorted { $0.size > $1.size })
        let top = withoutBig || pending ? [] : [DiskFile(name: "big.bin", path: "/r/a/big.bin", size: 30)]
        let summary = DiskSummary(dirs: 3, files: root.files ?? 0, bytes: root.size, errors: 0, unreadable: .init(protected: 0, denied: 0, other: 0),
                                  entryErrors: 0, cloudOnly: .init(files: 0, bytes: 0, folders: 0), elapsedMs: 1, engine: "bulk")
        return DiskResult(root: root, topFiles: top, summary: summary)
    }

    private let big = DiskNode(kind: .file, name: "big.bin", path: "/r/a/big.bin", size: 30, children: nil)
    private let places = [LivePlace(path: "/r/a", size: 40), LivePlace(path: "/r/b", size: 20)]

    func testAnItemMovedToTheTrashStaysOffEveryMapUntilTheIndexHasDroppedIt() throws {
        var edits = LiveEdits()
        edits.trashed([big])
        XCTAssertEqual(edits.gone, ["/r/a/big.bin"])
        XCTAssertEqual(edits.back, [])
        // A map from the index as it was, which still has the file.
        let stale = edits.apply(to: map(), places: places, answer: .init(asked: ["/r/a/big.bin"], unlisted: ["/r/a/big.bin"]))
        XCTAssertTrue(stale.changed)
        XCTAssertNil(stale.map.item(at: "/r/a/big.bin"))
        XCTAssertEqual(stale.map.root.size, 30)
        XCTAssertEqual(stale.map.item(at: "/r/a")?.size, 10)
        XCTAssertEqual(stale.map.summary.bytes, 30)
        XCTAssertEqual(stale.map.topFiles, [], "nor in Largest files")
        XCTAssertFalse(edits.isEmpty, "kept until the index has dropped it")
        // Once it has, the map is as it comes, and the change is done with.
        let listed = edits.apply(to: map(withoutBig: true), places: places, answer: .init(asked: ["/r/a/big.bin"], unlisted: []))
        XCTAssertFalse(listed.changed)
        XCTAssertEqual(listed.map.root.size, 30)
        XCTAssertTrue(edits.isEmpty)
    }

    func testAnItemPutBackStaysOnEveryMapUntilTheIndexHasListedIt() throws {
        var edits = LiveEdits()
        edits.trashed([big])
        let top = [DiskFile(name: "big.bin", path: "/r/a/big.bin", size: 30)]
        edits.putBack([.init(node: big, topFiles: top, places: [])])
        XCTAssertEqual(edits.gone, [], "the later change to the item replaces the earlier")
        XCTAssertEqual(edits.back, ["/r/a/big.bin"])
        // The index listed the folder after the move, and not again since: the file is missing.
        let stale = edits.apply(to: map(withoutBig: true), places: places, answer: .init(asked: ["/r/a/big.bin"], unlisted: ["/r/a/big.bin"]))
        XCTAssertTrue(stale.changed)
        XCTAssertEqual(stale.map.item(at: "/r/a/big.bin")?.size, 30)
        XCTAssertEqual(stale.map.item(at: "/r/a")?.size, 40)
        XCTAssertEqual(stale.map.item(at: "/r/a")?.files, 2)
        XCTAssertEqual(stale.map.root.size, 60)
        XCTAssertEqual(stale.map.summary.bytes, 60)
        XCTAssertEqual(stale.map.summary.files, 6)
        XCTAssertEqual(stale.map.item(at: "/r/a")?.children?.map(\.path), ["/r/a/big.bin", "/r/a/small.bin"], "largest first")
        XCTAssertEqual(stale.map.topFiles, top, "and in Largest files")
        let listed = edits.apply(to: map(), places: places, answer: .init(asked: ["/r/a/big.bin"], unlisted: []))
        XCTAssertFalse(listed.changed)
        XCTAssertTrue(edits.isEmpty)
    }

    /// A folder put back that the index found again in its parent's listing, but hasn't listed itself, shows empty in
    /// the map that comes: the folder Undo put back takes its place, with everything in it.
    func testAFolderPutBackTakesThePlaceOfTheEmptyOneTheIndexFound() throws {
        let a = try XCTUnwrap(map().item(at: "/r/a"))
        var edits = LiveEdits()
        edits.putBack([.init(node: a, topFiles: [], places: [LivePlace(path: "/r/a", size: 40)])])
        let pending = map(a: true)
        XCTAssertEqual(pending.item(at: "/r/a")?.size, 0)
        let shown = edits.apply(to: pending, places: [LivePlace(path: "/r/b", size: 20)], answer: .init(asked: ["/r/a"], unlisted: ["/r/a"]))
        XCTAssertEqual(shown.map.item(at: "/r/a"), a)
        XCTAssertEqual(shown.map.root.size, 60)
        XCTAssertEqual(shown.map.root.children?.first?.path, "/r/a", "largest first")
        XCTAssertEqual(shown.places, [LivePlace(path: "/r/b", size: 20), LivePlace(path: "/r/a", size: 40)], "with the place it held")
    }

    /// An item the newer map folds into its folder's smaller items, which the index still counts, takes its size out of
    /// them.
    func testAnItemTheMapFoldsAwayTakesItsSizeOutOfTheSmallerItems() throws {
        let folded = DiskNode(kind: .dir, name: "tiny", path: "/r/b/tiny", size: 6, files: 2, children: [])
        var edits = LiveEdits()
        edits.trashed([folded])
        let shown = edits.apply(to: map(), places: places, answer: .init(asked: ["/r/b/tiny"], unlisted: ["/r/b/tiny"]))
        let group = shown.map.item(at: "/r/b").flatMap { $0.children?.first { $0.kind == .aggregate } }
        XCTAssertEqual(group?.size, 4)
        XCTAssertEqual(group?.files, 1)
        XCTAssertEqual(shown.map.root.size, 54)
        // Once the index has dropped it, the smaller items it sends are smaller already.
        XCTAssertFalse(edits.apply(to: map(), places: places, answer: .init(asked: ["/r/b/tiny"], unlisted: [])).changed)
    }

    /// An item the map folded into its folder's smaller items, moved to the Trash and put back, goes back into them on the
    /// maps that come before the index has it, as it came out of them, rather than taking a block of its own.
    func testAnItemPutBackThatTheMapFoldedGoesBackIntoTheSmallerItems() throws {
        let folded = DiskNode(kind: .dir, name: "tiny", path: "/r/b/tiny", size: 6, files: 2, children: [])
        var edits = LiveEdits()
        edits.putBack([.init(node: folded, topFiles: [], places: [], folded: true)])
        // The index listed b after the move, without tiny, and not again since.
        let stale = try XCTUnwrap(map().removing(folded.path, folded: folded))
        let shown = edits.apply(to: stale, places: places, answer: .init(asked: ["/r/b/tiny"], unlisted: ["/r/b/tiny"]))
        XCTAssertTrue(shown.changed)
        XCTAssertEqual(shown.map.root, map().root, "back in b's smaller items")
        XCTAssertNil(shown.map.root.node(at: folded.path))
    }

    /// An item put back whose folder a newer map doesn't draw, as after an Undo made with a folder above it open, goes into
    /// the smaller items of the deepest folder that map draws on its way, as Undo puts it on the map open then, rather
    /// than leaving the maps before the index lists it.
    func testAnItemPutBackWhoseFolderTheMapDoesntDrawGoesIntoTheSmallerItemsAboveIt() throws {
        let item = DiskNode(kind: .file, name: "x.bin", path: "/r/b/sub/x.bin", size: 6, children: nil)
        var edits = LiveEdits()
        edits.putBack([.init(node: item, topFiles: [], places: [])])
        let shown = edits.apply(to: map(), places: places, answer: .init(asked: [item.path], unlisted: [item.path]))
        XCTAssertTrue(shown.changed)
        XCTAssertEqual(shown.map.root.size, 66)
        XCTAssertEqual(shown.map.item(at: "/r/b")?.children?.first { $0.kind == .aggregate }?.size, 16, "in b's smaller items")
        // Undo puts it on the map open then the same way.
        XCTAssertEqual(map().puttingBack(.init(node: item, topFiles: [], places: []))?.root, shown.map.root)
    }

    func testAPlaceInsideAnItemMovedToTheTrashLeavesPlacesUntilTheIndexHasIt() throws {
        let a = try XCTUnwrap(map().item(at: "/r/a"))
        var edits = LiveEdits()
        edits.trashed([a])
        let shown = edits.apply(to: map(), places: places, answer: .init(asked: ["/r/a"], unlisted: ["/r/a"]))
        XCTAssertEqual(shown.places, [LivePlace(path: "/r/b", size: 20)])
        XCTAssertNil(shown.map.item(at: "/r/a"))
    }

    /// A map asked for before a change, without the scanner's word on it, shows the change only where that's safe: an
    /// item moved to the Trash leaves the map if it's on it, and the change stays for a map that's asked about it.
    func testAChangeTheScannerWasntAskedAboutStays() throws {
        var edits = LiveEdits()
        edits.trashed([big])
        let shown = edits.apply(to: map(), places: places, answer: .init(asked: [], unlisted: []))
        XCTAssertNil(shown.map.item(at: "/r/a/big.bin"))
        XCTAssertEqual(edits.gone, ["/r/a/big.bin"])
        var back = LiveEdits()
        back.putBack([.init(node: big, topFiles: [], places: [])])
        let unasked = back.apply(to: map(withoutBig: true), places: places, answer: .init(asked: [], unlisted: []))
        XCTAssertFalse(unasked.changed, "nothing says the index lacks it")
        XCTAssertEqual(back.back, ["/r/a/big.bin"])
    }

    /// A change is held for a minute at most: a hard-linked file put back, whose bytes the index counts at another link,
    /// is never listed by name, so the scanner says of every map that its index doesn't show it, and without a bound the
    /// map would count it twice for as long as Pith runs. A change made again starts its minute again.
    func testAChangeIsHeldForAMinuteAtMost() throws {
        let made = Date(timeIntervalSinceReferenceDate: 800_000_000)
        let linked = DiskNode(kind: .file, name: "linked.mov", path: "/r/a/linked.mov", size: 30, children: nil)
        var edits = LiveEdits()
        edits.trashed([big], at: made)
        edits.putBack([.init(node: linked, topFiles: [], places: [])], at: made)
        // The trashed item is put back later on, which holds it from then.
        edits.putBack([.init(node: big, topFiles: [], places: [])], at: made.addingTimeInterval(20))
        edits.trashed([DiskNode(kind: .dir, name: "later", path: "/r/later", size: 1, files: 0, children: [])], at: made.addingTimeInterval(30))
        XCTAssertEqual(edits.expire(at: made.addingTimeInterval(LiveEdits.longestHold - 1)), [], "within the minute")
        XCTAssertEqual(edits.back, ["/r/a/linked.mov", "/r/a/big.bin"])
        let dropped = edits.expire(at: made.addingTimeInterval(LiveEdits.longestHold + 1))
        XCTAssertEqual(dropped.map(\.path), ["/r/a/linked.mov"], "past it, only the change made first")
        XCTAssertEqual(edits.back, ["/r/a/big.bin"])
        XCTAssertEqual(edits.gone, ["/r/later"])
        // The maps after it are as the index has them, however often the scanner says it doesn't show the file.
        let shown = edits.apply(to: map(withoutBig: true), places: places, answer: .init(asked: ["/r/a/linked.mov"], unlisted: ["/r/a/linked.mov"]))
        XCTAssertNil(shown.map.item(at: "/r/a/linked.mov"))
        XCTAssertEqual(edits.expire(at: made.addingTimeInterval(LiveEdits.longestHold + 31)).map(\.path), ["/r/a/big.bin", "/r/later"])
        XCTAssertEqual(edits.expire(at: made.addingTimeInterval(LiveEdits.longestHold + 32)), [], "each is dropped once")
        XCTAssertTrue(edits.isEmpty)
    }

    /// A change the disk itself contradicts is done with: an item moved to the Trash that's there again, as after Finder's
    /// Put Back, or one put back that's gone again.
    func testAChangeTheDiskContradictsIsDoneWith() {
        var edits = LiveEdits()
        edits.trashed([big, DiskNode(kind: .dir, name: "gone", path: "/r/gone", size: 1, files: 0, children: [])])
        edits.putBack([.init(node: DiskNode(kind: .dir, name: "kept", path: "/r/kept", size: 1, files: 0, children: []), topFiles: [], places: []),
                       .init(node: DiskNode(kind: .dir, name: "lost", path: "/r/lost", size: 1, files: 0, children: []), topFiles: [], places: [])])
        edits.keep(onDisk: ["/r/a/big.bin", "/r/kept"], of: Set(edits.gone + edits.back))
        XCTAssertEqual(edits.gone, ["/r/gone"])
        XCTAssertEqual(edits.back, ["/r/kept"])
        // A change made since the disk was looked at stays.
        edits.trashed([DiskNode(kind: .dir, name: "new", path: "/r/new", size: 1, files: 0, children: [])])
        edits.keep(onDisk: ["/r/new"], of: ["/r/gone", "/r/kept"])
        XCTAssertEqual(edits.gone, ["/r/gone", "/r/new"])
    }
}
