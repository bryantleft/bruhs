import XCTest
@testable import PithCore

/// Every ⌘Z undoes its own Move to Trash: each move registers with the window's undo manager on its own, carrying its
/// own record of what it moved and where, so Undo goes back through the moves, the latest first, and the note's Undo
/// undoes the latest. The undo manager is Foundation's own, as a window has it.
@MainActor final class TrashUndoStackTests: XCTestCase {
    /// A move of one item, `name`, from /r to the Trash.
    private func record(_ name: String) -> TrashRecord {
        let plan = TrashPlan(target: URL(fileURLWithPath: "/r/\(name)"), name: name, size: 1, files: 1, isFolder: false, consequences: [])
        return TrashRecord(moves: [TrashMove(plan: plan, trashed: URL(fileURLWithPath: "/trash/\(name)"))], note: "Moved \(name)", items: [:])
    }

    /// An undo manager as a window's is, grouping what's registered by event. A move lands after the event that asked for
    /// it, in a task of its own, and no event comes between the moves here, as none needs to in the app: the smoke test's
    /// moves come one after another with nothing in between, and so can the person's.
    private func manager() -> UndoManager { UndoManager() }

    private func move(_ record: TrashRecord, on stack: TrashUndoStack, with manager: UndoManager?) {
        stack.moved(record, undoManager: manager)
    }

    func testEachUndoUndoesItsOwnMoveTheLatestFirst() {
        var undone: [String] = []
        let stack = TrashUndoStack { undone.append($0.note) }
        let window = manager()
        for name in ["a", "b", "c"] { move(record(name), on: stack, with: window) }
        XCTAssertEqual(window.undoActionName, "Move to Trash")
        XCTAssertTrue(window.groupsByEvent, "left grouping by event, for whatever else registers with it")
        XCTAssertEqual(window.groupingLevel, 0, "no group left open for the next move to join")
        window.undo()
        window.undo()
        XCTAssertEqual(undone, ["Moved c", "Moved b"], "the second ⌘Z undoes the move before the last")
        // A later move, then ⌘Z twice: that move, then the one left from before it.
        move(record("d"), on: stack, with: window)
        window.undo()
        window.undo()
        XCTAssertEqual(undone, ["Moved c", "Moved b", "Moved d", "Moved a"])
        XCTAssertFalse(window.canUndo)
        XCTAssertTrue(stack.records.isEmpty, "nothing is held once every move is undone")
        XCTAssertFalse(window.canRedo, "Undo registers no move back to the Trash, so there's no Redo")
    }

    /// The note's Undo undoes the latest move and takes it out of the undo manager, so ⌘Z after it undoes the move
    /// before, never the same one again.
    func testTheNotesUndoUndoesTheLatestAndCommandZThenTheOneBefore() {
        var undone: [String] = []
        let stack = TrashUndoStack { undone.append($0.note) }
        let window = manager()
        let a = record("a"), b = record("b")
        move(a, on: stack, with: window)
        move(b, on: stack, with: window)
        XCTAssertTrue(stack.records.last === b)
        stack.undo(b)
        XCTAssertEqual(undone, ["Moved b"])
        XCTAssertTrue(window.canUndo)
        window.undo()
        XCTAssertEqual(undone, ["Moved b", "Moved a"])
        XCTAssertFalse(window.canUndo)
        stack.undo(b)
        stack.undo(a)
        XCTAssertEqual(undone.count, 2, "a move undone already isn't undone again")
    }

    /// The records keep within a budget of memory: past it the oldest moves go, out of the undo manager too, so ⌘Z
    /// stops at the oldest kept. The latest is always kept, for the note's Undo, however large.
    func testTheStackKeepsWithinItsBudgetLettingTheOldestMovesGo() {
        var undone: [String] = []
        let a = record("a"), b = record("b"), c = record("c")
        let stack = TrashUndoStack(budget: a.bytes * 2) { undone.append($0.note) }
        let window = manager()
        for moved in [a, b, c] { move(moved, on: stack, with: window) }
        XCTAssertEqual(stack.records.map(\.note), ["Moved b", "Moved c"], "a went, to keep within the budget")
        window.undo()
        window.undo()
        XCTAssertEqual(undone, ["Moved c", "Moved b"])
        XCTAssertFalse(window.canUndo, "a's registration went with it")
        let tight = TrashUndoStack(budget: 1) { undone.append($0.note) }
        move(record("d"), on: tight, with: window)
        move(record("e"), on: tight, with: window)
        XCTAssertEqual(tight.records.map(\.note), ["Moved e"], "the latest stays, over the budget alone")
    }

    /// A move with no undo manager, which only the note's Undo can undo, still counts against the budget, so the oldest
    /// moves go at once rather than staying over it until the next move with one.
    func testAMoveWithNoUndoManagerKeepsTheStackWithinItsBudgetToo() {
        var undone: [String] = []
        let a = record("a"), b = record("b"), c = record("c")
        let stack = TrashUndoStack(budget: a.bytes * 2) { undone.append($0.note) }
        let window = manager()
        move(a, on: stack, with: window)
        move(b, on: stack, with: window)
        stack.moved(c, undoManager: nil)
        XCTAssertEqual(stack.records.map(\.note), ["Moved b", "Moved c"], "a went, to keep within the budget")
        window.undo()
        XCTAssertEqual(undone, ["Moved b"])
        XCTAssertFalse(window.canUndo, "a's registration went with it")
    }

    /// What a record keeps, from what was measured (`TrashRecord.bytes`): a file moved alone about 2 KB, and a folder
    /// whose map drew 20,201 nodes in it about 7.2 MB.
    func testARecordsSizeIsWhatItKeeps() {
        XCTAssertEqual(Double(record("a").bytes), 2_100, accuracy: 600)
        let leaves = (0..<100).map { DiskNode(kind: .file, name: "f\($0)", path: "/r/big/d/f\($0)", size: 1, children: nil) }
        let folders = (0..<200).map { DiskNode(kind: .dir, name: "d\($0)", path: "/r/big/d\($0)", size: 100, files: 100, children: leaves) }
        let big = DiskNode(kind: .dir, name: "big", path: "/r/big", size: 20_000, files: 20_000, children: folders)
        let plan = TrashPlan(target: URL(fileURLWithPath: "/r/big"), name: "big", size: 20_000, files: 20_000, isFolder: true, consequences: [])
        let moved = TrashRecord(moves: [TrashMove(plan: plan, trashed: URL(fileURLWithPath: "/trash/big"))], note: "Moved big",
                                items: ["/r/big": .init(node: big, topFiles: [], places: [])])
        XCTAssertEqual(Double(moved.bytes), 7_170_000, accuracy: 500_000)
    }

    /// A move registered with no undo manager, as the smoke test makes some, can only be undone by the note's Undo, so
    /// it's let go once a later move takes the note; one whose window has closed, taking its undo manager, is let go too.
    func testAMoveNothingCanUndoAnyMoreIsLetGo() {
        var undone: [String] = []
        let stack = TrashUndoStack { undone.append($0.note) }
        let a = record("a"), b = record("b")
        stack.moved(a, undoManager: nil)
        XCTAssertEqual(stack.records.map(\.note), ["Moved a"])
        var closing: UndoManager? = manager()
        move(b, on: stack, with: closing)
        XCTAssertEqual(stack.records.map(\.note), ["Moved b"], "nothing could undo a any more")
        weak let gone = closing
        closing = nil
        XCTAssertNil(gone, "the stack keeps no window's undo manager alive")
        let c = record("c")
        stack.moved(c, undoManager: nil)
        XCTAssertEqual(stack.records.map(\.note), ["Moved c"], "b's window closed")
        stack.undo(c)
        XCTAssertEqual(undone, ["Moved c"])
    }
}
