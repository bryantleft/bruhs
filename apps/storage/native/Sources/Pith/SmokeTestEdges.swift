import AppKit
import PithCore
import SwiftUI
import WebKit

/// The panes of System Settings a smoke run asked for, which it records rather than opens (`openSystemSettings`).
@MainActor final class SystemSettingsAsked {
    var asked: [URL] = []
}

/// What the map's hover card said of its clicks before the person had made them, and after.
struct LearnedHintsSeen {
    /// The card named the clicks before any was made.
    let shownBefore: Bool
    /// Pith kept both hints learned, in its settings, held in memory in a smoke run, and the person's defaults are as
    /// they were.
    let kept: Bool
    /// The card named neither once both were made.
    let hiddenAfter: Bool
}

/// The smoke test's checks of what the disk map can't see, and says so: the Not measured block and "Where the space
/// is", the notice while macOS asks, and the click hints Pith keeps for the map.
extension AppDelegate {
    /// The hover card names the map's clicks until the person has selected and opened something on the map, which the
    /// check does: it clicks the fixture's sub folder, then double-clicks it. Pith then keeps both hints learned in its
    /// settings, held in memory in a smoke run, never in the person's defaults.
    func learnHints(_ fixture: String) async -> LearnedHintsSeen {
        guard let web = webView else { return LearnedHintsSeen(shownBefore: false, kept: false, hiddenAfter: false) }
        let sub = (fixture as NSString).appendingPathComponent("sub"), key = Setting.learnedMapHints.rawValue
        let persisted = { UserDefaults.standard.persistentDomain(forName: Bundle.main.bundleIdentifier ?? "app.bruhs.pith")?[key] as? NSObject }
        let persistedBefore = persisted()
        let before = await pageAnswer(web, Self.subCard) { (text: String?) in text?.isEmpty == false }
        let clicked = try? await web.callAsyncJavaScript(Self.clickAndOpenSub, in: nil, contentWorld: .page) as? Bool
        let opened = await eventually { self.disk.openFolder == sub }
        disk.pageCommand?(.open(fixture))
        let back = await eventually { self.disk.openFolder == fixture }
        let kept = UserDefaults.standard.stringArray(forKey: key)
        let after = await pageAnswer(web, Self.subCard) { (text: String?) in text?.isEmpty == false }
        let seen = LearnedHintsSeen(shownBefore: before.map(Self.namesTheClicks) == true,
                                    kept: clicked == true && opened && back && disk.mapHints.learned == ["opened", "selected"]
                                        && kept == ["opened", "selected"] && persisted() == persistedBefore,
                                    hiddenAfter: after.map { !Self.namesTheClicks($0) } == true)
        print("hints: the card named the clicks \(seen.shownBefore) (\(before ?? "no card")); clicked \(clicked == true), opened sub \(opened); "
              + "learned \(disk.mapHints.learned), kept in memory as \(kept ?? []); after, the card named them \(!seen.hiddenAfter)")
        return seen
    }

    /// A new window's page still knows the hints learned in the last one: Pith sends them from its settings once the
    /// page is ready. The window opens again for this, and closes again after.
    func hintsStayLearned(_ seen: LearnedHintsSeen, fixture: String) async -> Bool {
        showDisk()
        let loaded = await eventually {
            guard let web = self.webView else { return false }
            return web.url?.scheme == "pith" && !web.isLoading && self.disk.openFolder == fixture
        }
        var card: String?
        if loaded, let web = webView { card = await pageAnswer(web, Self.subCard) { (text: String?) in text?.isEmpty == false } }
        let hidden = card.map { !Self.namesTheClicks($0) } == true
        mainWindow?.window.performClose(nil)
        let closed = await eventually { self.webView == nil && self.mainWindow == nil }
        print("hints after the window opened again: the card \(card ?? "never showed"), naming the clicks \(!hidden); closed again \(closed)")
        return seen.shownBefore && seen.kept && seen.hiddenAfter && loaded && hidden && closed
    }

    /// Whether the hover card's words name the map's clicks.
    private static func namesTheClicks(_ card: String) -> Bool { card.contains("Click to select") || card.contains("Double-click to open") }

    /// What the hover card says of the fixture's sub folder, the pointer resting on its block, which is found by selecting
    /// it in the map's list of items; the selection is cleared again first.
    private static let subCard = mapScript("""
        const at = await blockOf("sub");
        canvas.parentElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        if (!at) return null;
        leave();
        await pause(100);
        mouse("mousemove", at);
        await pause(150);
        const text = card();
        leave();
        return text;
        """)

    /// Clicks the fixture's sub folder on the map, then double-clicks it, as the person would: it's selected, then opened.
    private static let clickAndOpenSub = mapScript("""
        const at = await blockOf("sub");
        canvas.parentElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        if (!at) return false;
        leave();
        await pause(100);
        mouse("mousemove", at);
        await pause(100);
        click(at, 1);
        await pause(80);
        click(at, 2);
        mouse("dblclick", at, 2);
        leave();
        return true;
        """)

    /// A map of a whole volume draws what the scan couldn't measure as a Not measured block at its root, of the very
    /// figure "Where the space is" gives. The fixture stands in for a volume: its accounting is given figures of its own
    /// (`DiskModel.accounts`), half as much again as the walk found used but not measured, and the side column a Trash
    /// inside the fixture, which the map can read. Then:
    /// - Native sends the page the Not measured row's bytes, and the page lists the block with its figure.
    /// - The block's card gives its share of used space. A click on it opens "Where the space is" and leaves the selection
    ///   as it was; a double-click opens no folder; its row in the map's list of items opens "Where the space is" too.
    /// - "Where the space is" has an In the Trash row of the map's figure for the Trash, and every row leads with its
    ///   icon, drawn as the popover draws them in a window of its own off screen, in the appearance the main window
    ///   doesn't have, the disk's and the Trash's by the icon store.
    func checkNotMeasured(_ fixture: String, report: URL) async -> [String: Bool] {
        let names = ["not_measured_block_matches_the_popover", "where_the_space_is_shows_icons"]
        let files = FileManager.default, mark = UUID().uuidString.prefix(8).lowercased()
        let trash = (fixture as NSString).appendingPathComponent("pith-smoke-trash-\(mark)")
        let kept = (accounts: disk.accounts, places: disk.sideColumn.places)
        let restore = {
            self.disk.accounts = kept.accounts
            self.disk.sideColumn.places = kept.places
            self.disk.showsWhereTheSpaceIs = false
            self.disk.refreshAccounting()
            try? files.removeItem(atPath: trash)
        }
        defer { restore() }
        // The Trash first, so the live map's tree for the new folder asks after it.
        disk.sideColumn.places = KnownPlaces(home: URL(fileURLWithPath: fixture), searchPaths: [.trashDirectory: URL(fileURLWithPath: trash)]) { _ in nil }
        guard let web = webView, (try? files.createDirectory(atPath: trash, withIntermediateDirectories: false)) != nil,
              files.createFile(atPath: (trash as NSString).appendingPathComponent("old.bin"), contents: Data(count: 1 << 20)),
              await eventually({ (self.disk.trashOnMap ?? 0) >= 1 << 20 }) else {
            return Dictionary(uniqueKeysWithValues: names.map { ($0, false) })
        }
        disk.accounts = { result in
            guard result.root.path == fixture else { return nil }
            let walked = result.summary.bytes
            return DiskAccounting(used: walked * 2, walkedVolumes: [walked + walked / 2], result: result, snapshots: 2, purgeable: walked / 4)
        }
        disk.refreshAccounting()
        let accounted = await eventually { self.disk.notMeasured != nil }
        let rows = disk.spaceRows ?? []
        let notMeasuredRow = rows.first { $0.label == "Not measured" }?.figure
        let block = disk.notMeasured?.bytes, accounting = disk.accounting?.notMeasured
        let sent = await eventually { (web.navigationDelegate as? DiskWebView.Coordinator)?.notMeasured == self.disk.notMeasured }
        let figure = block.map(bytes)
        let listed = await pageAnswer(web, Self.notMeasuredItem) { (text: String?) in text != nil }
        let selectedBefore = disk.selected
        let clicked = try? await web.callAsyncJavaScript(Self.clickTheBlock, in: nil, contentWorld: .page) as? [String: Any]
        let card = clicked?["card"] as? String
        let explains = await eventually { self.disk.showsWhereTheSpaceIs }
        // Long enough for a folder a double-click opened to have reached the native side.
        try? await Task.sleep(for: .milliseconds(300))
        let stayed = disk.selected == selectedBefore && disk.openFolder == fixture
        disk.showsWhereTheSpaceIs = false
        let listClicked = (try? await web.callAsyncJavaScript(Self.clickNotMeasuredItem, in: nil, contentWorld: .page) as? Bool) == true
        let fromTheList = await eventually { self.disk.showsWhereTheSpaceIs } && listClicked
        disk.showsWhereTheSpaceIs = false
        let trashRow = rows.first { $0.label == "In the Trash" }?.figure
        let trashShown = disk.result?.root.children?.first { $0.path == trash }?.size
        let icons = await checkSpaceRows(rows, root: fixture, saving: report.deletingLastPathComponent().appendingPathComponent("where-the-space-is.png"))
        restore()
        let gone = await pageAnswer(web, Self.notMeasuredItem) { (text: String?) in text == nil } == nil
        let settled = await mapSettles()
        func shown(_ row: SpaceRow.Figure?) -> String {
            if case .bytes(let value)? = row { return String(value) }
            return "none"
        }
        print("not measured: \(block.map(String.init) ?? "none") bytes sent the page \(sent), the accounting's \(accounting.map(String.init) ?? "none"), "
              + "the popover's \(shown(notMeasuredRow)), listed as \(listed ?? "nothing"); the card \(card ?? "never showed"); a click opened Where the "
              + "space is \(explains), the selection and folder stayed \(stayed), the list's row opened it \(fromTheList); In the Trash "
              + "\(shown(trashRow)) against the map's \(trashShown.map(String.init) ?? "none"); gone again \(gone), settled \(settled)")
        let matches = accounted && block != nil && notMeasuredRow == block.map(SpaceRow.Figure.bytes) && block == accounting
        return [names[0]: matches && sent && listed == figure.map { "Not measured " + $0 } && card?.hasPrefix("Not measured") == true
                    && card?.contains("of used space") == true && figure.map { card?.contains($0) == true } == true && explains && stayed && fromTheList
                    && gone && settled,
                names[1]: accounted && trashShown != nil && trashRow == trashShown.map(SpaceRow.Figure.bytes) && icons]
    }

    /// The Not measured block's row in the map's list of items: its words, or null when there's none.
    private static let notMeasuredItem = """
        const button = [...document.querySelectorAll('[aria-label^="Items in"] button')].find((button) => button.textContent.startsWith("Not measured "));
        return button ? button.textContent : null;
        """

    /// Clicks the Not measured block's row in the map's list of items: whether there was one.
    private static let clickNotMeasuredItem = """
        const button = [...document.querySelectorAll('[aria-label^="Items in"] button')].find((button) => button.textContent.startsWith("Not measured "));
        button?.click();
        return button !== undefined;
        """

    /// Finds the Not measured block by moving the pointer across the map until its card names it, then clicks it and
    /// double-clicks it. Says what the card said, or null when no block was found.
    private static let clickTheBlock = mapScript("""
        leave();
        await pause(100);
        const frame = canvas.getBoundingClientRect();
        let at = null;
        for (let y = 0.1; y < 1 && !at; y += 0.2) {
          for (let x = 0.1; x < 1 && !at; x += 0.2) {
            const point = { x: frame.left + frame.width * x, y: frame.top + frame.height * y };
            mouse("mousemove", point);
            await pause(60);
            if (card().startsWith("Not measured")) at = point;
          }
        }
        if (!at) return null;
        const text = card();
        click(at, 1);
        await pause(80);
        click(at, 2);
        mouse("dblclick", at, 2);
        leave();
        return { card: text };
        """)

    /// Draws "Where the space is" for `rows`, the map of `root`'s, as its popover does, in a borderless window of its own
    /// off screen, in the appearance the main window doesn't have, so the icon store draws its icons for it alone: the
    /// disk's own and the Trash's. A picture of it is saved at `saving`, and its pixels show an icon at the start of every
    /// row.
    private func checkSpaceRows(_ rows: [SpaceRow], root: String, saving: URL) async -> Bool {
        guard let main = mainWindow?.window, !rows.isEmpty else { return false }
        let appearance: IconAppearance = IconAppearance(main.effectiveAppearance) == .dark ? .light : .dark
        let host = NSHostingView(rootView: WhereTheSpaceIsView(rows: rows))
        let size = host.fittingSize
        let window = NSWindow(contentRect: NSRect(x: -8000, y: -8000, width: size.width, height: size.height), styleMask: [.borderless], backing: .buffered,
                              defer: false)
        window.isReleasedWhenClosed = false
        window.appearance = NSAppearance(named: appearance == .dark ? .darkAqua : .aqua)
        window.contentView = host
        window.orderFrontRegardless()
        defer { window.orderOut(nil); window.contentView = nil }
        let icon = IconSize(points: 16, scale: window.backingScaleFactor)
        let keys = rows.compactMap { row -> IconKey? in if case .item(let key) = row.icon { key } else { nil } }
        let drawn = await eventually { keys.allSatisfy { Icons.store.cachedIcon(for: IconRequest($0, size: icon, appearance: appearance)) != nil } }
        var icons = 0
        _ = await eventually {
            guard let picture = host.bitmapImageRepForCachingDisplay(in: host.bounds) else { return false }
            host.cacheDisplay(in: host.bounds, to: picture)
            icons = Self.marksInTheIconColumn(picture, width: host.bounds.width)
            try? picture.representation(using: .png, properties: [:])?.write(to: saving)
            return icons == rows.count
        }
        let disk = keys.first == .item(root), trash = keys.contains(.place("trash"))
        print("where the space is: \(rows.count) rows, \(rows.map(\.label)), keys \(keys.map(\.string)) drawn in \(appearance.rawValue) \(drawn), "
              + "\(icons) icons painted, saved to \(saving.path)")
        return drawn && disk && trash && icons == rows.count
    }

    /// How many marks a picture of "Where the space is" shows in its icon column, 16 to 32 pt from its left edge, where
    /// nothing but the rows' icons is drawn: each is a run of pixel rows 5 to 20 pt tall in which some of the column is
    /// unlike the popover's ground, read in its margin, bridging gaps of up to 2 pt, as a dashed symbol's are. The line
    /// under the disk's row is too thin to count.
    private static func marksInTheIconColumn(_ picture: NSBitmapImageRep, width: CGFloat) -> Int {
        let scale = CGFloat(picture.pixelsWide) / width
        guard let ground = picture.colorAt(x: Int(4 * scale), y: Int(4 * scale))?.usingColorSpace(.deviceRGB) else { return 0 }
        func unlike(_ x: Int, _ y: Int) -> Bool {
            guard let color = picture.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else { return false }
            return max(abs(color.redComponent - ground.redComponent), abs(color.greenComponent - ground.greenComponent),
                       abs(color.blueComponent - ground.blueComponent), abs(color.alphaComponent - ground.alphaComponent)) > 0.1
        }
        let columns = Int(16 * scale)..<Int(32 * scale)
        let inked = (0..<picture.pixelsHigh).map { y in columns.contains { unlike($0, y) } }
        var marks = 0, start: Int?, gap = 0
        for (y, ink) in (inked + [false]).enumerated() {
            if ink {
                if start == nil { start = y }
                gap = 0
            } else if let begun = start {
                gap += 1
                guard gap > Int(2 * scale) || y == inked.count else { continue }
                let tall = y - gap - begun + 1
                if (Int(5 * scale)...Int(20 * scale)).contains(tall) { marks += 1 }
                start = nil; gap = 0
            }
        }
        return marks
    }

    /// While macOS asks whether Pith may read some of the live map's folders, Disk's notice says that answering, or Full
    /// Disk Access once, brings them into the map, and its Full Disk Access… button asks for that pane of System
    /// Settings, which `panes` records rather than opens. The notice is drawn as Disk draws it, in a borderless window of
    /// its own off screen, and its button clicked as AppKit delivers a click, at the notice's trailing end.
    func checkAskingNotice(_ panes: SystemSettingsAsked) async -> [String: Bool] {
        let check = "asking_notice_opens_full_disk_access"
        let sentence = AskingNotice.sentence(12)
        // Wide enough for the sentence on one line, so the button sits at the row's middle.
        let width: CGFloat = 1100
        let host = NSHostingView(rootView: AskingNotice(folders: 12).frame(width: width))
        let height = max(30, host.fittingSize.height)
        let window = NSWindow(contentRect: NSRect(x: -8000, y: -8000, width: width, height: height), styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = host
        window.orderFrontRegardless()
        defer { window.orderOut(nil); window.contentView = nil }
        try? await Task.sleep(for: .milliseconds(300))
        let before = panes.asked.count
        // Inside the button's padding, left of the notice's own.
        let point = NSPoint(x: width - 16 - 20, y: height / 2)
        for type in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
            if let event = NSEvent.mouseEvent(with: type, location: point, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,
                                              windowNumber: window.windowNumber, context: nil, eventNumber: 0, clickCount: 1, pressure: 1) {
                window.sendEvent(event)
            }
        }
        let asked = await eventually { panes.asked.count > before } && panes.asked.last == fullDiskAccessPane
        let words = sentence == "macOS is asking whether Pith may read 12 folders. Answer it, or give Pith Full Disk Access once, and they join the map."
        print("asking notice: \"\(sentence)\"; its button asked for \(panes.asked.last?.absoluteString ?? "no pane") \(asked)")
        return [check: asked && words]
    }
}
