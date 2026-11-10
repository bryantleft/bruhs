import AppKit
import PithCore
import WebKit

/// The smoke test's checks of a selection of several items: ⌘-click, the list of items' add button and Shift-arrow
/// building it on the page, Pith keeping it, and one Move to Trash with one Undo for them all, or for those that moved.
extension AppDelegate {
    /// A click selects one item, and a ⌘-click adds another or takes it out, as in Finder; without a mouse, the add
    /// button in the map's list of items and Shift-arrow on the map do the same. The page tells Pith what was clicked or
    /// pressed and outlines what Pith answers with. The check makes two files of its own in the fixture, 1 MiB each, so
    /// the map lists them by name, then:
    /// - clicks the first in the map's list of items and ⌘-clicks the second: Pith holds both, in that order, and the
    ///   page outlines both blocks and presses both rows;
    /// - ⌘-clicks the fixture's sub/video.mov in Largest files, then its folder, sub: sub takes video.mov's place, since
    ///   it holds it, and its Largest files row is pressed no more;
    /// - ⌘-clicks the first file again, which leaves;
    /// - presses the first file's Add button in the list of items, with no ⌘ down, as VoiceOver's press is, which adds
    ///   it, then its Take Out button, which takes it out again;
    /// - presses Shift and an arrow key on the map twice, before Pith has answered the first, as a held key repeats, which
    ///   adds the nearest item in that direction not selected yet, once, and keeps it.
    /// Rows show the items selected without being toggles: each says "selected" after its name, and none is pressed.
    /// Pith then measures what deleting the three frees in one run over them, of as many files as they hold, and a picture
    /// of the window, with the bar under the map showing them, is saved at `picture`. Escape on the map clears the
    /// selection after.
    func checkSeveralSelected(_ fixture: String, picture: URL) async -> Bool {
        let files = FileManager.default, mark = UUID().uuidString.prefix(8).lowercased()
        let first = (fixture as NSString).appendingPathComponent("pith-pick-\(mark)-a.bin")
        let second = (fixture as NSString).appendingPathComponent("pith-pick-\(mark)-b.bin")
        let sub = (fixture as NSString).appendingPathComponent("sub"), video = (sub as NSString).appendingPathComponent("video.mov")
        defer { for path in [first, second] { try? files.removeItem(atPath: path) } }
        // 1 MiB, the least the live map lists by name (`BIG_FILE`), so each file has a block and a row of its own.
        guard let web = webView, [first, second].allSatisfy({ files.createFile(atPath: $0, contents: Data(count: 1 << 20)) }),
              await eventually({ [first, second].allSatisfy { self.disk.result?.item(at: $0) != nil } }), await mapSettles() else {
            print("several selected: the check's files never reached the map")
            return false
        }
        _ = try? await web.callAsyncJavaScript(Self.leaveTheMap, in: nil, contentWorld: .page)
        /// Clicks `path`'s row, with ⌘ down when `command`, then waits for Pith to hold `selected` and the page to show it.
        func click(_ path: String, command: Bool, in list: String = "items", selecting selected: [String]) async -> Bool {
            let clicked = (try? await web.callAsyncJavaScript(Self.clickRow, arguments: ["path": path, "command": command, "list": list], in: nil,
                                                              contentWorld: .page)) as? Bool == true
            let held = await eventually { self.disk.selection.paths == selected }
            let shown = await pageAnswer(web, Self.shownSelected) { (page: [String: Any]?) in Self.shows(page, selected) }
            print("several selected: \(command ? "⌘-" : "")clicked \((path as NSString).lastPathComponent) \(clicked), Pith holds "
                  + "\(disk.selection.paths.map { ($0 as NSString).lastPathComponent }), the page outlines \(shown?["rings"] as? Int ?? -1) blocks")
            return clicked && held && Self.shows(shown, selected)
        }
        /// Presses the button labelled `label` in the map's list of items, then waits for Pith to hold `selected`.
        func press(_ label: String, selecting selected: [String]) async -> Bool {
            let pressed = (try? await web.callAsyncJavaScript(Self.pressListButton, arguments: ["label": label], in: nil, contentWorld: .page)) as? Bool == true
            let held = await eventually { self.disk.selection.paths == selected }
            let shown = await pageAnswer(web, Self.shownSelected) { (page: [String: Any]?) in Self.shows(page, selected) }
            print("several selected: pressed \(label) \(pressed), Pith holds \(disk.selection.paths.map { ($0 as NSString).lastPathComponent })")
            return pressed && held && Self.shows(shown, selected)
        }
        let one = await click(first, command: false, selecting: [first])
        let two = await click(second, command: true, selecting: [first, second])
        let inner = await click(video, command: true, in: "largest", selecting: [first, second, video])
        let nested = await click(sub, command: true, selecting: [first, second, sub])
        let out = await click(first, command: true, selecting: [second, sub])
        let name = (first as NSString).lastPathComponent
        let added = await press("Add \(name) to the selection", selecting: [second, sub, first])
        let takenOut = await press("Take \(name) out of the selection", selecting: [second, sub])
        // Shift and the arrow key toward an item not selected yet, twice before Pith answers, as a held key repeats: some
        // directions meet the map's edge or its smaller items. The second asks for the item the first added again, and
        // it stays.
        var extended: [String] = []
        for key in ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"] where extended.isEmpty {
            _ = try? await web.callAsyncJavaScript(Self.shiftArrow, arguments: ["key": key, "times": 2], in: nil, contentWorld: .page)
            for _ in 0..<10 where disk.selection.paths.count < 3 { try? await Task.sleep(for: .milliseconds(100)) }
            // Long enough for a second answer that would take it out again.
            try? await Task.sleep(for: .milliseconds(300))
            if disk.selection.paths.count == 3 { extended = disk.selection.paths }
        }
        let grown = extended.count == 3 && Array(extended.prefix(2)) == [second, sub] && disk.result?.item(at: extended[2]) != nil
        let grownShown = grown ? await pageAnswer(web, Self.shownSelected) { (page: [String: Any]?) in Self.shows(page, extended) } : nil
        print("several selected: Shift and an arrow added \(extended.last.map { ($0 as NSString).lastPathComponent } ?? "nothing"), shown \(Self.shows(grownShown, extended))")
        // One measurement of the three, of every file they hold.
        let measured = await eventually { self.disk.selectedFrees != nil }
        let counted = disk.selectedItems.reduce(0) { $0 + $1.fileCount }, frees = disk.selectedFrees
        let bar = !extended.isEmpty && disk.selectedItems.map(\.path) == extended
        if let view = web.window?.contentView, let image = view.bitmapImageRepForCachingDisplay(in: view.bounds) {
            view.cacheDisplay(in: view.bounds, to: image)
            try? image.representation(using: .png, properties: [:])?.write(to: picture)
        }
        print("several selected: \(disk.selectedItems.count) items on the bar, frees now measured \(measured) over \(frees?.files ?? 0) files of their \(counted); "
              + "the window saved to \(picture.path)")
        _ = try? await web.callAsyncJavaScript(Self.escapeOnTheMap, in: nil, contentWorld: .page)
        let cleared = await eventually { self.disk.selection.isEmpty }
        for path in [first, second] { try? files.removeItem(atPath: path) }
        let gone = await eventually { [first, second].allSatisfy { self.disk.result?.item(at: $0) == nil } }
        let settled = await mapSettles()
        return one && two && inner && nested && out && added && takenOut && grown && Self.shows(grownShown, extended) && measured
            && frees?.files == counted && bar && cleared && gone && settled
    }

    /// Several items go to the Trash in one move, with one Undo, as the person makes them: three files of the check's
    /// own, selected with a click and two ⌘-clicks, go with Command-Delete on the map into the run's own folder, never
    /// the person's Trash, and leave the map at once, the page's too; the Edit menu's Undo, once, puts all three back
    /// where they were and on the map, selected again. Then the move stops partway, as when an item is locked: the
    /// middle file is made immutable, the check's own file and no other, and made movable again however the check ends.
    /// The first moves, the notice says so, the problem says the middle one and the last stayed, with why, they stay
    /// selected, and one Undo puts the first back.
    func checkSeveralTrashed(_ fixture: String) async -> [String: Bool] {
        let names = ["several_items_trash_with_one_undo", "trash_stopped_partway_undoes_what_moved"]
        let files = FileManager.default, mark = UUID().uuidString.prefix(8).lowercased()
        let items = (1...3).map { (fixture as NSString).appendingPathComponent("pith-gone-\(mark)-\($0).bin") }
        var inTrash: [URL] = []
        defer {
            for path in items { try? files.removeItem(atPath: path) }
            for url in inTrash { try? files.removeItem(at: url) }
            disk.dismissTrashNote()
        }
        // Run before the removal above, which an immutable file would refuse.
        defer { try? files.setAttributes([.immutable: false], ofItemAtPath: items[1]) }
        guard let web = webView, items.allSatisfy({ files.createFile(atPath: $0, contents: Data(count: 1 << 20)) }),
              await eventually({ items.allSatisfy { self.disk.result?.item(at: $0) != nil } }), await mapSettles() else {
            print("several trashed: the check's files never reached the map")
            return Dictionary(uniqueKeysWithValues: names.map { ($0, false) })
        }
        /// Selects the three files with a click and two ⌘-clicks in the map's list of items: whether Pith holds them,
        /// in order, and the page shows them.
        func pickAll() async -> Bool {
            _ = try? await web.callAsyncJavaScript(Self.leaveTheMap, in: nil, contentWorld: .page)
            for (index, path) in items.enumerated() {
                _ = try? await web.callAsyncJavaScript(Self.clickRow, arguments: ["path": path, "command": index > 0, "list": "items"], in: nil, contentWorld: .page)
                _ = await eventually { self.disk.selection.paths == Array(items.prefix(index + 1)) }
            }
            let picked = await pageAnswer(web, Self.shownSelected) { (page: [String: Any]?) in Self.shows(page, items) }
            return disk.selection.paths == items && Self.shows(picked, items)
        }
        let selected = await pickAll()

        _ = try? await web.callAsyncJavaScript(Self.commandDeleteOnTheMap, in: nil, contentWorld: .page)
        let moved = await eventually { self.disk.trashed?.moves.count == 3 }
        inTrash = disk.trashed?.moves.compactMap(\.trashed) ?? []
        let own = disk.trashFolder.map { folder in inTrash.count == 3 && inTrash.allSatisfy { $0.path.hasPrefix(folder.path + "/") } } ?? false
        let offTheMap = items.allSatisfy { disk.result?.item(at: $0) == nil && !files.fileExists(atPath: $0) }
        func listsNone(_ rows: [String]?) -> Bool {
            rows.map { rows in items.allSatisfy { item in !rows.contains { $0.hasPrefix((item as NSString).lastPathComponent + " ") } } } == true
        }
        let offThePage = listsNone(await pageAnswer(web, Self.listedItems) { listsNone($0) })
        let note = disk.trashed?.note ?? "none"
        print("several trashed: selected \(selected), moved \(moved) into the run's own folder \(own), off the map \(offTheMap) and the page \(offThePage); \(note)")

        // Undo as the Edit menu does it, once, through the undo manager the move registered with.
        let undo = web.window?.undoManager
        let action = undo?.undoActionName ?? ""
        undo?.undo()
        let restored = await eventually { items.allSatisfy { files.fileExists(atPath: $0) } }
        if restored { inTrash = [] }
        let back = await eventually { items.allSatisfy { self.disk.result?.item(at: $0) != nil } } && disk.selection.paths == items
        let onThePage = await pageAnswer(web, Self.shownSelected) { (page: [String: Any]?) in Self.shows(page, items) }
        print("several trashed: one Undo (\(action)) put all three back \(restored), on the map and selected \(back), shown \(Self.shows(onThePage, items))")
        _ = try? await web.callAsyncJavaScript(Self.escapeOnTheMap, in: nil, contentWorld: .page)
        let cleared = await eventually { self.disk.selection.isEmpty }
        let whole = selected && moved && own && offTheMap && offThePage && action == "Move to Trash" && restored && back && Self.shows(onThePage, items)
            && cleared

        // The move stops at the middle file, which can't move while it's immutable.
        let file = items.map { ($0 as NSString).lastPathComponent }
        let locked = (try? files.setAttributes([.immutable: true], ofItemAtPath: items[1])) != nil
        let repicked = await pickAll()
        _ = try? await web.callAsyncJavaScript(Self.commandDeleteOnTheMap, in: nil, contentWorld: .page)
        let stopped = await eventually { self.disk.trashed?.moves.count == 1 && self.disk.problem != nil }
        inTrash = disk.trashed?.moves.compactMap(\.trashed) ?? []
        let firstOnly = disk.trashed?.moves.map(\.plan.target.path) == [items[0]] && !files.fileExists(atPath: items[0])
            && files.fileExists(atPath: items[1]) && files.fileExists(atPath: items[2])
        let noted = disk.trashed?.note.hasPrefix("Moved \(file[0]) to the Trash.") == true
        let problem = disk.problem?.message ?? "none"
        let said = problem.hasPrefix("Pith couldn’t move \(file[1]) to the Trash, so it and \(file[2]) stayed where they were. ")
        let stayed = disk.selection.paths == [items[1], items[2]] && disk.result?.item(at: items[0]) == nil
            && disk.result?.item(at: items[1]) != nil && disk.result?.item(at: items[2]) != nil
        print("several trashed partway: \(file[1]) locked \(locked), picked \(repicked); the note \(disk.trashed?.note ?? "none"); the problem \(problem); "
              + "still selected \(disk.selection.paths.map { ($0 as NSString).lastPathComponent })")
        let partwayUndo = web.window?.undoManager
        let partwayAction = partwayUndo?.undoActionName ?? ""
        partwayUndo?.undo()
        let firstBack = await eventually { files.fileExists(atPath: items[0]) }
        if firstBack { inTrash = [] }
        let reselected = await eventually { self.disk.result?.item(at: items[0]) != nil && self.disk.selection.paths == [items[0]] }
        print("several trashed partway: one Undo (\(partwayAction)) put \(file[0]) back \(firstBack), on the map and selected \(reselected)")
        disk.problem = nil
        _ = try? await web.callAsyncJavaScript(Self.escapeOnTheMap, in: nil, contentWorld: .page)
        let clearedAgain = await eventually { self.disk.selection.isEmpty }
        try? files.setAttributes([.immutable: false], ofItemAtPath: items[1])
        for path in items { try? files.removeItem(atPath: path) }
        let gone = await eventually { items.allSatisfy { self.disk.result?.item(at: $0) == nil } }
        let settled = await mapSettles()
        return [names[0]: whole && gone && settled,
                names[1]: locked && repicked && stopped && firstOnly && noted && said && stayed && partwayAction == "Move to Trash" && firstBack
                    && reselected && clearedAgain && gone && settled]
    }

    /// Move to Trash and Undo hold through the live map's newer maps, which come from its index and can still have the
    /// item as it was: the scanner lists a folder FSEvents names only once it has settled, seconds later, and the
    /// folder Pith asks it to list again at once still waits for the scanner's next turn. A file of the check's own goes
    /// to the run's own folder, and in the very turn the map changes, right after Pith asked for the folder to be listed
    /// again, the live map gets the status line the scanner sends once it lists a change, so a newer map is asked for
    /// at once. Another file in the fixture changes too, from another process. For five seconds, past FSEvents' second
    /// and the scanner's three, the item stays off every map that comes, and off the page. Then one Undo puts it back,
    /// in the same way, and the item stays on every map that comes.
    func checkTrashHoldsThroughNewerMaps(_ fixture: String) async -> [String: Bool] {
        let name = "trash_and_undo_hold_through_newer_maps"
        let files = FileManager.default, mark = UUID().uuidString.prefix(8).lowercased()
        let item = (fixture as NSString).appendingPathComponent("pith-held-\(mark).bin")
        let other = (fixture as NSString).appendingPathComponent("sub/pith-other-\(mark).bin")
        let itemName = (item as NSString).lastPathComponent
        var inTrash: URL?
        defer {
            for path in [item, other] { try? files.removeItem(atPath: path) }
            if let inTrash { try? files.removeItem(at: inTrash) }
            disk.dismissTrashNote()
        }
        // 1 MiB, the least the live map lists by name, so the item has a block of its own. Two seconds with no map, so
        // the next one is asked for at once, not after the wait between maps.
        guard let web = webView, files.createFile(atPath: item, contents: Data(count: 1 << 20)),
              await eventually({ self.disk.result?.item(at: item) != nil }), await mapSettles(quiet: 2.2) else {
            print("trash holds: the check's file never reached the map")
            return [name: false]
        }
        /// As the map next changes, in that very turn: the status line the scanner sends once it lists a change.
        func askAsTheMapChanges() {
            withObservationTracking { _ = self.disk.result } onChange: {
                MainActor.assumeIsolated {
                    self.disk.live?.handle(.status(LiveStatus(through: 0, pending: 0, changed: true, checking: false, historyDone: true, asking: 0)))
                }
            }
        }
        /// Changes the other file from another process, then for five seconds checks the map: whether it had the item as
        /// `present` says every time, how many live maps were shown since `shown` and how many of those came from an
        /// index that didn't show the change yet, and whether the page's list of items agreed at the end.
        func newerMaps(keep present: Bool, megabytes: Int, since shown: (maps: Int, changed: Int)) async -> (held: Bool, maps: Int, changed: Int, page: Bool) {
            _ = Self.fill(other, mebibytes: megabytes)
            var held = true
            let end = Date().addingTimeInterval(5)
            while Date() < end {
                if (disk.result?.item(at: item) != nil) != present { held = false }
                try? await Task.sleep(for: .milliseconds(20))
            }
            let rows = await pageAnswer(web, Self.listedItems) { (rows: [String]?) in rows != nil }
            let page = rows.map { rows in rows.contains { $0.hasPrefix(itemName + " ") } == present } ?? false
            return (held, disk.liveMapsShown - shown.maps, disk.mapsShowingChanges - shown.changed, page)
        }
        let none = (held: false, maps: 0, changed: 0, page: false)
        let undo = web.window?.undoManager
        let before = (disk.liveMapsShown, disk.mapsShowingChanges)
        askAsTheMapChanges()
        disk.requestTrash([item], undoManager: undo)
        let moved = await eventually { self.disk.trashed != nil && !files.fileExists(atPath: item) }
        inTrash = disk.trashed?.moves.first?.trashed
        let gone = moved ? await newerMaps(keep: false, megabytes: 1, since: before) : none
        print("trash holds: moved \(moved); \(gone.maps) newer maps in five seconds, \(gone.changed) from an index that still had it, the item off every "
              + "one \(gone.held), off the page \(gone.page)")

        let quiet = await mapSettles(quiet: 2.2)
        let action = undo?.undoActionName ?? ""
        let beforeUndo = (disk.liveMapsShown, disk.mapsShowingChanges)
        askAsTheMapChanges()
        undo?.undo()
        let restored = await eventually { files.fileExists(atPath: item) && self.disk.result?.item(at: item) != nil }
        if restored { inTrash = nil }
        let back = restored ? await newerMaps(keep: true, megabytes: 2, since: beforeUndo) : none
        print("trash holds: one Undo (\(action)) put it back \(restored); \(back.maps) newer maps in five seconds, \(back.changed) from an index that "
              + "didn't have it yet, the item on every one \(back.held), on the page \(back.page)")
        try? files.removeItem(atPath: item)
        try? files.removeItem(atPath: other)
        let cleared = await eventually { self.disk.result?.item(at: item) == nil && self.disk.result?.item(at: other) == nil }
        let settled = await mapSettles()
        return [name: moved && gone.held && gone.maps > 0 && gone.page && quiet && action == "Move to Trash" && restored && back.held && back.maps > 0
                && back.page && cleared && settled]
    }

    /// Every ⌘Z undoes its own Move to Trash. Three files of the check's own go to the run's own folder, a move each, and
    /// Edit > Undo, through the window's undo manager, puts back the last, then the one before it, each back on the map and
    /// selected. Then the middle one moves again, the note's Undo puts it back, and the ⌘Z after that puts back the first
    /// move's file rather than the middle one again. Undo moves nothing back to the Trash, so nothing is left to Redo.
    func checkEachUndoUndoesItsOwnMove(_ fixture: String) async -> [String: Bool] {
        let name = "each_undo_undoes_its_own_move"
        let files = FileManager.default, mark = UUID().uuidString.prefix(8).lowercased()
        let items = (1...3).map { (fixture as NSString).appendingPathComponent("pith-undo-\(mark)-\($0).bin") }
        var inTrash: [URL] = []
        defer {
            for path in items { try? files.removeItem(atPath: path) }
            for url in inTrash { try? files.removeItem(at: url) }
            disk.dismissTrashNote()
        }
        // 1 MiB each, the least the live map lists by name.
        guard let undo = webView?.window?.undoManager, items.allSatisfy({ files.createFile(atPath: $0, contents: Data(count: 1 << 20)) }),
              await eventually({ items.allSatisfy { self.disk.result?.item(at: $0) != nil } }), await mapSettles() else {
            print("each undo: the check's files never reached the map")
            return [name: false]
        }
        func on(_ path: String) -> Bool { files.fileExists(atPath: path) && disk.result?.item(at: path) != nil }
        func off(_ path: String) -> Bool { !files.fileExists(atPath: path) && disk.result?.item(at: path) == nil }
        /// Moves `path` to the Trash as the person does, in a move of its own: whether it left the disk and the map.
        func move(_ path: String) async -> Bool {
            disk.requestTrash([path], undoManager: undo)
            let moved = await eventually { off(path) && self.disk.trashed?.moves.map(\.plan.target.path) == [path] && !self.disk.isTrashing }
            inTrash += disk.trashed?.moves.compactMap(\.trashed) ?? []
            return moved
        }
        /// Whether `path` came back, on the map and selected, while each of `away` stayed in the Trash.
        func back(_ path: String, leaving away: [String]) async -> Bool {
            await eventually { on(path) && self.disk.selection.paths == [path] && !self.disk.isTrashing } && away.allSatisfy(off)
        }
        var moved = true
        for path in items { moved = await move(path) && moved }
        let action = undo.undoActionName
        undo.undo()
        let last = await back(items[2], leaving: [items[0], items[1]])
        undo.undo()
        let before = await back(items[1], leaving: [items[0]])
        let again = await move(items[1])
        disk.undoTrash()
        let noted = await back(items[1], leaving: [items[0]]) && disk.trashed == nil
        undo.undo()
        let first = await back(items[0], leaving: [])
        let redo = undo.canRedo
        if first { inTrash = [] }
        print("each undo: three moves \(moved) (\(action)); ⌘Z put back the last \(last), ⌘Z again the one before \(before); moved again \(again), "
              + "the note's Undo put it back \(noted), then ⌘Z the first move's file \(first); Redo offered \(redo)")
        for path in items { try? files.removeItem(atPath: path) }
        let cleared = await eventually { items.allSatisfy { self.disk.result?.item(at: $0) == nil } }
        let settled = await mapSettles()
        return [name: moved && action == "Move to Trash" && last && before && again && noted && first && !redo && cleared && settled]
    }

    /// Whether the page shows `selected` as Pith holds it: a block outlined for each, each on a block of its own here,
    /// and in the map's list of items and in Largest files, the rows of the items selected shown selected, and saying so
    /// after their names, and no others. No row is a toggle, since pressing one selects its item alone.
    private static func shows(_ page: [String: Any]?, _ selected: [String]) -> Bool {
        guard let page, let rings = page["rings"] as? Int, let items = page["items"] as? [[String: Any]],
              let largest = page["largest"] as? [[String: Any]] else { return false }
        let names = selected.map { ($0 as NSString).lastPathComponent }
        func agrees(_ row: [String: Any], _ chosen: Bool) -> Bool {
            row["toggle"] as? Bool == false && (row["shown"] as? Bool == true) == chosen && (row["says"] as? Bool == true) == chosen
        }
        let itemRows = items.allSatisfy { row in
            let text = row["key"] as? String ?? ""
            return agrees(row, names.contains { text.hasPrefix($0 + " ") })
        }
        let largestRows = largest.allSatisfy { row in agrees(row, selected.contains(row["key"] as? String ?? "")) }
        return rings == selected.count && itemRows && largestRows
    }

    /// Moves the pointer off the map, so the only rings on it are the selection's.
    private static let leaveTheMap = """
        document.querySelector("canvas").dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
        """

    /// Clicks the row of the item at `path`, with ⌘ down when `command`, in the map's list of items, by its name, or in
    /// Largest files, by its path, when `list` is "largest": whether there was one.
    private static let clickRow = """
        const name = path.slice(path.lastIndexOf("/") + 1);
        const row = list === "largest"
          ? [...document.querySelectorAll('[aria-label="Largest files"] li button')].find((button) => button.title === path)
          : [...document.querySelectorAll('[aria-label^="Items in"] li > button:first-child')].find((button) => button.textContent.startsWith(name + " "));
        row?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window, metaKey: command }));
        return row !== undefined;
        """

    /// What the page shows selected: how many blocks the map outlines, and, for each row of its list of items, by the
    /// row's text, and of Largest files, by the row's path, whether it's shown selected, whether VoiceOver hears it's
    /// selected after its name, from its label or its text, and whether it's a toggle.
    private static let shownSelected = """
        const canvas = document.querySelector("canvas");
        const says = (button) => (button.getAttribute("aria-label") ?? button.textContent).endsWith(", selected");
        const rows = (selector, key) => [...document.querySelectorAll(selector)]
          .map((button) => ({ key: key(button), shown: button.hasAttribute("data-selected"), says: says(button),
                              toggle: button.hasAttribute("aria-pressed") }));
        return {
          rings: canvas.parentElement.querySelectorAll("div.pointer-events-none.absolute").length,
          items: rows('[aria-label^="Items in"] li > button:first-child', (button) => button.textContent),
          largest: rows('[aria-label="Largest files"] li button', (button) => button.title),
        };
        """

    /// Presses the button of the map's list of items labelled `label`, as VoiceOver or a keyboard does, with no key down:
    /// whether there was one.
    private static let pressListButton = """
        const button = [...document.querySelectorAll('[aria-label^="Items in"] li button')].find((button) => button.getAttribute("aria-label") === label);
        button?.click();
        return button !== undefined;
        """

    /// Shift and the arrow key `key` on the map, `times` times in a row, as a held key repeats, all before Pith answers.
    private static let shiftArrow = """
        const map = document.querySelector("canvas").parentElement;
        for (let press = 0; press < times; press++) {
          map.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey: true, repeat: press > 0, bubbles: true, cancelable: true }));
        }
        """

    /// The texts of the rows of the map's list of items.
    private static let listedItems = """
        return [...document.querySelectorAll('[aria-label^="Items in"] li > button:first-child')].map((button) => button.textContent);
        """

    /// Escape on the map, which clears the selection.
    private static let escapeOnTheMap = """
        document.querySelector("canvas").parentElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        """

    /// Command-Delete on the map, which moves the items selected to the Trash.
    private static let commandDeleteOnTheMap = """
        document.querySelector("canvas").parentElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", code: "Backspace", metaKey: true,
          bubbles: true, cancelable: true }));
        """
}
