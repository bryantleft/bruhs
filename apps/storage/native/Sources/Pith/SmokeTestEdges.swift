import AppKit
import PithCore
import SwiftUI
import WebKit

/// The panes of System Settings a smoke run asked for, which it records rather than opens (`openSystemSettings`).
@MainActor final class SystemSettingsAsked {
    var asked: [SystemSettingsPane] = []
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
    /// figure "Where the space is" gives. The fixture stands in for a volume: the volume's own figures are given values of
    /// their own (`DiskModel.measures`), its used space twice what the walk found and half as much again as the walk
    /// found not measured, and the side column gets a Trash inside the fixture, which the map can read. Then:
    /// - Native sends the page the Not measured row's bytes with the volume's used space, and the page lists the block
    ///   with its figure.
    /// - The block's card gives its share of the volume's used space, the popover's Used on this disk. A click on it opens
    ///   "Where the space is", whose popover shows, and leaves the selection as it was; a double-click opens no folder; its
    ///   row in the map's list of items opens "Where the space is" too.
    /// - Move to Trash, into the run's own folder, takes a file off the map, and its bytes join Not measured at once, on
    ///   the page too, as the volume still holds them; Undo puts them back at once.
    /// - A file written outside Pith, as a download is, shows on the live map by itself, and the volume's space, measured
    ///   before that map goes out, holds it too: Used on this disk grows by it and Not measured holds still, on the page
    ///   too. Every figure the page gets comes in one call with the map it was measured for, none after it to correct it.
    ///   Once the file is deleted, Used on this disk goes back, and Not measured still holds.
    /// - While a scan runs, the map takes no clicks and its cards offer none, and the "Where the space is" link still opens
    ///   it (`checkScanningMap`).
    /// - "Where the space is" has an In the Trash row of the map's figure for the Trash, and every row leads with its
    ///   icon, drawn as the popover draws them in a window of its own off screen, in the appearance the main window
    ///   doesn't have, the disk's and the Trash's by the icon store.
    /// Once the volume's figures go, the block goes too.
    func checkNotMeasured(_ fixture: String, report: URL) async -> [String: Bool] {
        let names = ["not_measured_block_matches_the_popover", "where_the_space_is_shows_icons", "not_measured_follows_trash_and_undo",
                     "map_takes_no_clicks_while_scanning", "not_measured_holds_as_files_change_outside_pith"]
        let files = FileManager.default, mark = UUID().uuidString.prefix(8).lowercased()
        let trash = (fixture as NSString).appendingPathComponent("pith-smoke-trash-\(mark)")
        let item = (fixture as NSString).appendingPathComponent("pith-smoke-gone-\(mark).bin")
        let outside = (fixture as NSString).appendingPathComponent("pith-smoke-download-\(mark).bin")
        guard let web = webView else { return Dictionary(uniqueKeysWithValues: names.map { ($0, false) }) }
        var checks: [String: Bool] = [:]
        do {
            let kept = (measures: disk.measures, measuresSpace: disk.measuresSpace, places: disk.sideColumn.places, scanning: disk.isScanning)
            defer {
                disk.measures = kept.measures
                disk.measuresSpace = kept.measuresSpace
                disk.sideColumn.places = kept.places
                disk.isScanning = kept.scanning
                disk.showsWhereTheSpaceIs = false
                disk.refreshAccounting()
                for path in [trash, item, outside] { try? files.removeItem(atPath: path) }
            }
            // The Trash first, so the live map's tree for the new folder asks after it.
            disk.sideColumn.places = KnownPlaces(home: URL(fileURLWithPath: fixture), searchPaths: [.trashDirectory: URL(fileURLWithPath: trash)]) { _ in nil }
            guard (try? files.createDirectory(atPath: trash, withIntermediateDirectories: false)) != nil,
                  files.createFile(atPath: (trash as NSString).appendingPathComponent("old.bin"), contents: Data(count: 1 << 20)),
                  // 1 MiB, the least the live map lists by name, so the file has a block of its own to take off the map.
                  files.createFile(atPath: item, contents: Data(count: 1 << 20)),
                  await eventually({ (self.disk.trashOnMap ?? 0) >= 1 << 20 && self.disk.result?.item(at: item) != nil }), await mapSettles(),
                  let walked = disk.result?.summary.bytes else {
                return Dictionary(uniqueKeysWithValues: names.map { ($0, false) })
            }
            disk.measures = { root in
                root == fixture ? VolumeUse(used: walked * 2, walkedVolumes: [walked + walked / 2], snapshots: 2, purgeable: walked / 4) : nil
            }
            // Its space, as the live map measures it again with every map: what's written to the fixture outside Pith is
            // on the volume too.
            disk.measuresSpace = { root in
                guard root == fixture else { return nil }
                let written = ((try? FileManager.default.attributesOfItem(atPath: outside))?[.size] as? NSNumber)?.uint64Value ?? 0
                return VolumeUse.Space(used: walked * 2 + written, walkedVolumes: [walked + walked / 2 + written])
            }
            disk.refreshAccounting()
            let accounted = await eventually { self.disk.notMeasured != nil }
            let rows = disk.spaceRows ?? []
            let notMeasuredRow = rows.first { $0.label == "Not measured" }?.figure
            let usedRow = rows.first { $0.isTotal }?.figure
            let block = disk.notMeasured?.bytes, used = disk.notMeasured?.used, accounting = disk.accounting?.notMeasured
            let sent = await eventually { (web.navigationDelegate as? DiskWebView.Coordinator)?.notMeasured == self.disk.notMeasured }
            let figure = block.map(bytes)
            // The share the card gives, of the volume's used space, rounded as the page rounds it.
            let share = block.flatMap { block in used.map { "\(Int((Double(block) / Double($0) * 100).rounded()))% of used space" } }
            let listed = await pageAnswer(web, Self.notMeasuredItem) { (text: String?) in text != nil }
            let selectedBefore = disk.selection
            let clicked = try? await web.callAsyncJavaScript(Self.clickTheBlock, in: nil, contentWorld: .page) as? [String: Any]
            let card = clicked?["card"] as? String
            let explains = await eventually { self.disk.showsWhereTheSpaceIs }
            let presented = await eventually { Self.popoverShows }
            // Long enough for a folder a double-click opened to have reached the native side.
            try? await Task.sleep(for: .milliseconds(300))
            let stayed = disk.selection == selectedBefore && disk.openFolder == fixture
            disk.showsWhereTheSpaceIs = false
            let closed = await eventually { !Self.popoverShows }
            let listClicked = (try? await web.callAsyncJavaScript(Self.clickNotMeasuredItem, in: nil, contentWorld: .page) as? Bool) == true
            let fromTheList = await eventually { self.disk.showsWhereTheSpaceIs } && listClicked
            disk.showsWhereTheSpaceIs = false
            _ = await eventually { !Self.popoverShows }
            checks[names[0]] = accounted && block != nil && notMeasuredRow == block.map(SpaceRow.Figure.bytes) && block == accounting
                && usedRow == used.map(SpaceRow.Figure.bytes) && sent && listed == figure.map { "Not measured " + $0 }
                && card?.hasPrefix("Not measured") == true && share.map { card?.contains($0) == true } == true && figure.map { card?.contains($0) == true } == true
                && explains && presented && stayed && closed && fromTheList

            // Move to Trash and Undo, as the person makes them. Each moves its items off the main thread, and the map
            // and Not measured change together once they've moved.
            let size = disk.result?.item(at: item)?.size
            disk.requestTrash([item], undoManager: nil)
            let joined = block.flatMap { block in size.map { block + $0 } }
            let trashed = await eventually { self.disk.trashed != nil } && !files.fileExists(atPath: item)
            let atOnce = disk.notMeasured?.bytes
            let onThePage = await pageAnswer(web, Self.notMeasuredItem) { (text: String?) in text == joined.map { "Not measured " + bytes($0) } }
            disk.undoTrash()
            _ = await eventually { !self.disk.isTrashing && files.fileExists(atPath: item) }
            let undone = disk.notMeasured?.bytes
            let backOnThePage = await pageAnswer(web, Self.notMeasuredItem) { (text: String?) in text == figure.map { "Not measured " + $0 } }
            checks[names[2]] = joined != nil && trashed && atOnce == joined && onThePage == joined.map { "Not measured " + bytes($0) }
                && files.fileExists(atPath: item) && undone == block && backOnThePage == figure.map { "Not measured " + $0 }
            print("not measured after Move to Trash: \(atOnce.map(String.init) ?? "none") bytes for \(joined.map(String.init) ?? "none"), the page's "
                  + "\(onThePage ?? "nothing"); after Undo \(undone.map(String.init) ?? "none"), the page's \(backOnThePage ?? "nothing")")

            // A file written outside Pith, as a download is, and then deleted: the live map follows it by itself, and the
            // volume's space, measured before each map goes out, with it.
            let keeping = await keepNotMeasuredSent(web)
            let written = files.createFile(atPath: outside, contents: Data(count: 1 << 20))
            let grown = used.map { $0 + (1 << 20) }
            let onTheMap = await eventually { self.disk.result?.item(at: outside) != nil }
            let grew = await eventually { self.disk.notMeasured?.used == grown }
            let usedWhileWritten = disk.notMeasured?.used, held = disk.notMeasured?.bytes
            let heldOnThePage = await pageAnswer(web, Self.notMeasuredItem) { (text: String?) in text == figure.map { "Not measured " + $0 } }
            let deleted = (try? files.removeItem(atPath: outside)) != nil
            let offTheMap = await eventually { self.disk.result != nil && self.disk.result?.item(at: outside) == nil }
            let shrank = await eventually { self.disk.notMeasured?.used == used }
            let heldAfter = disk.notMeasured?.bytes
            let heldAfterOnThePage = await pageAnswer(web, Self.notMeasuredItem) { (text: String?) in text == figure.map { "Not measured " + $0 } }
            // Each figure went to the page with its map, measured for it, and none came after to correct it.
            let figuresSent = keeping ? await notMeasuredSent(web) : nil
            let together = figuresSent.map { !$0.isEmpty && $0.allSatisfy(\.withMap) } ?? false
            checks[names[4]] = block != nil && grown != nil && written && onTheMap && grew && held == block
                && heldOnThePage == figure.map { "Not measured " + $0 } && deleted && offTheMap && shrank && heldAfter == block
                && heldAfterOnThePage == figure.map { "Not measured " + $0 } && together
            print("not measured with a file written outside Pith: on the map \(onTheMap), used \(usedWhileWritten.map(String.init) ?? "none") for "
                  + "\(grown.map(String.init) ?? "none"), Not measured \(held.map(String.init) ?? "none"), the page's \(heldOnThePage ?? "nothing"); "
                  + "once deleted, off the map \(offTheMap), used back \(shrank), Not measured \(heldAfter.map(String.init) ?? "none"), the page's "
                  + "\(heldAfterOnThePage ?? "nothing"), for \(block.map(String.init) ?? "none"); the page got \(Self.figures(figuresSent))")

            checks[names[3]] = await checkScanningMap(web, scanning: kept.scanning)

            let trashRow = rows.first { $0.label == "In the Trash" }?.figure
            let trashShown = disk.result?.root.children?.first { $0.path == trash }?.size
            let icons = await checkSpaceRows(rows, root: fixture, saving: report.deletingLastPathComponent().appendingPathComponent("where-the-space-is.png"))
            checks[names[1]] = accounted && trashShown != nil && trashRow == trashShown.map(SpaceRow.Figure.bytes) && icons
            func shown(_ row: SpaceRow.Figure?) -> String {
                if case .bytes(let value)? = row { return String(value) }
                return "none"
            }
            print("not measured: \(block.map(String.init) ?? "none") bytes of \(used.map(String.init) ?? "none") used sent the page \(sent), the accounting's "
                  + "\(accounting.map(String.init) ?? "none"), the popover's \(shown(notMeasuredRow)) of \(shown(usedRow)), listed as \(listed ?? "nothing"); "
                  + "the card \(card ?? "never showed") for \(share ?? "no share"); a click opened Where the space is \(explains), its popover showed "
                  + "\(presented), the selection and folder stayed \(stayed), and the list's row opened it \(fromTheList); In the Trash "
                  + "\(shown(trashRow)) against the map's \(trashShown.map(String.init) ?? "none")")
        }
        // The volume's figures went with the defer above, and the block goes with them.
        let gone = await pageAnswer(web, Self.notMeasuredItem) { (text: String?) in text == nil } == nil
        // The run's own files went too. Once the live map has listed the fixture without them, no status line about them
        // is still to come, to take the place of the one the next check hands the live map.
        let cleared = await eventually { self.disk.result != nil && [trash, item, outside].allSatisfy { self.disk.result?.item(at: $0) == nil } }
        let settled = await mapSettles()
        print("not measured once the volume's figures went: gone \(gone), the run's files off the map \(cleared), settled \(settled)")
        checks[names[0]] = checks[names[0]] == true && gone && settled
        return checks
    }

    /// Whether a popover shows, as "Where the space is" does once it opens: AppKit's popover windows.
    private static var popoverShows: Bool {
        NSApp.windows.contains { $0.isVisible && $0.className.contains("Popover") }
    }

    /// While a scan runs, the map it was drawn from stays on screen, dimmed, and takes no clicks: its cards offer none,
    /// the Not measured block's included, a click through the window doesn't reach it, as AppKit finds the view a click
    /// goes to and as the click itself shows, and "Where the space is" still opens from its link, drawn off screen as the
    /// control bar draws it. Without a scan, the same click through the window reaches the map and opens "Where the space
    /// is" from the block, and once the scan ends its card offers the click again.
    private func checkScanningMap(_ web: WKWebView, scanning: Bool) async -> Bool {
        guard let window = web.window,
              let found = (try? await web.callAsyncJavaScript(Self.hoverTheMap, in: nil, contentWorld: .page)) as? [String: Any],
              let at = found["at"] as? [String: Any], let point = Self.windowPoint(at, in: web) else {
            print("map while scanning: no Not measured block found")
            return false
        }
        let offered = (found["block"] as? String)?.contains("Click to see why.") == true
        let place = ["x": at["x"] ?? 0, "y": at["y"] ?? 0]
        // Without a scan, a click through the window reaches the map, and the block opens Where the space is.
        let reached = Self.reachesTheMap(point, in: window, web: web)
        Self.click(at: point, in: window)
        let opened = await eventually { self.disk.showsWhereTheSpaceIs }
        disk.showsWhereTheSpaceIs = false
        _ = await eventually { !Self.popoverShows }

        let selected = disk.selection
        disk.isScanning = true
        // Once the page knows, the block's card offers no click, and no other card does.
        let told = await pageAnswer(web, Self.hoverAt, arguments: place) { (text: String?) in
            text?.hasPrefix("Not measured") == true && text?.localizedCaseInsensitiveContains("click") == false
        }
        let cards = ((try? await web.callAsyncJavaScript(Self.hoverTheMap, in: nil, contentWorld: .page)) as? [String: Any])?["cards"] as? [String] ?? []
        let offersNone = !cards.isEmpty && cards.allSatisfy { !$0.localizedCaseInsensitiveContains("click") }
        let blocked = await eventually { !Self.reachesTheMap(point, in: window, web: web) }
        Self.click(at: point, in: window)
        // Longer than the click took to open it without a scan.
        try? await Task.sleep(for: .milliseconds(600))
        let ignored = !disk.showsWhereTheSpaceIs && disk.selection == selected
        let linked = await linkOpens()
        disk.showsWhereTheSpaceIs = false
        _ = await eventually { !Self.popoverShows }
        disk.isScanning = scanning
        let offeredAgain = await pageAnswer(web, Self.hoverAt, arguments: place) { (text: String?) in text?.contains("Click to see why.") == true }
        print("map while scanning: without a scan, the block's card offered the click \(offered), a click through the window reached the map "
              + "\(reached) and opened Where the space is \(opened); while scanning, the block's card said \(told ?? "nothing"), \(cards.count) cards "
              + "offered no click \(offersNone), the window's click reached the map \(!blocked) and was ignored \(ignored), the link opened it "
              + "\(linked); once the scan ended the card offered the click again \(offeredAgain != nil)")
        return offered && reached && opened && told.map { !$0.localizedCaseInsensitiveContains("click") } == true && offersNone && blocked && ignored
            && linked && offeredAgain != nil
    }

    /// Clicks "Where the space is", drawn off screen as Disk's control bar draws it: whether it opened.
    private func linkOpens() async -> Bool {
        let host = NSHostingView(rootView: WhereTheSpaceIsLink(model: disk).padding(8))
        let size = host.fittingSize
        let window = NSWindow(contentRect: NSRect(x: -8000, y: -8000, width: size.width, height: size.height), styleMask: [.borderless], backing: .buffered,
                              defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = host
        window.orderFrontRegardless()
        defer { window.orderOut(nil); window.contentView = nil }
        try? await Task.sleep(for: .milliseconds(300))
        Self.click(at: NSPoint(x: size.width / 2, y: size.height / 2), in: window)
        return await eventually { self.disk.showsWhereTheSpaceIs }
    }

    /// Where `at`, a point of the page in CSS pixels, is in the web view's window.
    private static func windowPoint(_ at: [String: Any], in web: WKWebView) -> NSPoint? {
        guard let x = (at["x"] as? NSNumber)?.doubleValue, let y = (at["y"] as? NSNumber)?.doubleValue else { return nil }
        let zoom = web.pageZoom
        let inView = NSPoint(x: x * zoom, y: web.isFlipped ? y * zoom : web.bounds.height - y * zoom)
        return web.convert(inView, to: nil)
    }

    /// Whether a click at `point` in `window` goes to the map's web view, as AppKit finds the view a click goes to.
    private static func reachesTheMap(_ point: NSPoint, in window: NSWindow, web: WKWebView) -> Bool {
        guard let frame = window.contentView?.superview, let hit = frame.hitTest(point) else { return false }
        return hit === web || hit.isDescendant(of: web)
    }

    /// A click at `point` in `window`, sent through the window as AppKit sends the person's. The release waits in the app's
    /// event queue before the press goes: a control that tracks the mouse once pressed, as AppKit's buttons do, takes it
    /// from there and lets go, and anything else gets it from the queue once the press is handled.
    static func click(at point: NSPoint, in window: NSWindow) {
        func event(_ type: NSEvent.EventType) -> NSEvent? {
            NSEvent.mouseEvent(with: type, location: point, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,
                               windowNumber: window.windowNumber, context: nil, eventNumber: 0, clickCount: 1, pressure: type == .leftMouseDown ? 1 : 0)
        }
        guard let press = event(.leftMouseDown), let release = event(.leftMouseUp) else { return }
        NSApp.postEvent(release, atStart: false)
        window.sendEvent(press)
    }

    /// Moves the pointer across the map, a point at a time, saying each card that showed and where the Not measured
    /// block's did.
    private static let hoverTheMap = mapScript("""
        leave();
        await pause(100);
        const frame = canvas.getBoundingClientRect();
        const cards = [];
        let at = null;
        let block = null;
        for (let y = 0.1; y < 1; y += 0.2) {
          for (let x = 0.1; x < 1; x += 0.2) {
            const point = { x: frame.left + frame.width * x, y: frame.top + frame.height * y };
            mouse("mousemove", point);
            await pause(60);
            const text = card();
            if (text) cards.push(text);
            if (!at && text.startsWith("Not measured")) {
              at = point;
              block = text;
            }
          }
        }
        leave();
        return { at, block, cards };
        """)

    /// The card at `x`, `y` on the page.
    private static let hoverAt = mapScript("""
        leave();
        await pause(60);
        mouse("mousemove", { x, y });
        await pause(80);
        const text = card();
        leave();
        return text;
        """)

    /// Keeps every Not measured figure native sends the page from now on, in order, as the page's own receiver gets it:
    /// its bytes, or null for none, and whether a map came in the same call. Native sends a figure and its map in one
    /// call, the figure first, so the map arrives before anything else on the page runs.
    private static let keepNotMeasured = """
        const kept = window.pithSmokeNotMeasured ?? { receive: window.pithReceiveNotMeasured, receiveMap: window.pithReceive };
        kept.sent = [];
        kept.last = null;
        window.pithSmokeNotMeasured = kept;
        window.pithReceiveNotMeasured = (root, bytes, used) => {
          const figure = { bytes, withMap: false };
          kept.sent.push(figure);
          kept.last = figure;
          queueMicrotask(() => {
            if (kept.last === figure) kept.last = null;
          });
          kept.receive(root, bytes, used);
        };
        window.pithReceive = (payload, atOnce) => {
          if (kept.last) kept.last.withMap = true;
          kept.receiveMap(payload, atOnce);
        };
        return true;
        """

    /// The figures kept since, with the page's own receivers back in their places.
    private static let keptNotMeasured = """
        const kept = window.pithSmokeNotMeasured;
        if (!kept) return null;
        window.pithReceiveNotMeasured = kept.receive;
        window.pithReceive = kept.receiveMap;
        delete window.pithSmokeNotMeasured;
        return kept.sent;
        """

    /// A Not measured figure the page got: its bytes, nil for none, and whether its map came with it.
    struct SentFigure {
        let bytes: UInt64?
        let withMap: Bool
    }

    /// Starts keeping the Not measured figures native sends the page: whether it could.
    func keepNotMeasuredSent(_ web: WKWebView) async -> Bool {
        (try? await web.callAsyncJavaScript(Self.keepNotMeasured, in: nil, contentWorld: .page)) as? Bool == true
    }

    /// The Not measured figures native sent the page since `keepNotMeasuredSent`, in order.
    func notMeasuredSent(_ web: WKWebView) async -> [SentFigure]? {
        ((try? await web.callAsyncJavaScript(Self.keptNotMeasured, in: nil, contentWorld: .page)) as? [[String: Any]])?.map {
            SentFigure(bytes: ($0["bytes"] as? NSNumber)?.uint64Value, withMap: $0["withMap"] as? Bool == true)
        }
    }

    /// Figures as a log line names them.
    static func figures(_ sent: [SentFigure]?) -> String {
        guard let sent else { return "nothing it could keep" }
        guard !sent.isEmpty else { return "no figure" }
        return sent.map { "\($0.bytes.map(String.init) ?? "none") \($0.withMap ? "with its map" : "alone")" }.joined(separator: ", ")
    }

    /// Writes `bytes` zeros to `path` from another process, as a download outside Pith does: FSEvents tells a scanned map's
    /// watcher nothing of what Pith writes itself. Zeros written, not a copy, which APFS could make a clone that takes no
    /// space of its own.
    private static func writeOutsidePith(_ path: String, bytes: Int) -> Bool {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/dd")
        process.arguments = ["if=/dev/zero", "of=\(path)", "bs=\(bytes)", "count=1"]
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        guard (try? process.run()) != nil else { return false }
        process.waitUntilExit()
        return process.terminationStatus == 0
    }

    /// A scanned map of a whole volume keeps its Not measured through Refresh. A folder of the run's own stands in for
    /// the volume, as the fixture does for the live map, with figures of its own: its used space twice what the walk
    /// finds and half as much again as the walk finds not measured. A file written outside Pith into one of its folders,
    /// as a download is, makes Refresh scan that folder again, and the volume's space, measured before the refreshed map
    /// goes out, holds the file too: Used on this disk grows by it, Not measured holds still, and the page gets that one
    /// figure, with the refreshed map. Then the live map comes back, as when the person picks the disk again.
    func checkRefreshedVolume(_ fixture: String) async -> [String: Bool] {
        let check = "not_measured_holds_through_a_refresh"
        let files = FileManager.default
        let volume = files.temporaryDirectory.appendingPathComponent("pith-smoke-volume-\(UUID().uuidString)").resolvingSymlinksInPath().path
        let folder = (volume as NSString).appendingPathComponent("folder")
        let download = (folder as NSString).appendingPathComponent("download.bin")
        defer { try? files.removeItem(atPath: volume) }
        guard let web = webView, (try? files.createDirectory(atPath: folder, withIntermediateDirectories: true)) != nil,
              files.createFile(atPath: (folder as NSString).appendingPathComponent("kept.bin"), contents: Data(count: 1 << 20)),
              files.createFile(atPath: (volume as NSString).appendingPathComponent("top.bin"), contents: Data(count: 2 << 20)),
              let walked = (try? await ScannerRunner().scan(binary: disk.binary, root: URL(fileURLWithPath: volume)) { _ in })?.summary.bytes else {
            return [check: false]
        }
        let kept = (measures: disk.measures, measuresSpace: disk.measuresSpace)
        disk.measures = { root in
            guard root == volume else { return kept.measures(root) }
            let written = ((try? FileManager.default.attributesOfItem(atPath: download))?[.size] as? NSNumber)?.uint64Value ?? 0
            return VolumeUse(used: walked * 2 + written, walkedVolumes: [walked + walked / 2 + written], snapshots: 2, purgeable: walked / 4)
        }
        disk.measuresSpace = { root in
            guard root == volume else { return kept.measuresSpace(root) }
            let written = ((try? FileManager.default.attributesOfItem(atPath: download))?[.size] as? NSNumber)?.uint64Value ?? 0
            return VolumeUse.Space(used: walked * 2 + written, walkedVolumes: [walked + walked / 2 + written])
        }
        disk.scan(URL(fileURLWithPath: volume))
        let scanned = await eventually { self.disk.result?.root.path == volume && !self.disk.isScanning && self.disk.notMeasured != nil }
        let block = disk.notMeasured?.bytes, used = disk.notMeasured?.used
        let figure = block.map(bytes)
        let listed = await pageAnswer(web, Self.notMeasuredItem) { (text: String?) in text == figure.map { "Not measured " + $0 } }
        let keeping = await keepNotMeasuredSent(web)
        let written = Self.writeOutsidePith(download, bytes: 1 << 20)
        let noticed = await eventually { !self.disk.changes.isEmpty }
        disk.refresh()
        let refreshed = await eventually { !self.disk.isScanning && self.disk.edited }
        let grown = used.map { $0 + (1 << 20) }
        let grew = await eventually { self.disk.notMeasured?.used == grown }
        let usedAfter = disk.notMeasured?.used, held = disk.notMeasured?.bytes
        let heldOnThePage = await pageAnswer(web, Self.notMeasuredItem) { (text: String?) in text == figure.map { "Not measured " + $0 } }
        // The refreshed map and the volume's space were measured together, so its one figure is the one it had.
        let figuresSent = keeping ? await notMeasuredSent(web) : nil
        let together = figuresSent.map { !$0.isEmpty && $0.allSatisfy { $0.withMap && $0.bytes == block } } ?? false
        disk.measures = kept.measures
        disk.measuresSpace = kept.measuresSpace
        disk.scan(URL(fileURLWithPath: fixture))
        let back = await eventually { self.disk.liveView == fixture && self.disk.result?.root.path == fixture && self.disk.notMeasured == nil }
        let settled = await mapSettles()
        print("refreshed volume: scanned \(scanned) with Not measured \(block.map(String.init) ?? "none") of \(used.map(String.init) ?? "none") used, listed "
              + "\(listed ?? "nothing"); a file written outside Pith noticed \(noticed), refreshed \(refreshed), used "
              + "\(usedAfter.map(String.init) ?? "none") for \(grown.map(String.init) ?? "none"), Not measured \(held.map(String.init) ?? "none"), the "
              + "page's \(heldOnThePage ?? "nothing"); the page got \(Self.figures(figuresSent)); the live map back \(back), settled \(settled)")
        return [check: scanned && block != nil && listed == figure.map { "Not measured " + $0 } && written && noticed && refreshed && grew
            && held == block && heldOnThePage == figure.map { "Not measured " + $0 } && together && back && settled]
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

    /// While macOS asks whether Pith may read some of the live map's folders, Disk's notices name them, with a Full Disk
    /// Access… button that asks for that pane of System Settings, which `panes` records rather than opens, and the
    /// caption keeps its own status. The live map is handed status lines of its own, as the scanner sends them while
    /// macOS asks about 12 folders, then about none, and the notice goes. Disk's notices are drawn as Disk draws them, in
    /// a borderless window of its own off screen, and the notice's button is found by clicking along its line from its
    /// trailing end, as AppKit delivers clicks, until a pane is asked for: SwiftUI gives an app no accessibility tree of
    /// its own views without an assistive app, and the AX API that would needs the Accessibility permission, which a smoke
    /// run mustn't ask for. The notices show nothing else meanwhile, so the asking notice is their only line.
    func checkAskingNotice(_ panes: SystemSettingsAsked) async -> [String: Bool] {
        let check = "asking_notice_opens_full_disk_access"
        guard let live = disk.live, await eventually({
            self.disk.problem == nil && self.disk.trashed == nil && self.disk.result?.summary.errors == 0 && self.disk.askingFolders == nil
        }) else {
            return [check: false]
        }
        func status(asking: Int) -> LiveReport {
            .status(LiveStatus(through: 0, pending: 0, changed: false, checking: false, historyDone: true, asking: asking))
        }
        let captionBefore = disk.caption
        live.handle(status(asking: 12))
        let named = disk.askingFolders == 12
        let caption = disk.caption
        var upToDate = false
        if case .figures(let figures)? = caption { upToDate = figures.map(\.label) == ["Up to date"] }
        // Wide enough for the sentence on one line, so the button sits at the line's middle.
        let width: CGFloat = 1100
        let host = NSHostingView(rootView: VStack(spacing: 0) { DiskNotices(model: disk) }.frame(width: width))
        let height = max(30, host.fittingSize.height)
        let window = NSWindow(contentRect: NSRect(x: -8000, y: -8000, width: width, height: height), styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = host
        window.orderFrontRegardless()
        try? await Task.sleep(for: .milliseconds(300))
        let before = panes.asked.count
        var clicks = 0
        for x in stride(from: width - 4, through: width / 2, by: -6) where panes.asked.count == before {
            Self.click(at: NSPoint(x: x, y: height / 2), in: window)
            clicks += 1
            try? await Task.sleep(for: .milliseconds(20))
        }
        let asked = panes.asked.count == before + 1 && panes.asked.last == .fullDiskAccess
        // A status line of the scanner's own, come meanwhile, would have taken the notice away.
        let stillAsked = disk.askingFolders == 12
        live.handle(status(asking: 0))
        let gone = disk.askingFolders == nil
        window.orderOut(nil)
        window.contentView = nil
        // macOS asking changes the icons' rule, which goes to the page as it changes: once the page has the rule back, the
        // checks after this one see nothing of it.
        let coordinator = webView?.navigationDelegate as? DiskWebView.Coordinator
        let ruleBack = await eventually { self.disk.iconRule.asking == false && coordinator?.iconRule == self.disk.iconRule }
        print("asking notice: \(disk.askingFolders.map(String.init) ?? "none") folders once macOS asks about none, \(named ? 12 : 0) while it asked; "
              + "the caption \(caption == captionBefore ? "kept" : "changed") its status, up to date \(upToDate); the button, found after \(clicks) clicks "
              + "along the notice, asked for \(panes.asked.last?.url?.absoluteString ?? "no pane") \(asked), the notice still up by then \(stillAsked); "
              + "the notice gone again \(gone), the icons' rule back \(ruleBack)")
        return [check: named && caption == captionBefore && upToDate && asked && gone && ruleBack]
    }

    /// Losing Full Disk Access holds the live map's guarded locations until a walk or check of every folder that began
    /// since has ended: the scanner's report of its end lifts the hold at once, with no probe after it, and Pith keeps
    /// the lift, so the next launch's map isn't held (`DiskAccessWatch`). A check that began before the loss keeps the
    /// hold, though it says it ran a second, as the scanner, whose clock stops while the Mac sleeps, says of a check the
    /// Mac slept through. The loss and the checks are handed to Pith, the run keeps its settings in memory, and Pith's
    /// watch is as it was after.
    func checkAccessHoldLifts() async -> [String: Bool] {
        let check = "access_hold_lifts_with_the_listing"
        guard let live = disk.live, let walked = live.listedEveryFolderSince, await eventually({ !self.disk.iconRule.asking }) else { return [check: false] }
        // The loss falls halfway between the map's walk and now, three seconds apart at least, so a second and a half
        // from each: more than the second the slept-through check says it ran, so a start worked out from its end would
        // fall after the loss, and the check holds only if Pith takes the start the report gives.
        if Date().timeIntervalSince(walked) < 3 { try? await Task.sleep(for: .seconds(3)) }
        let was = disk.diskAccess, now = Date()
        let lost = walked.addingTimeInterval(now.timeIntervalSince(walked) / 2)
        var watch = DiskAccessWatch(granted: true)
        watch.probed(.denied, at: lost)
        disk.keepDiskAccess(watch)
        let held = disk.iconRule.asking
        live.handle(.checked(LiveCheck(folders: 1, corrected: 0, bytes: 0, ms: 1_000, startedAt: walked)))
        let heldThroughSleep = disk.iconRule.asking
        live.handle(.checked(LiveCheck(folders: 1, corrected: 0, bytes: 0, ms: 0, startedAt: Date())))
        let lifted = !disk.iconRule.asking && disk.diskAccess.relisted
        let kept = UserDefaults.standard.bool(forKey: Setting.listedSinceFullDiskAccessLost.rawValue)
        disk.keepDiskAccess(was)
        let restored = disk.diskAccess == was && !disk.iconRule.asking
            && UserDefaults.standard.bool(forKey: Setting.listedSinceFullDiskAccessLost.rawValue) == was.relisted
        print("access hold: held once lost \(held), through a check begun before the loss that the Mac slept through \(heldThroughSleep), "
              + "lifted by a check begun since \(lifted), the lift kept \(kept), Pith's watch as it was \(restored)")
        return [check: held && heldThroughSleep && lifted && kept && restored]
    }
}
