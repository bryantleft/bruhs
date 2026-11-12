import Foundation
import PithCore

/// Move to Trash and Undo: planning a move, moving the items and taking them off the map at once, and putting them
/// back where they were, each move with an Undo of its own.
extension DiskModel {
    /// What moving the items at `paths` to the Trash would do, or why they can't go (`TrashBatch.plan`), planned off the
    /// main thread: it looks each item and the folders Pith protects up on the disk.
    func trashPlan(for paths: [String]) async -> Result<TrashBatch, DiskFailure> {
        guard let result else { return .failure(DiskFailure("Open the map first.")) }
        // A selected item the map folds into its folder's smaller items since is planned from what it last showed.
        let home = FileManager.default.homeDirectoryForCurrentUser, kept = selection.shown
        return await Task.detached(priority: .userInitiated) { TrashBatch.plan(paths, result: result, home: home, kept: kept) }.value
    }

    /// The selection's plan when `paths` is the selection and its plan is in hand, waited for while it's being made, or a
    /// plan made for `paths` now.
    func trashPlan(forSelected paths: [String]) async -> Result<TrashBatch, DiskFailure> {
        if paths == selection.paths {
            if let selectedPlan { return selectedPlan }
            if let planning { await planning.value; if paths == selection.paths, let selectedPlan { return selectedPlan } }
        }
        return await trashPlan(for: paths)
    }

    /// Moves the items at `paths` to the Trash at once, as Finder does, since Undo can put them back. If any can't go,
    /// none do, and Pith says which and why. A synced item or Photos library asks first, once for them all: the Trash also
    /// takes it off the person's other devices or out of Photos. The items are planned again, off the main thread, since
    /// the disk can have changed since they were selected.
    func requestTrash(_ paths: [String], undoManager: UndoManager?) {
        guard result != nil, !isScanning, !isTrashing else { return }
        beganTrashWork()
        movesUnderWay += 1
        Task {
            // Until it's planned, and then as its move, which counts itself (`move`).
            defer { movesUnderWay -= 1 }
            let plan = await trashPlan(for: paths)
            endedTrashWork()
            switch plan {
            case .failure(let failure): problem = DiskProblem(message: failure.message)
            case .success(let batch) where batch.asks: confirming = batch
            // After an Undo ⌘Z began while the items were planned, rather than not at all.
            case .success(let batch): if result != nil, !isScanning { move(batch, undoManager: undoManager) }
            }
        }
    }

    /// Moves the items to the Trash, off the main thread, and takes them off the map once they've moved. On the live map,
    /// the maps after it leave them off too, until its index has them (`followChange`). One Undo puts back every item
    /// that moved. A move that stops at an item it can't move says which moved and which stayed, and its Undo puts back
    /// the ones that moved.
    func trash(_ batch: TrashBatch, undoManager: UndoManager?) {
        guard result != nil, !isScanning, !isTrashing else { return }
        move(batch, undoManager: undoManager)
    }

    private func move(_ batch: TrashBatch, undoManager: UndoManager?) {
        problem = nil
        let mover = Self.mover(into: trashFolder)
        movesUnderWay += 1
        afterTrashWork {
            // With the file systems mounted then, which say which folders the live map lists again (`followChange`).
            let (outcome, mounts) = await Task.detached(priority: .userInitiated) { (batch.move(with: mover), MountTable.current()) }.value
            self.moved(outcome, undoManager: undoManager, mounts: mounts)
            self.movesUnderWay -= 1
        }
    }

    /// Runs `work` once the move to the Trash or Undo under way has ended, as trash work.
    private func afterTrashWork(_ work: @escaping @MainActor () async -> Void) {
        let earlier = trashing
        beganTrashWork()
        trashing = Task {
            await earlier?.value
            await work()
            endedTrashWork()
        }
    }

    private func beganTrashWork() { trashWork += 1; isTrashing = true }
    private func endedTrashWork() { trashWork -= 1; isTrashing = trashWork > 0 }

    /// Takes what `outcome` moved off the map shown: off its tree, its largest files and Places, out of the selection,
    /// and, on the live map, off the maps after it. What the map had of each item goes with the move's own record, which
    /// its own Undo puts back (`TrashUndoStack`). `mounts` is the mount table as the move ended.
    private func moved(_ outcome: TrashOutcome, undoManager: UndoManager?, mounts: MountTable) {
        if let message = outcome.problem { problem = DiskProblem(message: message) }
        guard let note = outcome.note, let result else { return }
        var updated = result, items: [String: LiveEdits.Restored] = [:], nodes: [DiskNode] = []
        for move in outcome.moved {
            let path = move.plan.target.path
            // As the map shows it, or as it last showed it, for a selected item it folds into its folder's smaller items.
            let node = result.item(at: path) ?? selection.shown[path] ?? Self.node(of: move.plan)
            // One the tree folds away takes its size out of the smaller items that count it, no more than they hold, so
            // an item kept with the size an earlier map showed takes only what's there, and what it took is what its Undo
            // puts back, and what the live map's maps after it leave out.
            let taken = updated.taking(path, folded: node)
            updated = taken?.map ?? updated
            let left = taken?.item ?? node
            nodes.append(left)
            // A place it held leaves Places with it, its largest files leave Largest files, and the folders in it the map
            // couldn't read leave their list, until Undo puts them back.
            let inside = { (other: String) in DiskChanges.isInside(other, path) }
            items[path] = LiveEdits.Restored(node: left, topFiles: result.topFiles.filter { inside($0.path) }, places: sideColumn.tookOff(path),
                                             folded: result.root.node(at: path) == nil, unreadable: result.unreadableFolders.filter { inside($0.path) })
        }
        if liveView != nil {
            liveEdits.trashed(nodes)
            followChange(outcome.moved, mounts: mounts)
        }
        self.result = updated
        if liveView == nil { edited = true }
        // What moved leaves the selection; what stayed where it was stays selected.
        let gone = Set(outcome.moved.map(\.plan.target.path))
        var kept = selection
        kept.keep { !gone.contains($0) }
        setSelection(kept)
        let record = TrashRecord(moves: outcome.moved, note: note, items: items)
        trashed = record
        undos.moved(record, undoManager: undoManager)
        mapAnswersPerson = true
        revision = UUID()
    }

    /// An item the map didn't hold by itself when it moved, as its plan says it was.
    private static func node(of plan: TrashPlan) -> DiskNode {
        DiskNode(kind: plan.isFolder ? .dir : .file, name: plan.name, path: plan.target.path, size: plan.size, files: plan.isFolder ? plan.files : nil,
                 children: plan.isFolder ? [] : nil)
    }

    /// Moves an item to the person's Trash, as Finder does, and says where it went. An automated run never touches the
    /// person's Trash (`Launch.isAutomated`): it moves the item into `trashFolder` instead, and Undo moves it back from
    /// there as from the Trash. This is the one way Pith moves an item to the Trash.
    nonisolated private static func mover(into trashFolder: URL?) -> @Sendable (URL) throws -> URL? {
        { item in
            guard Launch.isAutomated else {
                var trashedURL: NSURL?
                try FileManager.default.trashItem(at: item, resultingItemURL: &trashedURL)
                return trashedURL as URL?
            }
            guard let trashFolder else { throw DiskFailure("An automated run of Pith doesn’t use your Trash.") }
            // A folder for each item, so two items of the same name never meet.
            let holder = trashFolder.appendingPathComponent(UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(at: holder, withIntermediateDirectories: true)
            let moved = holder.appendingPathComponent(item.lastPathComponent)
            try FileManager.default.moveItem(at: item, to: moved)
            return moved
        }
    }

    /// The notice's Undo: puts back the latest move, which ⌘Z then no longer undoes, so ⌘Z next undoes the one before.
    /// It waits while a move is under way, whose note this isn't yet (`canUndoMove`).
    func undoTrash() {
        guard let trashed, canUndoMove else { return }
        undos.undo(trashed)
    }

    /// Moves every item of `record`'s move back where it was, off the main thread, once the move or Undo under way has
    /// ended, and puts each back on the map open now, where it was, selecting them again, when that map holds it. On the
    /// live map, the maps after it keep them, until its index has listed them again. Moving back never overwrites
    /// anything: one that can't go back stays in the Trash, and off the map, and Pith says which (`TrashUndo.putBack`).
    func undoTrash(_ record: TrashRecord) {
        if trashed === record { trashed = nil }
        let moves = record.moves
        afterTrashWork {
            // With the file systems mounted then, which say which map holds each item (`putBack`).
            let (restored, stuck, mounts) = await Task.detached(priority: .userInitiated) {
                let (restored, stuck) = TrashUndo.putBack(moves) { try FileManager.default.moveItem(at: $0, to: $1) }
                return (restored, stuck, MountTable.current())
            }.value
            if let message = TrashUndo.problem(stuck: stuck) { self.problem = DiskProblem(message: message) }
            let items = restored.compactMap { record.items[$0.plan.target.path] }
            guard !items.isEmpty else { return }
            self.putBack(items, moved: restored, mounts: mounts)
        }
    }

    /// Puts `items`, which Undo moved back on the disk, on the map open now, where each was: in its folder, or in the
    /// smaller items of the deepest folder the map shows on its way, as the map had it or as the map is now. Only the
    /// items the map holds go on it, inside its root and on the volume it shows, by `mounts`, the mount table as they
    /// came back (`MountTable.mapOf(_:holds:)`): an item moved on another disk's map stays off the startup disk's, though
    /// its path is inside `/`. The live map's maps after it keep only what the live map holds, Places follows those,
    /// and the selection is the items on the map open now, or as it was when it holds none.
    private func putBack(_ items: [LiveEdits.Restored], moved: [TrashMove], mounts: MountTable) {
        var changed = false
        if let live, liveView != nil {
            let held = items.filter { mounts.mapOf(live.root, holds: $0.node.path) }
            if !held.isEmpty {
                liveEdits.putBack(held)
                followChange(moved, mounts: mounts)
                for item in held { sideColumn.putBack(item.places) }
                changed = true
            }
        }
        let root = result?.root.path
        let onMap = items.filter { item in root.map { mounts.mapOf($0, holds: item.node.path) } ?? false }
        if let current = result, !onMap.isEmpty {
            var drawn = false
            result = onMap.reduce(current) { map, item in
                guard let with = map.puttingBack(item) else { return map }
                drawn = true
                return with
            }
            // A scanned map has items its scan didn't now, as Move to Trash left it without them.
            if drawn, liveView == nil { edited = true }
            changed = true
        }
        guard changed else { return }
        mapAnswersPerson = true
        revision = UUID()
        let selected = onMap.filter { $0.node.path != root }
        if !selected.isEmpty { setSelection(DiskSelection(items: selected.reversed().map(\.node))) }
    }

    func dismissTrashNote() { trashed = nil }
}
