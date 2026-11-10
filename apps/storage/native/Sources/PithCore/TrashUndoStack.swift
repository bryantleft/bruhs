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

    public init(moves: [TrashMove], note: String, items: [String: LiveEdits.Restored]) {
        self.moves = moves; self.note = note; self.items = items
    }
}

/// The moves to the Trash Undo can still put back, the latest last. Each is registered with the undo manager it came
/// with on its own, as Move to Trash, carrying its own record, so each ⌘Z undoes its own move, the latest first,
/// wherever the map is then. The note's Undo undoes the latest, and takes it out of its undo manager first, so ⌘Z after
/// it undoes the move before. Undo moves nothing back to the Trash, so it registers nothing and there's no Redo.
///
/// The undo manager doesn't keep what a registration is by (`UndoManager.registerUndo(withTarget:handler:)`), so the
/// stack keeps each record until it's undone, or nothing can undo it any more: its undo manager is gone, as when its
/// window closed, or it had none and a later move took the note.
@MainActor public final class TrashUndoStack {
    private struct Held {
        let record: TrashRecord
        /// None from the start, or gone since.
        weak var undoManager: UndoManager?
    }

    private var held: [Held] = []
    private let perform: @MainActor (TrashRecord) -> Void

    /// A stack whose Undo of a record is `undo`.
    public init(undo: @escaping @MainActor (TrashRecord) -> Void) { perform = undo }

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
