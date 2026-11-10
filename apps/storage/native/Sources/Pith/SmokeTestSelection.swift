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
    /// - presses Shift and an arrow key on the map, which adds the nearest item in that direction not selected yet.
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
        // Shift and the arrow key toward an item not selected yet: some directions meet the map's edge or its smaller items.
        var extended: [String] = []
        for key in ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"] where extended.isEmpty {
            _ = try? await web.callAsyncJavaScript(Self.shiftArrow, arguments: ["key": key], in: nil, contentWorld: .page)
            for _ in 0..<10 where disk.selection.paths.count < 3 { try? await Task.sleep(for: .milliseconds(100)) }
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
        let restored = items.allSatisfy { files.fileExists(atPath: $0) }
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
        let firstBack = files.fileExists(atPath: items[0])
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

    /// Whether the page shows `selected` as Pith holds it: a block outlined for each, each on a block of its own here,
    /// and in the map's list of items and in Largest files, the rows of the items selected pressed, and no others.
    private static func shows(_ page: [String: Any]?, _ selected: [String]) -> Bool {
        guard let page, let rings = page["rings"] as? Int, let items = page["items"] as? [[String: Any]],
              let largest = page["largest"] as? [[String: Any]] else { return false }
        let names = selected.map { ($0 as NSString).lastPathComponent }
        let itemRows = items.allSatisfy { row in
            let text = row["key"] as? String ?? ""
            return (row["pressed"] as? Bool == true) == names.contains { text.hasPrefix($0 + " ") }
        }
        let largestRows = largest.allSatisfy { row in (row["pressed"] as? Bool == true) == selected.contains(row["key"] as? String ?? "") }
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

    /// What the page shows selected: how many blocks the map outlines, and whether each row is pressed, of its list of
    /// items by the row's text and of Largest files by the row's path.
    private static let shownSelected = """
        const canvas = document.querySelector("canvas");
        const rows = (selector, key) => [...document.querySelectorAll(selector)]
          .map((button) => ({ key: key(button), pressed: button.getAttribute("aria-pressed") === "true" }));
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

    /// Shift and the arrow key `key` on the map.
    private static let shiftArrow = """
        document.querySelector("canvas").parentElement.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey: true, bubbles: true, cancelable: true }));
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
