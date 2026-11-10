import Foundation

/// A move to the Trash that Undo can still put back: what it moved and where (`TrashMove`), what the notice says of it,
/// and what the map had of each item that moved, by its path, which Undo puts back on whatever map is open by then. A
/// class, since its registration with the undo manager is by its identity (`TrashUndoStack`).
public final class TrashRecord: Sendable {
    public let moves: [TrashMove]
    /// What the notice of the move says (`TrashOutcome.note`).
    public let note: String
    /// What the map had of each item that moved, by its path: its node, its largest files, the places it held, and
    /// whether the map folded it into its folder's smaller items.
    public let items: [String: LiveEdits.Restored]

    /// About how much memory the record keeps, which the stack's budget counts: measured with the process's footprint,
    /// a record of a file moved alone kept 2,064 to 2,088 bytes, and one of a folder the map drew with 20,201 nodes in it
    /// 7.16 to 7.17 MB, 354 bytes a node. So 1.5 KB a move, and 360 bytes for each node, largest file, place and folder
    /// the map couldn't read that it keeps of the items.
    public let bytes: Int

    public init(moves: [TrashMove], note: String, items: [String: LiveEdits.Restored]) {
        self.moves = moves; self.note = note; self.items = items
        func nodes(_ node: DiskNode) -> Int { 1 + (node.children ?? []).reduce(0) { $0 + nodes($1) } }
        let kept = items.values.reduce(0) { $0 + nodes($1.node) + $1.topFiles.count + $1.places.count + $1.unreadable.count }
        bytes = 1_536 * max(1, moves.count) + 360 * kept + note.utf8.count
    }
}

/// The moves to the Trash Undo can still put back, the latest last. Each is registered with the undo manager it came
/// with on its own, as Move to Trash, carrying its own record, so each ⌘Z undoes its own move, the latest first,
/// wherever the map is then. The note's Undo undoes the latest, and takes it out of its undo manager first, so ⌘Z after
/// it undoes the move before. Undo moves nothing back to the Trash, so it registers nothing and there's no Redo.
///
/// The undo manager doesn't keep what a registration is by (`UndoManager.registerUndo(withTarget:handler:)`), so the
/// stack keeps each record until it's undone, or nothing can undo it any more: its undo manager is gone, as when its
/// window closed, or it had none and a later move took the note. It keeps within a budget of memory, letting the oldest
/// moves go, out of their undo managers too, so ⌘Z stops at the oldest kept.
@MainActor public final class TrashUndoStack {
    private struct Held {
        let record: TrashRecord
        /// None from the start, or gone since.
        weak var undoManager: UndoManager?
    }

    private var held: [Held] = []
    private let perform: @MainActor (TrashRecord) -> Void
    private let budget: Int

    /// The most memory the records keep together (`TrashRecord.bytes`): 16 MiB, the budget the icon store keeps its
    /// drawings within (`IconStore`). That holds thousands of moves of a file each, at about 2 KB, and the latest two
    /// moves of a folder the map draws 20,000 nodes in, at about 7.2 MB each.
    public static let defaultBudget = 16 << 20

    /// A stack whose Undo of a record is `undo`, keeping its records within `budget` bytes.
    public init(budget: Int = TrashUndoStack.defaultBudget, undo: @escaping @MainActor (TrashRecord) -> Void) {
        self.budget = budget
        perform = undo
    }

    /// The moves Undo can still put back, the latest last.
    public var records: [TrashRecord] { held.map(\.record) }

    /// A move to the Trash, which `undoManager`'s Undo puts back, or only the note's when there's none.
    public func moved(_ record: TrashRecord, undoManager: UndoManager?) {
        held.removeAll { $0.undoManager == nil }
        held.append(Held(record: record, undoManager: undoManager))
        guard let undoManager else { return }
        // A move lands after the event that asked for it, in a task of its own. A window's undo manager groups by event,
        // and a group opened outside one stays open until the next, so every move landing before then joined it, for
        // one ⌘Z to undo them all: each move is a group of its own. One registered inside a group already open joins it.
        let own = undoManager.groupingLevel == 0, byEvent = undoManager.groupsByEvent
        if own {
            undoManager.groupsByEvent = false
            undoManager.beginUndoGrouping()
        }
        undoManager.registerUndo(withTarget: record) { [weak self] record in
            MainActor.assumeIsolated { self?.take(record, unregistering: false) }
        }
        undoManager.setActionName("Move to Trash")
        if own {
            undoManager.endUndoGrouping()
            undoManager.groupsByEvent = byEvent
        }
        keepWithinBudget()
    }

    /// Lets the oldest records go, out of their undo managers too, until the rest keep within the budget. The latest
    /// stays, however large, for the note's Undo.
    private func keepWithinBudget() {
        var kept = held.reduce(0) { $0 + $1.record.bytes }
        while kept > budget, held.count > 1 {
            let oldest = held.removeFirst()
            oldest.undoManager?.removeAllActions(withTarget: oldest.record)
            kept -= oldest.record.bytes
        }
    }

    /// The note's Undo of `record`, the latest move: out of its undo manager first, so ⌘Z next undoes the one before.
    public func undo(_ record: TrashRecord) {
        take(record, unregistering: true)
    }

    private func take(_ record: TrashRecord, unregistering: Bool) {
        guard let index = held.firstIndex(where: { $0.record === record }) else { return }
        let taken = held.remove(at: index)
        if unregistering { taken.undoManager?.removeAllActions(withTarget: record) }
        perform(record)
    }
}
