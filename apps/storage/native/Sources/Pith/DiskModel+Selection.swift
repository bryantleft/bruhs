import AppKit
import PithCore

/// The items selected on the map: picking them, keeping them as newer maps come, the plan for moving them to the
/// Trash, and what deleting them frees now, then Quick Look, Finder and their paths for the items picked.
extension DiskModel {
    /// A click: selects the real items of `paths` in the map shown, none for anything else.
    func select(_ paths: [String]) {
        var next = DiskSelection(paths)
        next.keep { self.result?.item(at: $0) != nil }
        setSelection(next)
    }

    /// A ⌘-click: adds the item at `path` to the selection, or takes it out. A path that's no item of the map changes
    /// nothing.
    func toggle(_ path: String) {
        guard selection.paths.contains(path) || result?.item(at: path) != nil else { return }
        var next = selection
        next.toggle(path)
        setSelection(next)
    }

    /// Shift and an arrow key: adds the item at `path` to the selection, and an item selected already stays, though a
    /// held key asks for it again before the page shows it selected (`DiskSelection.add`). A path that's no item of the
    /// map changes nothing.
    func add(_ path: String) {
        guard result?.item(at: path) != nil else { return }
        var next = selection
        next.add(path)
        setSelection(next)
    }

    /// Makes `next` the selection, with its items, as the map shows them, and plan. Other items than before are measured
    /// afresh, and a measurement of the last ones is dropped.
    func setSelection(_ next: DiskSelection) {
        let changed = next != selection
        var next = next
        let unshown = next.follow(result)
        selection = next
        refreshSelected()
        dropGone(unshown)
        guard changed else { return }
        freesTask?.cancel(); freesTask = nil
        selectedFrees = nil; freesAge = nil
        follow(frees.selected(selectedSizes))
    }

    /// The selection as a newer map has it: an item the map no longer shows, folded into its folder's smaller items, stays
    /// with the size it last showed while it's on the disk (`DiskSelection.follow`), and only one gone from the disk
    /// leaves. What deleting them frees is measured again only once an item's size has moved by more than a megabyte
    /// since it was last measured, one measurement at a time and each after the last one's rest (`FreesSchedule`): a busy
    /// folder changes with every map, and measuring it each time would never stop.
    func keepSelection() {
        guard !selection.isEmpty else { return }
        let unshown = selection.follow(result)
        refreshSelected()
        follow(frees.mapChanged(selectedSizes, at: Date()))
        dropGone(unshown)
    }

    /// Looks off the main thread for the selected items at `paths`, which the map no longer shows, and drops those no
    /// longer on the disk, once the selection is as it was. `lstat` never opens an item, and the map has read each; one
    /// where the map can't read now, or macOS may be holding it, isn't looked at, and stays (`DiskSelection.mayLook`).
    private func dropGone(_ unshown: [String]) {
        let asking = macOSMayHoldFolders
        let paths = unshown.filter { DiskSelection.mayLook(for: $0, in: result, asking: asking, isGuarded: rulePlaces.isProtected) }
        guard !paths.isEmpty else { return }
        let picked = selection.paths
        Task {
            let gone = await Task.detached(priority: .utility) { Set(paths.filter { !Self.exists($0) }) }.value
            guard !gone.isEmpty, selection.paths == picked else { return }
            var kept = selection
            kept.drop(gone)
            setSelection(kept)
        }
    }

    /// The selected items, as the map shows them or last showed them, and their plan. The plan is made off the main
    /// thread when the selection changes, or a newer map changes what a selected path holds, as when a file becomes a
    /// folder; a map that only moves their sizes, or folds an item into its folder's smaller items, keeps it, since what
    /// can go to the Trash, and what Pith asks first, doesn't change with them. Moving them plans them again
    /// (`requestTrash`).
    private func refreshSelected() {
        selectedItems = selection.items
        let planned = PlannedSelection(root: result?.root.path, items: selection.paths.map { path in (path, selection.shown[path]?.kind) })
        guard planned != plannedFor else { return }
        if planned.paths != plannedFor?.paths { selectedPlan = nil }
        plannedFor = planned
        planning?.cancel(); planning = nil
        guard !selection.isEmpty else { return }
        let paths = selection.paths
        planning = Task { [weak self] in
            guard let plan = await self?.trashPlan(for: paths), !Task.isCancelled, let self, self.plannedFor == planned else { return }
            self.planning = nil
            self.selectedPlan = plan
        }
    }

    /// What the selection's plan was made for: the map's root, and each selected path with the kind of item the map has
    /// there.
    struct PlannedSelection: Equatable {
        let root: String?
        let paths: [String]
        let kinds: [DiskNode.Kind?]

        init(root: String?, items: [(String, DiskNode.Kind?)]) {
            self.root = root; paths = items.map(\.0); kinds = items.map(\.1)
        }
    }

    /// The selected items' sizes by path, which say when to measure what deleting them frees again.
    private var selectedSizes: [String: UInt64] {
        Dictionary(selectedItems.map { ($0.path, $0.size) }) { first, _ in first }
    }

    /// Does what the schedule says of what deleting the selection frees: measure now, keep the figure in hand, or measure
    /// once the last measurement's rest ends, if the items still differ then.
    private func follow(_ step: FreesSchedule.Step) {
        if case .wait(let until) = step, freesLater?.until == until { return }
        freesLater?.task.cancel(); freesLater = nil
        switch step {
        case .keep:
            // Back within a megabyte of what was measured, the figure is what they free now again. While a measurement
            // runs, the schedule keeps whatever comes, and the figure says what it said.
            if freesTask == nil, case .changed(let measured, _)? = freesAge { freesAge = .current(measured: measured) }
        case .measure:
            if let measured = freesAge?.measured { freesAge = .changed(measured: measured, again: nil) }
            measureFrees()
        case .wait(let until):
            if let measured = freesAge?.measured { freesAge = .changed(measured: measured, again: until) }
            let task = Task { [weak self] in
                try? await Task.sleep(for: .seconds(max(0, until.timeIntervalSinceNow)))
                guard let self, !Task.isCancelled else { return }
                self.freesLater = nil
                self.follow(self.frees.mapChanged(self.selectedSizes, at: Date()))
            }
            freesLater = (task, until)
        }
    }

    /// Asks the scanner what deleting the selected items frees, in one measurement of them all, so clone groups and
    /// hard links shared among them count once. It waits a moment first, so arrowing across the map doesn't start a walk
    /// for every item passed. One that lands once the selection has changed is dropped. How long it took sets the rest
    /// before the next.
    private func measureFrees() {
        let binary = binary, paths = selection.paths
        freesTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            let began = Date()
            do {
                let measured = try await ScannerRunner.frees(binary: binary, paths: paths)
                guard !Task.isCancelled, let self, self.selection.paths == paths else { return }
                self.freesTask = nil
                self.selectedFrees = measured
                self.freesAge = .current(measured: Date())
                // The items may have moved while they were measured.
                self.follow(self.frees.landed(self.selectedSizes, at: Date(), took: Date().timeIntervalSince(began)))
            } catch {
                guard !Task.isCancelled, let self, self.selection.paths == paths else { return }
                self.freesTask = nil
                NSLog("Pith: couldn't measure what deleting \(paths.joined(separator: ", ")) frees: \(error.localizedDescription)")
                // The figure in hand, if any, says again how old it is: the schedule judges the items by what it was
                // measured of, not by what this measurement began with.
                self.follow(self.frees.failed(self.selectedSizes, at: Date(), took: Date().timeIntervalSince(began)))
            }
        }
    }

    /// Shows the items at `paths` in Quick Look, or the selection's, as many as the map has, or last showed of those it
    /// folds away since they were selected: the panel goes through them.
    func quickLook(_ paths: [String]? = nil) {
        let urls = (paths ?? selection.paths).filter { result?.item(at: $0) != nil || selection.shown[$0] != nil }.map { URL(fileURLWithPath: $0) }
        guard !urls.isEmpty else { return }
        showQuickLook?(urls)
    }

    func reveal(_ paths: [String]) { NSWorkspace.shared.activateFileViewerSelecting(paths.map { URL(fileURLWithPath: $0) }) }

    /// Copies the paths, each on a line of its own, as Finder copies several items' pathnames.
    func copyPath(_ paths: [String]) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(paths.joined(separator: "\n"), forType: .string)
    }
}
