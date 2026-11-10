import XCTest
@testable import PithCore

/// Several items moved to the Trash as one action: each planned by `TrashPolicy`, refused together, asked about once,
/// and put back with one Undo, against real files in a folder of the test's own. The Trash itself is a function the
/// tests give, so nothing goes to the person's.
final class TrashBatchTests: XCTestCase {
    private var folder: URL!
    private var trash: URL!

    override func setUpWithError() throws {
        let made = FileManager.default.temporaryDirectory.appendingPathComponent("pith-batch-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: made, withIntermediateDirectories: true)
        folder = made.resolvingSymlinksInPath()
        trash = folder.appendingPathComponent(".trash")
        try FileManager.default.createDirectory(at: trash, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: folder)
    }

    // MARK: Planning

    func testEveryItemIsPlannedAndNestedPicksAreDropped() throws {
        let a = try file("a.bin"), b = try file("b.bin"), inner = try file("c/inner.bin")
        let c = inner.deletingLastPathComponent()
        let result = map([a, b, inner], folders: [c])
        let batch = try plan([a, inner, c, b], in: result).get()
        XCTAssertEqual(batch.plans.map(\.name), ["a.bin", "c", "b.bin"], "c holds inner.bin, and was picked after it")
        XCTAssertEqual(batch.size, 12)
        XCTAssertFalse(batch.asks)
    }

    func testOneItemThatCantGoRefusesTheWholeMoveSayingWhichAndWhy() throws {
        let a = try file("a.bin")
        let gone = folder.appendingPathComponent("gone.bin"), lost = folder.appendingPathComponent("lost.bin")
        let result = map([a, gone, lost])
        XCTAssertEqual(refusal([a, gone], in: result),
                       "gone.bin can’t go to the Trash because it no longer exists or can’t be read, so take it out of the selection and move the rest.")
        XCTAssertEqual(refusal([gone, lost, a], in: result),
                       "gone.bin and lost.bin can’t go to the Trash because they no longer exist or can’t be read, so take them out of the selection and move the rest.")
        XCTAssertEqual(refusal([gone], in: result), "The item no longer exists or can’t be read. Scan again and try again.",
                       "an item alone says what it always said")
    }

    func testWhenNoItemCanGoTheRefusalOnlySaysWhy() throws {
        let gone = folder.appendingPathComponent("gone.bin"), lost = folder.appendingPathComponent("lost.bin")
        XCTAssertEqual(refusal([gone, lost], in: map([gone, lost])),
                       "gone.bin and lost.bin can’t go to the Trash because they no longer exist or can’t be read.", "there's no rest to move")
    }

    func testItemsRefusedForDifferentReasonsAreNamedWithEach() throws {
        let home = folder.appendingPathComponent("home")
        let library = home.appendingPathComponent("Library")
        try FileManager.default.createDirectory(at: library, withIntermediateDirectories: true)
        let a = try file("a.bin"), gone = folder.appendingPathComponent("gone.bin")
        let result = map([a, gone], folders: [home, library])
        XCTAssertEqual(refusal([library, gone, a], in: result, home: home),
                       "Library can’t go to the Trash because macOS or your account needs it, and gone.bin because it no longer exists or can’t be read, so take them out of the selection and move the rest.")
        XCTAssertEqual(refusal([library, gone], in: result, home: home),
                       "Library can’t go to the Trash because macOS or your account needs it, and gone.bin because it no longer exists or can’t be read.")
    }

    func testANamesListStaysShort() {
        XCTAssertEqual(TrashBatch.names(["a"]), "a")
        XCTAssertEqual(TrashBatch.names(["a", "b"]), "a and b")
        XCTAssertEqual(TrashBatch.names(["a", "b", "c"]), "a, b, and c")
        XCTAssertEqual(TrashBatch.names(["a", "b", "c", "d", "e"]), "a, b, c, and 2 more")
    }

    // MARK: Asking

    func testItAsksOnceListingEveryItemsConsequences() throws {
        let home = folder.appendingPathComponent("home")
        let notes = try file("home/Library/Mobile Documents/notes.txt")
        let library = folder.appendingPathComponent("Photos.photoslibrary")
        try FileManager.default.createDirectory(at: library, withIntermediateDirectories: true)
        let a = try file("a.bin")
        let result = map([notes, a], folders: [library])
        let batch = try plan([notes, library, a], in: result, home: home).get()
        XCTAssertTrue(batch.asks)
        XCTAssertEqual(batch.question, "Move 3 items to the Trash?")
        XCTAssertEqual(batch.confirmation, "notes.txt syncs with iCloud Drive, so the Trash removes it from your other devices too. "
                       + "Photos.photoslibrary is a Photos library: its photos and edits go to the Trash with it. "
                       + "You can put them back from the Trash until you empty it.")

        let alone = try plan([library], in: result, home: home).get()
        XCTAssertEqual(alone.question, "Move “Photos.photoslibrary” to the Trash?")
        XCTAssertEqual(alone.confirmation, "It’s a Photos library: its photos and edits go to the Trash with it. You can put it back from the Trash until you empty it.")
    }

    // MARK: Moving and Undo

    func testEveryItemMovesAndOneUndoPutsEveryOneBack() throws {
        let items = try ["a.bin", "b.bin", "c.bin"].map(file)
        let batch = try plan(items, in: map(items)).get()
        let outcome = batch.move(with: moveIntoTrash)
        XCTAssertEqual(outcome.moved.map(\.plan.name), ["a.bin", "b.bin", "c.bin"])
        XCTAssertNil(outcome.failure)
        XCTAssertNil(outcome.problem)
        XCTAssertEqual(outcome.note, "Moved a.bin, b.bin, and c.bin to the Trash. Their 12 B comes back when you empty the Trash.")
        XCTAssertTrue(items.allSatisfy { !exists($0) })

        let undone = TrashUndo.putBack(outcome.moved, with: moveBack)
        XCTAssertEqual(undone.restored.map(\.plan.name), ["c.bin", "b.bin", "a.bin"], "the last moved comes back first")
        XCTAssertTrue(undone.stuck.isEmpty)
        XCTAssertNil(TrashUndo.problem(stuck: undone.stuck))
        XCTAssertTrue(items.allSatisfy(exists))
    }

    func testOneItemMovedSaysItAsBefore() throws {
        let a = try file("a.bin")
        let outcome = try plan([a], in: map([a])).get().move(with: moveIntoTrash)
        XCTAssertEqual(outcome.note, "Moved a.bin to the Trash. Its 4 B comes back when you empty the Trash.")
    }

    /// The injected Trash refuses b.bin: a.bin has moved, b.bin and c.bin stay, and Undo puts a.bin back.
    func testAFailureMidwayLeavesNothingHalfDone() throws {
        let items = try ["a.bin", "b.bin", "c.bin"].map(file)
        let batch = try plan(items, in: map(items)).get()
        let outcome = batch.move(with: refusing("b.bin"))
        XCTAssertEqual(outcome.moved.map(\.plan.name), ["a.bin"])
        XCTAssertEqual(outcome.failure?.plan.name, "b.bin")
        XCTAssertEqual(outcome.untried.map(\.name), ["c.bin"], "nothing after the failure is tried")
        XCTAssertEqual(outcome.note, "Moved a.bin to the Trash. Its 4 B comes back when you empty the Trash.", "it says which moved")
        XCTAssertEqual(outcome.problem, "Pith couldn’t move b.bin to the Trash, so it and c.bin stayed where they were. The file is locked.",
                       "each item named once")
        XCTAssertEqual(items.map(exists), [false, true, true])

        let undone = TrashUndo.putBack(outcome.moved, with: moveBack)
        XCTAssertEqual(undone.restored.map(\.plan.name), ["a.bin"])
        XCTAssertEqual(items.map(exists), [true, true, true], "Undo puts back what moved, and nothing else was touched")
    }

    func testAFailureFirstOrLastSaysSo() throws {
        let items = try ["a.bin", "b.bin", "c.bin"].map(file)
        let batch = try plan(items, in: map(items)).get()
        let first = batch.move(with: refusing("a.bin"))
        XCTAssertTrue(first.moved.isEmpty)
        XCTAssertNil(first.note, "nothing moved, so there's nothing to undo")
        XCTAssertEqual(first.problem, "Pith couldn’t move a.bin to the Trash, so it, b.bin, and c.bin stayed where they were. The file is locked.")
        let last = batch.move(with: refusing("c.bin"))
        XCTAssertEqual(last.moved.map(\.plan.name), ["a.bin", "b.bin"])
        XCTAssertEqual(last.problem, "Pith couldn’t move c.bin to the Trash. The file is locked.")
    }

    func testAnItemUndoCantPutBackIsNamed() throws {
        let items = try ["a.bin", "b.bin", "c.bin"].map(file)
        let outcome = try plan(items, in: map(items)).get().move(with: moveIntoTrash)
        let undone = TrashUndo.putBack(outcome.moved) { from, to in
            if to.lastPathComponent == "b.bin" { throw DiskFailure("No room.") }
            try FileManager.default.moveItem(at: from, to: to)
        }
        XCTAssertEqual(undone.restored.map(\.plan.name), ["c.bin", "a.bin"])
        XCTAssertEqual(undone.stuck.map(\.plan.name), ["b.bin"])
        XCTAssertEqual(TrashUndo.problem(stuck: undone.stuck), "Pith couldn’t put b.bin back. Open the Trash in Finder and drag it out instead.")
        XCTAssertEqual(items.map(exists), [true, false, true])
    }

    // MARK: Helpers

    /// A file of 4 bytes at `name` in the test's folder, its folders made as needed.
    private func file(_ name: String) throws -> URL {
        let url = folder.appendingPathComponent(name)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("test".utf8).write(to: url)
        return url
    }

    private func exists(_ url: URL) -> Bool { FileManager.default.fileExists(atPath: url.path) }

    /// A map of the test's folder holding `files` of 4 bytes each and `folders`, each the size of the files inside it.
    /// `DiskResult.item(at:)` finds an item by its path at any depth, so every one is listed at the root.
    private func map(_ files: [URL], folders: [URL] = []) -> DiskResult {
        let children = files.map { DiskNode(kind: .file, name: $0.lastPathComponent, path: $0.path, size: 4, children: nil) }
            + folders.map { folder in
                let inside = UInt64(files.filter { $0.path.hasPrefix(folder.path + "/") }.count)
                return DiskNode(kind: .dir, name: folder.lastPathComponent, path: folder.path, size: 4 * inside, files: inside, children: [])
            }
        let summary = DiskSummary(dirs: 1, files: UInt64(files.count), bytes: UInt64(4 * files.count), errors: 0, unreadable: .init(protected: 0, denied: 0, other: 0),
                                  entryErrors: 0, cloudOnly: .init(files: 0, bytes: 0, folders: 0), elapsedMs: 1, engine: "std")
        return DiskResult(root: DiskNode(kind: .dir, name: folder.lastPathComponent, path: folder.path, size: UInt64(4 * files.count), children: children),
                          topFiles: [], summary: summary)
    }

    private func plan(_ items: [URL], in result: DiskResult, home: URL? = nil) -> Result<TrashBatch, DiskFailure> {
        TrashBatch.plan(items.map(\.path), result: result, home: home ?? folder.appendingPathComponent("home"))
    }

    private func refusal(_ items: [URL], in result: DiskResult, home: URL? = nil) -> String? {
        if case .failure(let failure) = plan(items, in: result, home: home) { return failure.message }
        return nil
    }

    /// The test's Trash: a folder for each item, as an automated run of Pith keeps them.
    private func moveIntoTrash(_ item: URL) throws -> URL? {
        let holder = trash.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: holder, withIntermediateDirectories: true)
        let moved = holder.appendingPathComponent(item.lastPathComponent)
        try FileManager.default.moveItem(at: item, to: moved)
        return moved
    }

    /// The test's Trash refusing the item named `name`, and taking the rest.
    private func refusing(_ name: String) -> (URL) throws -> URL? {
        { item in
            if item.lastPathComponent == name { throw DiskFailure("The file is locked.") }
            return try self.moveIntoTrash(item)
        }
    }

    private func moveBack(_ from: URL, _ to: URL) throws {
        try FileManager.default.moveItem(at: from, to: to)
    }
}
