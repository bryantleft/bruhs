import Foundation
import PithCore

/// The startup disk's live map: starting it, showing it or a folder in it, asking for its trees as it changes and
/// as folders open, and showing each tree that comes as the person's own changes have it, until its index has them.
extension DiskModel {
    var liveSnapshot: URL? { scansFolder?.appendingPathComponent("startup-disk.index") }

    /// Starts the live map of `root`, the startup disk unless a test gives a folder of its own, keeping it between
    /// launches as Settings says unless `keep` says otherwise.
    func startLive(root: String = "/", keep: Bool? = nil) {
        guard live == nil else { return }
        let live = LiveMap(root: root)
        live.received = { [weak self] tree in self?.liveTreeArrived(tree) }
        live.treeFailed = { [weak self] request, reason in self?.liveTreeFailed(reason, request: request) }
        live.changed = { [weak self] in self?.refreshLive() }
        // Check Again's map comes at once, past the wait between refreshes, and shows at once, as Refresh's does.
        live.checkedAgain = { [weak self] in self?.refreshLive(now: true, checkedAgain: true) }
        live.listedEveryFolder = { [weak self] since in self?.listedEveryFolder(since: since) }
        self.live = live
        liveView = root
        scope = root
        live.start(binary: binary, snapshot: keep ?? remembersScans ? liveSnapshot : nil)
    }

    /// Disk came on screen or left it. On screen, the map refreshes as it changes, and the first map gets made.
    func visibilityChanged(_ visible: Bool) {
        isVisible = visible
        guard visible, let live, liveView != nil else { return }
        live.makeFirstMap()
        refreshLive()
    }

    /// Shows `path` from the live map: the startup disk, or a folder in it.
    func showLive(_ path: String) {
        guard let live else { return }
        operation?.cancel()
        runner.cancelImmediately()
        watcher?.stop(); watcher = nil
        changes = DiskChanges()
        generation = UUID()
        isScanning = false; rescanning = nil; progress = nil
        problem = nil; note = nil; scannedAt = nil; scanBegan = nil; edited = false; trashed = nil
        if result?.root.path != path {
            select([])
            result = nil
            mapStartsOver()
            volumeUse = nil
            revision = UUID()
        }
        sideColumn.mapIsntLive()
        liveView = path
        scope = path
        live.makeFirstMap()
        refreshLive(now: true)
    }

    /// Asks the live map for the view's tree, at most every two seconds, unless a folder just opened whose detail the
    /// tree lacks. A map of the whole startup disk is a few megabytes of JSON for Pith to decode and the page to lay
    /// out, so it doesn't follow every listing. A folder shown `now`, or one opened, is the person's own ask, and so is
    /// the tree after their Check Again has landed (`checkedAgain`), which comes even when nothing changed
    /// (`LiveTreeAsks`).
    func refreshLive(now: Bool = false, opening: Bool = false, checkedAgain: Bool = false) {
        guard let live, let path = liveView, live.state.isMapped, isVisible || result == nil || now else { return }
        guard live.changedSinceTree || result?.root.path != path || openFolderNeedsDetail || checkedAgain else { return }
        let wait = 2.0 - Date().timeIntervalSince(lastTree)
        if wait > 0 && !now && !(opening && openFolderNeedsDetail) {
            guard treeLater == nil else { return }
            treeLater = Task { [weak self] in
                try? await Task.sleep(for: .seconds(wait))
                guard let self, !Task.isCancelled else { return }
                self.treeLater = nil
                self.refreshLive()
            }
            return
        }
        treeLater?.cancel(); treeLater = nil
        lastTree = Date()
        if let request = live.request(path: path, focus: detailFolder, places: sideColumn.places.shortcuts.map(\.path), gone: liveEdits.gone,
                                      back: liveEdits.back) {
            treeAsks.asked(checkedAgain ? .checkAgain : now || opening ? .opening : .refresh, request: request)
        }
        detailAsked = detailFolder
    }

    /// The open folder, or the one the page wants while the tree leaves it out, when it's inside the view: the map
    /// shows it in finer detail.
    private var detailFolder: String? {
        guard let path = liveView, let open = wantedFolder ?? openFolder, open != path, open.hasPrefix(path == "/" ? "/" : path + "/") else { return nil }
        return open
    }
    private var openFolderNeedsDetail: Bool { detailFolder != detailAsked }

    /// A live map came. Its volume's figures are measured off the main thread first, and whether the items the person
    /// changed are on the disk, and then the map goes out with its figures, as the person's changes have it.
    private func liveTreeArrived(_ tree: LiveTree) {
        guard tree.map.root.path == liveView else { return }
        liveMaps += 1
        let number = liveMaps
        // A change the index never shows, as a hard-linked file put back whose bytes it counts at another link, is held
        // for a minute at most (`LiveEdits.longestHold`).
        for edit in liveEdits.expire(at: Date()) {
            NSLog("Pith: the live map’s index didn’t show the change to \(edit.path) within \(Int(LiveEdits.longestHold)) s, so the maps after it no longer hold it.")
        }
        let changed = Set(liveEdits.gone + liveEdits.back)
        Task {
            async let figures = self.figures(for: tree.map.root.path)
            let onDisk = changed.isEmpty ? [] : await Task.detached(priority: .utility) { Set(changed.filter(Self.exists)) }.value
            let measured = await figures
            guard number == liveMaps else { return }
            liveEdits.keep(onDisk: onDisk, of: changed)
            showLive(tree, figures: measured)
        }
    }

    /// Whether something is at `path`, without following a symbolic link there.
    nonisolated static func exists(_ path: String) -> Bool {
        var info = stat()
        return lstat(path, &info) == 0
    }

    private func showLive(_ tree: LiveTree, figures: VolumeFigures?) {
        guard tree.map.root.path == liveView else { return }
        probeDiskAccess()
        // A map from an index that doesn't show the person's changes yet shows them anyway, and is then no longer the
        // scanner's own JSON.
        let edited = liveEdits.apply(to: tree.map, places: tree.places, answer: tree.answer)
        liveMapsShown += 1
        smokeTestSawLiveMap?(edited.map, tree.answer)
        if let live { sideColumn.liveTreeArrived(root: live.root, places: edited.places) }
        settingLive = true
        volumeUse = figures
        result = edited.map
        resultJSON = edited.changed ? nil : tree.json
        settingLive = false
        scope = tree.map.root.path
        compareWithBaseline(edited.map)
        keepSelection()
        // The map after the person's Check Again shows at once, as Refresh's does.
        if treeAsks.arrived(request: tree.request) { mapAnswersPerson = true }
        revision = UUID()
    }

    /// The person changed the live map, moving items to the Trash or putting them back: the map shows the change at once,
    /// and the maps after it show it too until the index has it. A map asked for before is dropped, as are the maps on
    /// their way, and the live map lists the folders the change touched again at once, past their cooldowns: each
    /// item's folder, and the folder it went to or came from where the map can read it, as the Trash once Pith has Full
    /// Disk Access.
    func followChange(_ moves: [TrashMove]) {
        guard let live, liveView != nil else { return }
        liveMaps += 1
        live.dropTree()
        if smokeTestAsksBeforeRelisting { refreshLive(now: true) }
        var folders = moves.map { $0.plan.target.deletingLastPathComponent().path }
        if trashOnMap != nil { folders += moves.compactMap { $0.trashed?.deletingLastPathComponent().path } }
        var asked = Set<String>()
        for folder in folders where DiskChanges.isInside(folder, live.root) && asked.insert(folder).inserted {
            live.relist(folder, deep: false)
        }
    }

    /// Lists a folder of the live map again, with everything in it, for when it looks off. Once that has landed, its map
    /// comes at once and shows at once (`LiveMap.checkedAgain`).
    func checkAgain(_ folder: String) {
        live?.checkAgain(folder)
    }

    /// Lists the folders the map couldn't read again, as after Full Disk Access is granted.
    func retryUnreadable() {
        live?.retryUnreadable()
    }
}
