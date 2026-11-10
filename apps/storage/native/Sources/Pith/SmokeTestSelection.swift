import AppKit
import PithCore
import WebKit

/// The smoke test's checks of a selection of several items: ⌘-click building it on the page, Pith keeping it, and one
/// Move to Trash with one Undo for them all.
extension AppDelegate {
    /// A click selects one item, and a ⌘-click adds another or takes it out, as in Finder: the page tells Pith what was
    /// clicked and outlines what Pith answers with. The check makes two files of its own in the fixture, 1 MiB each, so
    /// the map lists them by name, then, through the map's list of items and Largest files:
    /// - clicks the first and ⌘-clicks the second: Pith holds both, in that order, and the page outlines both blocks
    ///   and presses both rows;
    /// - ⌘-clicks the fixture's sub/video.mov in Largest files, then its folder, sub: sub takes video.mov's place, since
    ///   it holds it, and its Largest files row is pressed no more;
    /// - ⌘-clicks the first file again, which leaves: two blocks outlined, and Pith measures what deleting the two
    ///   frees in one run over both, of as many files as they hold. A picture of the window, with the bar under the map
    ///   showing the two, is saved at `picture`.
    /// Escape on the map clears the selection after.
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
        let one = await click(first, command: false, selecting: [first])
        let two = await click(second, command: true, selecting: [first, second])
        let inner = await click(video, command: true, in: "largest", selecting: [first, second, video])
        let nested = await click(sub, command: true, selecting: [first, second, sub])
        let out = await click(first, command: true, selecting: [second, sub])
        // One measurement of both, of every file they hold.
        let measured = await eventually { self.disk.selectedFrees != nil }
        let counted = disk.selectedItems.reduce(0) { $0 + $1.fileCount }, frees = disk.selectedFrees
        let bar = disk.selectedItems.map(\.path) == [second, sub]
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
        return one && two && inner && nested && out && measured && frees?.files == counted && bar && cleared && gone && settled
    }

    /// Several items go to the Trash in one move, with one Undo, as the person makes them: three files of the check's
    /// own, selected with a click and two ⌘-clicks, go with Command-Delete on the map into the run's own folder, never
    /// the person's Trash, and leave the map at once, the page's too; the Edit menu's Undo, once, puts all three back
    /// where they were and on the map, selected again.
    func checkSeveralTrashed(_ fixture: String) async -> [String: Bool] {
        let check = "several_items_trash_with_one_undo"
        let files = FileManager.default, mark = UUID().uuidString.prefix(8).lowercased()
        let items = (1...3).map { (fixture as NSString).appendingPathComponent("pith-gone-\(mark)-\($0).bin") }
        var inTrash: [URL] = []
        defer {
            for path in items { try? files.removeItem(atPath: path) }
            for url in inTrash { try? files.removeItem(at: url) }
            disk.dismissTrashNote()
        }
        guard let web = webView, items.allSatisfy({ files.createFile(atPath: $0, contents: Data(count: 1 << 20)) }),
              await eventually({ items.allSatisfy { self.disk.result?.item(at: $0) != nil } }), await mapSettles() else {
            print("several trashed: the check's files never reached the map")
            return [check: false]
        }
        _ = try? await web.callAsyncJavaScript(Self.leaveTheMap, in: nil, contentWorld: .page)
        for (index, path) in items.enumerated() {
            _ = try? await web.callAsyncJavaScript(Self.clickRow, arguments: ["path": path, "command": index > 0, "list": "items"], in: nil, contentWorld: .page)
            _ = await eventually { self.disk.selection.paths == Array(items.prefix(index + 1)) }
        }
        let picked = await pageAnswer(web, Self.shownSelected) { (page: [String: Any]?) in Self.shows(page, items) }
        let selected = disk.selection.paths == items && Self.shows(picked, items)

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
        for path in items { try? files.removeItem(atPath: path) }
        let gone = await eventually { items.allSatisfy { self.disk.result?.item(at: $0) == nil } }
        let settled = await mapSettles()
        return [check: selected && moved && own && offTheMap && offThePage && action == "Move to Trash" && restored && back && Self.shows(onThePage, items)
                    && cleared && gone && settled]
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
