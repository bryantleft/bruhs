import AppKit
import WebKit
import PithCore

extension AppDelegate {
    /// Runs the real packaged renderer and scanner against a caller-supplied fixture.
    /// No Trash operation or system setting is changed by this diagnostic.
    func smokeTest(root: URL, report: URL) async {
        var checks: [String: Bool] = [:]
        // The fixture's scans are kept in a folder of the smoke test's own, never the user's, which goes when it ends.
        let scans = FileManager.default.temporaryDirectory.appendingPathComponent("pith-smoke-scans-\(UUID().uuidString)")
        disk.scansFolder = scans
        let forgetScans = { _ = try? FileManager.default.removeItem(at: scans) }
        checks["native_fonts_registered"] = BruhsFonts.isAvailable
        // The fallback symbol is a template image too, so the SVG itself has to decode.
        let glyph = Bundle.main.url(forResource: "StatusGlyph", withExtension: "svg").flatMap(NSImage.init(contentsOf:))
        checks["status_glyph_bundled"] = glyph?.isValid == true && statusItem?.image?.isTemplate == true
        // The smoke test never starts Sparkle, so it can't go online, ask the permission question or change the person's
        // update settings. The bundle's setup is checked as it stands instead.
        checks["updater_idle_in_smoke_test"] = !updates.isAvailable
        let updateProblems = SparkleUpdater.configurationProblems()
        for problem in updateProblems { print("update setup: \(problem)") }
        checks["updates_configured"] = updateProblems.isEmpty
        do {
            showActivity()
            try await waitUntil("a first CPU reading") { self.activity.snapshot?.cpu != nil }
            activity.pause()
            activity.snapshot = nil
            statusItem?.togglePanel()
            try await waitUntil("the menu panel to open") { self.statusItem?.panelWindow?.isVisible == true }
            let initialPanel = statusItem?.panelWindow?.frame
            activity.start()
            try await waitUntil("a CPU reading after resuming") { self.activity.snapshot?.cpu != nil }
            try await Task.sleep(for: .milliseconds(200))
            let populatedPanel = statusItem?.panelWindow
            print("menu panel initial=\(String(describing: initialPanel)) populated=\(String(describing: populatedPanel?.frame)) screen=\(String(describing: populatedPanel?.screen?.frame))")
            if let initialPanel, let populatedPanel {
                checks["menu_panel_size_stable"] = abs(initialPanel.height - populatedPanel.frame.height) < 1
                // A hidden status item has nowhere on screen to anchor the panel; nobody can click it either.
                if statusItem?.isOnScreen == true {
                    checks["menu_panel_stays_on_screen"] = populatedPanel.screen?.frame.contains(populatedPanel.frame) == true
                } else {
                    print("menu_panel_stays_on_screen not checked: macOS is keeping Pith's menu bar item off screen.")
                }
            } else {
                checks["menu_panel_size_stable"] = false
                checks["menu_panel_stays_on_screen"] = false
            }
            // MenuPanelLayout.idealSize must hold the populated panel without scrolling on a display this tall.
            checks["menu_panel_content_fits"] = (statusItem?.panelContentHeight ?? 0) > 0 && statusItem?.panelContentFits == true
            // The panel follows the system's light or dark appearance, as Activity does, whatever the menu bar shows over
            // the wallpaper.
            let panelLooks = statusItem?.panelWindow?.effectiveAppearance.bestMatch(from: [.aqua, .darkAqua])
            let systemLooks = NSApp.effectiveAppearance.bestMatch(from: [.aqua, .darkAqua])
            print("panel appearance=\(panelLooks?.rawValue ?? "none") system=\(systemLooks?.rawValue ?? "none")")
            checks["panel_follows_system_appearance"] = panelLooks != nil && panelLooks == systemLooks
            statusItem?.togglePanel()

            showActivity()
            try await waitUntil("a CPU reading in Activity") { self.activity.snapshot?.cpu != nil }
            checks["native_metrics"] = activity.snapshot?.cpu != nil
            // With Activity on screen samples come every second; they slow to two once the window closes, checked below.
            checks["live_while_watched"] = await samplesApart(ActivityModel.watchedInterval)
            let pid = ProcessInfo.processInfo.processIdentifier
            let own = activity.snapshot?.apps.first { $0.members.contains { $0.pid == pid } }
            checks["own_process_metrics"] = (own?.memory ?? 0) > 0
            // Network by app loads a private framework at run time, which the hardened runtime must still allow.
            checks["network_by_app"] = SystemSampler.countsNetwork && own?.network != nil
            // Pith names itself from its bundle and sorts macOS's own daemons into System.
            checks["process_identity"] = own?.identity.kind == .app && own?.name == "Pith"
                && activity.snapshot?.apps.contains { $0.identity.kind == .system } == true

            guard let main = mainWindow else { throw DiskFailure("Activity didn't open the main window.") }
            // Title, subtitle, toolbar items and search reach the NSWindow through scene bridging. Live, the window has
            // no subtitle; pausing, below, checks that one arrives.
            checks["window_toolbar_bridged"] = await eventually {
                main.window.title == "Pith" && main.window.subtitle.isEmpty
                    && main.window.toolbar?.items.contains { $0 is NSSearchToolbarItem } == true
            }

            // Rank by the last few samples, as a drag across the chart does.
            try await waitUntil("three samples of history") { self.activity.history.system.compactMap(\.cpu).count >= 3 }
            guard let window = activity.window else { throw DiskFailure("Activity has no history window.") }
            let range = (window.upperBound - 3 * ActivityModel.interval)...window.upperBound
            main.state.activity.rank(by: range)
            let ranked = ActivityListing(history: activity.history, latest: activity.snapshot, range: range, search: "", includeExited: false, sort: main.state.activity.sort)
            checks["range_ranking_scope"] = await eventually { main.state.activity.range != nil && main.window.subtitle.isEmpty }
                && activity.history.systemCPU(in: range) != nil && !ranked.apps.isEmpty && main.state.activity.sort == .cpuDescending
            // Escape with the table focused arrives as SwiftUI's exit command.
            if let content = main.window.contentView, let table = firstView(NSOutlineView.self, in: content) { main.window.makeFirstResponder(table) }
            if let escape = NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,
                                             windowNumber: main.window.windowNumber, context: nil, characters: "\u{1b}", charactersIgnoringModifiers: "\u{1b}", isARepeat: false, keyCode: 53) {
                main.window.sendEvent(escape)
            }
            checks["escape_returns_to_live"] = await eventually { main.state.activity.range == nil && main.window.subtitle.isEmpty }
            checks["search_cut_and_undo"] = await checkSearchCutAndUndo(in: main)

            activity.pause()
            let subtitled = await eventually { main.window.subtitle == "Sampling paused" }
            checks["window_toolbar_bridged"] = checks["window_toolbar_bridged"] == true && subtitled
            let pausedCount = activity.history.system.count
            // Longer than a sampling interval, so a pause that didn't stop sampling can't pass by luck.
            try await Task.sleep(for: .seconds(ActivityModel.interval * 1.5))
            checks["pause_stops_history"] = activity.history.system.count == pausedCount
            activity.start()

            // The fixture's map is a live one, as the startup disk's is: made once when Disk opens, then kept current.
            let fixture = root.resolvingSymlinksInPath().path
            disk.startLive(root: fixture, keep: true)
            showDisk()
            checks["tab_switches"] = await eventually { main.window.title == "Pith" && main.state.tab == .disk }
            try await waitUntil("the first map") { self.disk.result?.root.path == fixture }
            if let problem = disk.problem { throw DiskFailure(problem.message) }
            checks["live_map_made"] = disk.live?.state.isMapped == true && disk.live?.restored == false
            // It counts what a scan of the same folder does.
            let scanned = try await ScannerRunner().scan(binary: disk.binary, root: URL(fileURLWithPath: fixture)) { _ in }
            print("live map \(disk.result?.root.size ?? 0) bytes, \(disk.result?.summary.files ?? 0) files; scan \(scanned.root.size) bytes, \(scanned.summary.files) files")
            checks["live_map_matches_scan"] = disk.result?.root.size == scanned.root.size && disk.result?.summary.files == scanned.summary.files
            checks.merge(try await inspectDisk(), uniquingKeysWith: { _, new in new })
            // Before the icon route's check, which stops every load the page has going.
            checks.merge(await checkListIcons(), uniquingKeysWith: { _, new in new })
            checks.merge(await checkSideLists(fixture), uniquingKeysWith: { _, new in new })
            checks.merge(await checkIconsReachEveryPage(), uniquingKeysWith: { _, new in new })
            checks.merge(await checkIconRoute(fixture), uniquingKeysWith: { _, new in new })
            checks.merge(await checkPathBar(fixture, in: main), uniquingKeysWith: { _, new in new })
            checks.merge(try await checkLiveFollows(disk, in: fixture, prefix: "live_map"), uniquingKeysWith: { _, new in new })
            checks.merge(try await checkLiveReopens(fixture), uniquingKeysWith: { _, new in new })
            // Leaving the Disk tab keeps the map, so its open folder survives; closing the window frees WebKit.
            // An identity, not a reference: holding the view here would keep it alive past the window's close.
            let shown = webView.map(ObjectIdentifier.init)
            main.show(.activity)
            try await Task.sleep(for: .milliseconds(200))
            checks["disk_kept_across_tabs"] = shown != nil && webView.map(ObjectIdentifier.init) == shown && webView?.isHidden == true
            showDisk()
            main.window.performClose(nil)
            checks["disk_webview_released"] = await eventually { self.webView == nil }
            checks["main_window_released"] = mainWindow == nil
            let samples = activity.history.system.count
            checks["monitoring_survives_window_close"] = await eventually { !self.activity.paused && self.activity.history.system.count > samples }
            // Before the panel opens, which would count as watching again.
            checks["slower_when_unwatched"] = await samplesApart(ActivityModel.interval)
            statusItem?.togglePanel()
            checks["menu_panel_opens"] = statusItem?.panelWindow?.isVisible == true
            statusItem?.togglePanel()
            // Last, after everything the run did: the person's settings and the files Pith keeps for them, their history
            // among them, are as they were before it began.
            let changes = stateAtLaunch.map { PersistedState.read().differences(from: $0) } ?? ["nothing read at launch"]
            print("the person's state: \(changes.isEmpty ? "as it was" : "changed \(changes)")")
            checks["left_the_persons_state_alone"] = changes.isEmpty
            forgetScans()
            let data = try JSONSerialization.data(withJSONObject: checks, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: report)
            print(String(decoding: data, as: UTF8.self))
            if checks.values.contains(false) { exit(1) }
            NSApp.terminate(nil)
        } catch {
            forgetScans()
            let failure: [String: Any] = ["checks": checks, "error": error.localizedDescription]
            if let data = try? JSONSerialization.data(withJSONObject: failure, options: [.prettyPrinted, .sortedKeys]) { try? data.write(to: report); print(String(decoding: data, as: UTF8.self)) }
            exit(1)
        }
    }

    private func inspectDisk() async throws -> [String: Bool] {
        try await waitUntil("the disk map to load") {
            guard let web = self.webView else { return false }
            return web.url?.scheme == "pith" && !web.isLoading
        }
        guard let web = webView else { throw DiskFailure("Disk web view was not created.") }
        var rendered = false
        for _ in 0..<100 {
            rendered = (try? await web.callAsyncJavaScript("return !!document.querySelector('canvas') && document.querySelector('canvas').width > 0", in: nil, contentWorld: .page)) as? Bool == true
            if rendered { break }
            try await Task.sleep(for: .milliseconds(100))
        }
        guard rendered else { throw DiskFailure("The real WKWebView did not render a treemap. \(disk.problem?.message ?? "No native error.")") }
        // The labels' face must load. `document.fonts.check` would also pass with no matching face declared at all.
        let fonts = (try? await web.callAsyncJavaScript("return (await document.fonts.load('11px MonaspaceNeonVariable')).some((face) => face.status === 'loaded')", in: nil, contentWorld: .page)) as? Bool == true
        let labels = (try await web.callAsyncJavaScript("return document.querySelector('canvas').getAttribute('aria-label').includes('Treemap') && document.querySelector('[aria-label=\"Largest files\"]') !== null", in: nil, contentWorld: .page)) as? Bool == true
        // Selecting shows the selection bar; the map mustn't change size under the pointer, or the second click of a
        // double-click lands on another block.
        let mapHeight = "return document.querySelector('canvas').getBoundingClientRect().height"
        // The canvas draws before the page finishes laying it out, which a slow first launch makes visible: the height is
        // read once two readings a tenth of a second apart agree.
        var before = try await web.callAsyncJavaScript(mapHeight, in: nil, contentWorld: .page) as? Double
        for _ in 0..<50 {
            try await Task.sleep(for: .milliseconds(100))
            let again = try await web.callAsyncJavaScript(mapHeight, in: nil, contentWorld: .page) as? Double
            if let again, again > 0, again == before { break }
            before = again
        }
        _ = try await web.callAsyncJavaScript("document.querySelector('aside button')?.click()", in: nil, contentWorld: .page)
        try await Task.sleep(for: .milliseconds(400))
        let selection = disk.selected != nil
        // The bundled scanner measures what deleting the selection frees, beside the scan's own runner.
        let frees = await eventually { self.disk.selectedFrees != nil }
        let after = try await web.callAsyncJavaScript(mapHeight, in: nil, contentWorld: .page) as? Double
        print("map height before selection=\(before ?? -1) after=\(after ?? -1)")
        let icon = await checkSelectionIcon()
        // Bigger Text zooms the map's page too. The step is undone, since this runs with the user's settings, and the
        // page is back at its usual zoom before anything after measures it.
        let size = TextSize.shared, grow = size.canGrow, usual = size.scale
        size.step(grow ? 1 : -1)
        let zoomed = await eventually { web.pageZoom == size.scale } && size.scale != usual
        size.step(grow ? -1 : 1)
        let zooms = await eventually { web.pageZoom == usual } && zoomed
        _ = try await web.callAsyncJavaScript("window.location.href = 'https://example.com/'", in: nil, contentWorld: .page)
        try await Task.sleep(for: .milliseconds(200))
        return ["treemap_rendered": rendered, "bundled_fonts": fonts, "accessible_map": labels,
            "selection_bridge": selection, "selection_frees_measured": frees, "selection_icon_follows_appearance": icon,
            "map_follows_text_size": zooms, "map_keeps_size_on_select": before != nil && before == after, "remote_navigation_blocked": web.url?.scheme == "pith"]
    }

    /// Switches the window to light and then to dark: the bar under the map draws the selection's icon again for
    /// each, off the main thread. The window goes back to following the system after.
    private func checkSelectionIcon() async -> Bool {
        guard let window = mainWindow?.window, let item = disk.selectedItem else { return false }
        let key = disk.iconKey(for: item)
        let size = IconSize(points: 16, scale: window.backingScaleFactor)
        let chosen = window.appearance
        defer { window.appearance = chosen }
        var drawn: [IconAppearance] = []
        for appearance in IconAppearance.allCases {
            window.appearance = NSAppearance(named: appearance == .dark ? .darkAqua : .aqua)
            if await eventually({ Icons.store.cachedIcon(for: IconRequest(key, size: size, appearance: appearance)) != nil }) { drawn.append(appearance) }
        }
        print("selection icon \(key.string) drawn for \(drawn.map(\.rawValue))")
        return drawn == IconAppearance.allCases
    }

    /// The side lists and the hover card lead with macOS's icons, which the page loads from Pith's route at its own
    /// pixel ratio: every row of Largest files shows one that has loaded, and so does the card for the block under the
    /// pointer. Each is decorative, with an empty alt.
    private func checkListIcons() async -> [String: Bool] {
        guard let web = webView else { return ["side_rows_show_icons": false, "hover_card_shows_icon": false] }
        let rows = await pageAnswer(web, Self.rowIcons) { (rows: [String: Any]?) in
            let count = rows?["rows"] as? Int ?? 0
            return count > 0 && rows?["loaded"] as? Int == count
        }
        _ = try? await web.callAsyncJavaScript(Self.pointAtMap("mousemove"), in: nil, contentWorld: .page)
        let card = await pageAnswer(web, Self.cardIcon) { (src: String?) in src != nil }
        _ = try? await web.callAsyncJavaScript(Self.pointAtMap("mouseout"), in: nil, contentWorld: .page)
        let count = rows?["rows"] as? Int ?? 0
        print("side rows: \(rows?["loaded"] as? Int ?? 0) of \(count) icons loaded, first \(rows?["first"] as? String ?? "none"); hover card \(card ?? "no icon")")
        return ["side_rows_show_icons": count > 0 && rows?["loaded"] as? Int == count, "hover_card_shows_icon": card != nil]
    }

    /// How many rows Largest files has, and how many lead with a decorative icon from the page's icon base that has
    /// loaded at the page's own scale.
    private static let rowIcons = """
        const base = window.pithIconBase;
        const scale = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio)));
        const icons = [...document.querySelectorAll('[aria-label="Largest files"] li')].map((row) => row.querySelector("img"));
        const loaded = icons.filter((icon) => icon !== null && typeof base === "string" && icon.src.startsWith(base + "16@" + scale + "x/")
          && icon.complete && icon.naturalWidth === 16 * scale && icon.alt === "");
        return { rows: icons.length, loaded: loaded.length, first: icons[0]?.src ?? null };
        """

    /// The pointer moving onto the middle of the map, or off it again, as the page hears it.
    private static func pointAtMap(_ event: String) -> String {
        """
        const canvas = document.querySelector("canvas");
        const box = canvas.getBoundingClientRect();
        canvas.dispatchEvent(new MouseEvent("\(event)", { bubbles: true, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2,
          relatedTarget: document.body }));
        """
    }

    /// The hover card's icon, once it has loaded: its URL, or null.
    private static let cardIcon = """
        const icon = document.querySelector(".tooltip img");
        return icon !== null && icon.complete && icon.naturalWidth > 0 && icon.alt === "" ? icon.src : null;
        """

    /// Grew since, Wrote the most since and Couldn't read lead with their items' icons too. A folder of the fixture that
    /// nobody may list shows under Couldn't read. What grew and who wrote are put in memory, since Pith keeps its record
    /// of them with the person's scans, history and settings, which the smoke test never reads or writes: the fixture's
    /// sub folder grew, and an app with a real bundle and a tool without one wrote. They reach the page as any writers
    /// do, so the route has to allow the app's icon by its bundle, and the tool shows none.
    private func checkSideLists(_ fixture: String) async -> [String: Bool] {
        let names = ["grew_since_shows_icons", "wrote_the_most_shows_app_icons", "couldnt_read_shows_icons"]
        let files = FileManager.default
        let locked = URL(fileURLWithPath: fixture).appendingPathComponent("pith-smoke-locked-\(UUID().uuidString)")
        defer {
            // Readable again first: a folder nobody may list can't be emptied to remove.
            try? files.setAttributes([.posixPermissions: 0o755], ofItemAtPath: locked.path)
            try? files.removeItem(at: locked)
        }
        guard let web = webView,
              (try? files.createDirectory(at: locked, withIntermediateDirectories: false, attributes: [.posixPermissions: 0])) != nil else {
            return Dictionary(uniqueKeysWithValues: names.map { ($0, false) })
        }
        let listed = await eventually { self.disk.result?.root.children?.contains { $0.path == locked.path && $0.kind == .unreadable } == true }
        let sub = (fixture as NSString).appendingPathComponent("sub"), app = "/System/Library/CoreServices/Finder.app"
        let kept = (writers: disk.writers, growth: disk.growth, since: disk.growthSince)
        disk.writers = { since in
            .apps([DiskWriter(name: "Finder", bytes: 3_000_000, bundle: app), DiskWriter(name: "pith-smoke-tool", bytes: 1_000_000)], since: since)
        }
        let grown: [String: Int64] = [sub: 2_000_000]
        let lists = await pageAnswer(web, Self.sideListIcons, arguments: ["grewKey": IconKey.item(sub).string, "appKey": IconKey.item(app).string]) {
            (lists: [String: Bool]?) in
            // A newer map compares itself with the baseline again, which drops a growth put in memory, so it's put back.
            if self.disk.growth != grown { self.disk.growth = grown; self.disk.growthSince = Date(); self.disk.revision = UUID() }
            return lists?["grew"] == true && lists?["wrote"] == true && lists?["unreadable"] == true
        }
        disk.writers = kept.writers; disk.growth = kept.growth; disk.growthSince = kept.since; disk.revision = UUID()
        print("side lists: grew \(lists?["grew"] ?? false), wrote \(lists?["wrote"] ?? false), couldn't read \(lists?["unreadable"] ?? false) "
              + "(the locked folder listed \(listed))")
        return [names[0]: lists?["grew"] == true, names[1]: lists?["wrote"] == true, names[2]: listed && lists?["unreadable"] == true]
    }

    /// Whether the side lists lead with loaded, decorative icons: the folder that grew with its own, the app that wrote
    /// with its bundle's while the tool after it shows none, and the folder nobody may read with a plain folder.
    private static let sideListIcons = """
        const loaded = (icon) => icon !== null && icon.complete && icon.naturalWidth > 0 && icon.alt === "";
        const rows = (heading) => [...(document.querySelector('[aria-labelledby="' + heading + '"]')?.querySelectorAll("li") ?? [])]
          .map((row) => row.querySelector("img"));
        const grew = rows("grew-heading"), wrote = rows("writers-heading"), unreadable = rows("unreadable-heading");
        return {
          grew: grew.some((icon) => loaded(icon) && icon.src.endsWith("/" + grewKey + ".png")),
          wrote: wrote.length === 2 && loaded(wrote[0]) && wrote[0].src.endsWith("/" + appKey + ".png") && wrote[1] === null,
          unreadable: unreadable.some((icon) => loaded(icon) && icon.src.endsWith("/folder.png")),
        };
        """

    /// The icons' base and rule reach the page once it's ready and again when either changes, never with each map: a map
    /// sent again leaves them alone, and a reloaded page gets them before its first map, so its rows lead with their
    /// icons again.
    private func checkIconsReachEveryPage() async -> [String: Bool] {
        let names = ["icon_base_not_resent_with_maps", "icons_reach_a_reloaded_page"]
        guard let web = webView else { return Dictionary(uniqueKeysWithValues: names.map { ($0, false) }) }
        _ = try? await web.callAsyncJavaScript(Self.countReceipts, in: nil, contentWorld: .page)
        disk.revision = UUID()
        let counts = await pageAnswer(web, "return window.pithSmokeCounts ?? null") { (counts: [String: Int]?) in (counts?["maps"] ?? 0) > 0 }
        let before = await pageIconBase(web)
        web.reload()
        // The page that counted is gone once the reloaded one answers.
        let rows = await pageAnswer(web, "if (window.pithSmokeCounts !== undefined) return null;\n" + Self.rowIcons) { (rows: [String: Any]?) in
            let count = rows?["rows"] as? Int ?? 0
            return count > 0 && rows?["loaded"] as? Int == count
        }
        let after = await pageIconBase(web)
        let count = rows?["rows"] as? Int ?? 0
        print("icons across maps: \(counts?["maps"] ?? 0) maps and \(counts?["bases"] ?? -1) bases sent; after a reload \(rows?["loaded"] as? Int ?? 0) "
              + "of \(count) icons loaded from \(after ?? "no base"), before \(before ?? "no base")")
        return [names[0]: (counts?["maps"] ?? 0) > 0 && counts?["bases"] == 0,
                names[1]: before != nil && after == before && count > 0 && rows?["loaded"] as? Int == count]
    }

    /// Counts the maps and the icons' bases Pith gives the page from now on, in `window.pithSmokeCounts`.
    private static let countReceipts = """
        const counts = { maps: 0, bases: 0 };
        window.pithSmokeCounts = counts;
        const receive = window.pithReceive, base = window.pithReceiveIconBase;
        window.pithReceive = (...values) => { counts.maps += 1; return receive(...values); };
        window.pithReceiveIconBase = (...values) => { counts.bases += 1; return base(...values); };
        """

    /// The map's page loads icons from Pith's own scheme, so a canvas can read them back. The map's own folder draws on
    /// a canvas whose pixels `getImageData` returns, which it refuses for an image from another origin, while a folder
    /// outside the map and a key of no kind get a 404. When the page stops loads while their icons are still being
    /// drawn, WebKit stops the route's requests, and each of their drawings still comes and goes unanswered, since
    /// WebKit raises an exception for an answer to a stopped request; the route then answers a URL it hasn't served. A
    /// new appearance gives the page a new base, a generation on, whose icons load too.
    private func checkIconRoute(_ fixture: String) async -> [String: Bool] {
        let names = ["icon_route_draws_on_canvas", "icon_route_refuses_what_the_map_doesnt_show", "icon_route_survives_stopped_loads",
                     "icon_base_follows_appearance"]
        guard let web = webView, let window = web.window, let assets = web.configuration.urlSchemeHandler(forURLScheme: "pith") as? BundledAssets else {
            return Dictionary(uniqueKeysWithValues: names.map { ($0, false) })
        }
        let own = IconKey.item(fixture).string
        // Whether `key`'s icon loads at `points` pt at 2x and draws on a canvas, with how many of its pixels show, and
        // which of `others` load. WebKit keeps an image for as long as its URL stays the same, so only a URL the page
        // hasn't loaded reaches the route.
        func draw(_ key: String, points: Int = 16, others: [String] = []) async -> (drawn: Bool, painted: Int, loaded: [Bool]) {
            let result = try? await web.callAsyncJavaScript(Self.drawIcons, arguments: ["keys": [key] + others, "size": "\(points)@2x"], in: nil,
                                                            contentWorld: .page) as? [String: Any]
            let painted = result?["painted"] as? Int ?? 0
            return (result?["width"] as? Int == points * 2 && painted > 0, painted, result?["loaded"] as? [Bool] ?? [])
        }
        let before = await pageIconBase(web)
        let first = await draw(own, others: [IconKey.item("/Applications").string, "thing/x"])

        let stoppedBefore = assets.stoppedWhileDrawing, lateBefore = assets.drawnAfterStopping
        let unfinished = (try? await web.callAsyncJavaScript(Self.stopIcons, in: nil, contentWorld: .page)) as? Int ?? -1
        // WebKit can tell the route of a stop after the page's loads have ended, so the stops are counted once no request
        // waits for its drawing: each was either answered or stopped by then.
        let settled = await eventually { assets.waitingForDrawings == 0 }
        let stopped = assets.stoppedWhileDrawing - stoppedBefore
        let caughtUp = await eventually { assets.drawnAfterStopping - lateBefore >= stopped }
        let late = assets.drawnAfterStopping - lateBefore
        // At a size the page hasn't loaded, so the route answers it.
        let afterStopping = await draw(own, points: 12)

        let chosen = window.appearance
        defer { window.appearance = chosen }
        let other: IconAppearance = before?.hasSuffix("/dark/") == true ? .light : .dark
        let expected = before.flatMap(Self.generation).map { IconPolicy.base(generation: $0 + 1, appearance: other) }
        window.appearance = NSAppearance(named: other == .dark ? .darkAqua : .aqua)
        let after = await pageIconBase(web) { $0 == expected }
        // The new base makes these URLs the page hasn't loaded too.
        let inOther = await draw(own)
        print("icon route from \(before ?? "no base"): \(own) painted \(first.painted) pixels, others loaded \(first.loaded); "
              + "\(stopped) requests stopped while drawing, \(late) of their drawings came unanswered, \(unfinished) of 120 loads unfinished on the page, "
              + "then a new size drew \(afterStopping.drawn); \(other.rawValue) gave \(after ?? "no base") for \(expected ?? "nothing"), drew \(inOther.drawn)")
        return [names[0]: first.drawn, names[1]: first.loaded == [false, false], names[2]: settled && stopped > 0 && caughtUp && afterStopping.drawn,
                names[3]: expected != nil && after == expected && inOther.drawn]
    }

    /// Loads `keys`' icons from the page's icon base at `size`, and draws the first on a canvas: its width, how many of
    /// its pixels show, and which of the rest loaded. `getImageData` throws for a canvas another origin's image drew on.
    private static let drawIcons = """
        const base = window.pithIconBase;
        if (typeof base !== "string") return null;
        const load = async (key) => {
          const image = new Image();
          image.src = base + size + "/" + key + ".png";
          try { await image.decode(); return image; } catch { return null; }
        };
        const [first, ...rest] = await Promise.all(keys.map(load));
        let painted = 0;
        if (first) {
          const canvas = document.createElement("canvas");
          canvas.width = first.naturalWidth;
          canvas.height = first.naturalHeight;
          const context = canvas.getContext("2d");
          context.drawImage(first, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) painted += 1;
        }
        return { width: first ? first.naturalWidth : 0, painted, loaded: rest.map((image) => image !== null) };
        """

    /// Asks for 120 icons nothing has drawn, each at a size of its own, since macOS draws an icon at a new size slowly
    /// the first time, then stops every load once the first has come, while most are still being drawn: how many of
    /// the loads didn't finish.
    private static let stopIcons = """
        const base = window.pithIconBase;
        if (typeof base !== "string") return -1;
        const loads = Array.from({ length: 120 }, (_, n) => {
          const image = new Image();
          image.src = base + (8 + n) + "@1x/type/pith-smoke-" + n + ".png";
          return image.decode().then(() => true, () => false);
        });
        await Promise.race(loads);
        window.stop();
        return (await Promise.all(loads)).filter((loaded) => !loaded).length;
        """

    /// The page's icon base, once `wanted` holds for it or the smoke test's patience runs out.
    private func pageIconBase(_ web: WKWebView, until wanted: (String?) -> Bool = { _ in true }) async -> String? {
        await pageAnswer(web, "return window.pithIconBase ?? null", until: wanted)
    }

    /// What `script` returns in the map's page, given `arguments`, once `done` holds for it or the smoke test's patience
    /// runs out.
    private func pageAnswer<Answer>(_ web: WKWebView, _ script: String, arguments: [String: Any] = [:], until done: (Answer?) -> Bool) async -> Answer? {
        let deadline = Date().addingTimeInterval(Self.patience)
        while true {
            let answer = (try? await web.callAsyncJavaScript(script, arguments: arguments, in: nil, contentWorld: .page)) as? Answer
            if done(answer) || Date() >= deadline { return answer }
            try? await Task.sleep(for: .milliseconds(100))
        }
    }

    /// The generation in an icon base, `pith://app/icon/<generation>/<appearance>/`.
    private static func generation(_ base: String) -> Int? {
        let prefix = "pith://app/icon/"
        return base.hasPrefix(prefix) ? Int(base.dropFirst(prefix.count).prefix { $0 != "/" }) : nil
    }

    /// The path bar over the map: its disk reads as the disk's own name, not "/", and its menu lists every disk mounted,
    /// each with its icon from the icon store, then Choose Folder. A folder of the path opens the map there, as clicking
    /// it does, and Back and Forward, typed with the map focused, retrace the steps, each only when there's somewhere to
    /// go.
    private func checkPathBar(_ fixture: String, in main: MainWindowController) async -> [String: Bool] {
        let sub = (fixture as NSString).appendingPathComponent("sub")
        // Disk lists the disks off the main thread as it opens.
        let listed = await eventually { !self.disk.choices.isEmpty }
        // The fixture is on the startup disk, which the bar names as macOS does, then each folder down to the map's.
        let path = disk.folderPath
        let named = listed && path?.volume == FolderPath.Volume(path: "/", name: DiskModel.startupDiskName) && path?.folders.last == fixture
        // The path bar draws the disks' icons for the menu ahead of time.
        let appearance = IconAppearance(main.window.effectiveAppearance), scale = main.window.backingScaleFactor
        let drawn = await eventually {
            self.disk.choices.allSatisfy { Icons.store.cachedIcon(for: DiskModel.menuIconRequest($0.url.path, appearance: appearance, scale: scale)) != nil }
        }
        // A disk's item reads its name, then its free space: "Macintosh HD", a tab, "Free 49.3 GB".
        let items = disk.diskMenu(appearance: appearance, scale: scale).menu.items
        let disks = items.prefix { !$0.isSeparatorItem }
        let mounted = Self.mountedDiskNames()
        let startup = disks.first { $0.title.hasPrefix(DiskModel.startupDiskName + "\tFree ") }
        let menu = drawn && !mounted.isEmpty && mounted.allSatisfy { name in disks.contains { $0.title == name || $0.title.hasPrefix(name + "\t") } }
            && disks.allSatisfy { $0.image != nil } && startup?.state == .on
            && items.count == disks.count + 2 && items.last?.title == "Choose Folder…" && items.last?.keyEquivalent == "o"
        print("path bar \(path?.volume.name ?? "none") then \(path?.folders.count ?? 0) folders; disk menu \(disks.map { $0.title }) for \(mounted.sorted())")
        // A disk icon the store doesn't have is drawn for the menu and shows once it's ready: here at 3x, which nothing on
        // a Mac's display asks for.
        let undrawn = disk.diskMenu(appearance: appearance, scale: 3).menu.items.prefix { !$0.isSeparatorItem }
        let missing = undrawn.filter { $0.image == nil }.count
        let arrive = await eventually { undrawn.allSatisfy { $0.image != nil } }
        print("disk menu at 3x: \(missing) of \(undrawn.count) icons missing, then shown \(arrive)")

        // Nothing opened yet, so Back and Forward have nowhere to go.
        let nowhere = goItem("Back")?.isEnabled == false && goItem("Forward")?.isEnabled == false
        // Sub opens in the map; then the folder enclosing it in the path, the fixture's own, opens as its button does.
        disk.pageCommand?(.open(sub))
        let opened = await eventually { self.disk.openFolder == sub && self.disk.folderPath?.folders.last == sub }
        let enclosing = disk.folderPath?.folders.dropLast().last
        if let enclosing { disk.show(enclosing) }
        let up = await eventually { self.disk.openFolder == fixture }
        // ⌘[ goes back to sub and ⌘] forward to the fixture again, typed with the map focused, as after a click on it.
        if let web = webView { main.window.makeFirstResponder(web) }
        let focused = webView.map { (main.window.firstResponder as? NSView)?.isDescendant(of: $0) == true } == true
        let canGoBack = goItem("Back")?.isEnabled == true
        pressCommand("[", keyCode: 33, in: main.window)
        let back = await eventually { self.disk.openFolder == sub }
        let canGoForward = goItem("Forward")?.isEnabled == true
        pressCommand("]", keyCode: 30, in: main.window)
        let forward = await eventually { self.disk.openFolder == fixture }
        let end = goItem("Forward")?.isEnabled == false && goItem("Back")?.isEnabled == true
        print("path bar opened \(opened), then \(enclosing ?? "nothing") \(up); nowhere \(nowhere), focused \(focused), back \(canGoBack) \(back), forward \(canGoForward) \(forward), then \(end)")
        return ["path_bar_names_the_disk": named, "disk_menu_lists_disks": menu, "disk_menu_draws_missing_icons": missing > 0 && arrive,
                "path_bar_opens_a_folder": opened && enclosing == fixture && up,
                "go_back_and_forward": nowhere && focused && canGoBack && back && canGoForward && forward && end]
    }

    /// The names of the disks mounted now that Finder's sidebar shows, as macOS gives them to this check.
    private static func mountedDiskNames() -> Set<String> {
        let keys: Set<URLResourceKey> = [.volumeLocalizedNameKey, .volumeIsBrowsableKey]
        let volumes = FileManager.default.mountedVolumeURLs(includingResourceValuesForKeys: Array(keys), options: [.skipHiddenVolumes]) ?? []
        return Set(volumes.compactMap { url in
            guard let values = try? url.resourceValues(forKeys: keys), values.volumeIsBrowsable != false else { return nil }
            return values.volumeLocalizedName
        })
    }

    /// The Go menu's item titled `title`, enabled as the menu bar shows it now.
    private func goItem(_ title: String) -> NSMenuItem? {
        let go = NSApp.mainMenu?.item(withTitle: "Go")?.submenu
        go?.update()
        return go?.item(withTitle: title)
    }

    /// Presses Command and `key` as AppKit routes a key equivalent: to the window's views first, the map's page among
    /// them when it has the focus, then to the main menu.
    private func pressCommand(_ key: String, keyCode: UInt16, in window: NSWindow) {
        guard let event = NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: .command, timestamp: ProcessInfo.processInfo.systemUptime,
                                           windowNumber: window.windowNumber, context: nil, characters: key, charactersIgnoringModifiers: key,
                                           isARepeat: false, keyCode: keyCode) else { return }
        if !window.performKeyEquivalent(with: event) { _ = NSApp.mainMenu?.performKeyEquivalent(with: event) }
    }

    /// Whether the next two samples arrive about `interval` apart, as the model's cadence promises.
    private func samplesApart(_ interval: TimeInterval) async -> Bool {
        guard let start = activity.snapshot?.uptime else { return false }
        var arrivals: [Double] = []
        let arrived = await eventually {
            if let now = self.activity.snapshot?.uptime, now > (arrivals.last ?? start) { arrivals.append(now) }
            return arrivals.count >= 2
        }
        guard arrived, arrivals.count >= 2 else { return false }
        let gap = arrivals[1] - arrivals[0]
        print("samples \(gap) s apart, expecting \(interval)")
        return abs(gap - interval) < 0.35
    }

    /// Writes a file in the fixture from another process, as most changes come, then deletes it: the map follows both
    /// by itself.
    private func checkLiveFollows(_ model: DiskModel, in fixture: String, prefix: String) async throws -> [String: Bool] {
        let before = model.result?.root.size ?? 0
        let added = URL(fileURLWithPath: fixture).appendingPathComponent("sub/pith-smoke-\(UUID().uuidString).bin")
        defer { try? FileManager.default.removeItem(at: added) }
        let write = Process()
        write.executableURL = URL(fileURLWithPath: "/bin/dd")
        write.arguments = ["if=/dev/zero", "of=\(added.path)", "bs=65536", "count=4"]
        write.standardError = FileHandle.nullDevice
        try write.run()
        write.waitUntilExit()
        let grew = await eventually { (model.result?.root.size ?? 0) >= before + 262_144 }
        try FileManager.default.removeItem(at: added)
        let shrank = await eventually { model.result?.root.size == before }
        print("\(prefix): before \(before), grew \(grew), back \(shrank) at \(model.result?.root.size ?? 0)")
        return ["\(prefix)_follows_a_new_file": grew, "\(prefix)_follows_a_deletion": shrank]
    }

    /// Quits the live map as Pith's quit does, which saves it, then opens it in a second model as the next launch
    /// would: it must open on the saved map, not walk again, and go on following changes.
    private func checkLiveReopens(_ fixture: String) async throws -> [String: Bool] {
        guard let live = disk.live, let size = disk.result?.root.size else { return ["live_map_reopens": false] }
        final class Flag { var on = false }
        let stopped = Flag()
        live.stop(timeout: .seconds(10)) { stopped.on = true }
        try await waitUntil("the map to be saved") { stopped.on }
        let reopened = DiskModel()
        reopened.scansFolder = disk.scansFolder
        reopened.startLive(root: fixture, keep: true)
        reopened.visibilityChanged(true)
        let opens = await eventually { reopened.result?.root.path == fixture }
        let restored = reopened.live?.restored == true && reopened.live?.rebuildReason == nil
        let same = reopened.result?.root.size == size
        print("reopened: opens \(opens), restored \(restored), size \(reopened.result?.root.size ?? 0) against \(size)")
        let follows = try await checkLiveFollows(reopened, in: fixture, prefix: "reopened_map")
        // As Pith's quit stops it: on the main thread, the scanner saving as it exits.
        let quitting = Date()
        reopened.live?.stopNow(timeout: 5)
        let quit = Date().timeIntervalSince(quitting)
        print("the reopened map stopped as at quit in \(String(format: "%.2f", quit)) s")
        return ["live_map_reopens_without_walking": opens && restored, "live_map_reopens_the_same": same, "live_map_stops_at_quit": quit < 5]
            .merging(follows) { _, new in new }
    }

    /// Command-X then Command-Z in Activity's search field, through the Edit menu as a key press would go. The user's
    /// clipboard is put back afterwards.
    private func checkSearchCutAndUndo(in main: MainWindowController) async -> Bool {
        guard let field = main.window.toolbar?.items.lazy.compactMap({ ($0 as? NSSearchToolbarItem)?.searchField }).first else { return false }
        let pasteboard = NSPasteboard.general
        let saved = pasteboard.pasteboardItems?.map { item -> NSPasteboardItem in
            let copy = NSPasteboardItem()
            for type in item.types { if let data = item.data(forType: type) { copy.setData(data, forType: type) } }
            return copy
        } ?? []
        defer {
            pasteboard.clearContents()
            if !saved.isEmpty { pasteboard.writeObjects(saved) }
        }
        func press(_ key: String, _ code: UInt16) -> Bool {
            guard let event = NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: .command, timestamp: ProcessInfo.processInfo.systemUptime,
                                               windowNumber: main.window.windowNumber, context: nil, characters: key, charactersIgnoringModifiers: key,
                                               isARepeat: false, keyCode: code) else { return false }
            return NSApp.mainMenu?.performKeyEquivalent(with: event) == true
        }
        // SwiftUI syncs the field with Activity's search between steps, so each step waits for it.
        let settle = { try? await Task.sleep(for: .milliseconds(250)) }
        main.window.makeFirstResponder(field)
        await settle()
        field.currentEditor()?.insertText("pith smoke")
        await settle()
        field.currentEditor()?.selectAll(nil)
        let pressedCut = press("x", 7)
        await settle()
        let cut = pressedCut && field.stringValue.isEmpty && pasteboard.string(forType: .string) == "pith smoke"
        let pressedUndo = press("z", 6)
        await settle()
        let undone = pressedUndo && field.stringValue == "pith smoke"
        print("search cut=\(cut) undo=\(undone) field=\"\(field.stringValue)\"")
        field.currentEditor()?.selectAll(nil)
        field.currentEditor()?.delete(nil)
        main.state.activity.search = ""
        return cut && undone
    }

    /// Diagnostic budget: 20 seconds covers startup, scan and WebKit initialization.
    private static let patience: TimeInterval = 20

    /// Waits for a prerequisite; the run stops, naming what never happened.
    private func waitUntil(_ what: String, _ predicate: () -> Bool) async throws {
        guard await eventually(predicate) else { throw DiskFailure("Native UI diagnostic timed out waiting for \(what).") }
    }

    /// Waits for a checked outcome; a timeout is that check failing, not the whole run.
    private func eventually(_ predicate: () -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(Self.patience)
        while !predicate() {
            guard Date() < deadline, (try? await Task.sleep(for: .milliseconds(100))) != nil else { return false }
        }
        return true
    }

    private func firstView<T: NSView>(_ type: T.Type, in view: NSView) -> T? {
        if let match = view as? T { return match }
        return view.subviews.lazy.compactMap { self.firstView(type, in: $0) }.first
    }
}

/// The person's state that a run of Pith could change, read without changing anything: Pith's defaults as saved, and
/// when each file and folder Pith keeps for them last changed, their Activity history among them. Their scans are left
/// out: their own Pith keeps those current while it runs, and the smoke test keeps its own in a folder of its own.
struct PersistedState {
    /// Pith's defaults domain as saved.
    let defaults: NSDictionary
    /// When each file and folder last changed, by path.
    let changed: [String: Date]

    static func read() -> PersistedState {
        let files = FileManager.default
        let bundle = Bundle.main.bundleIdentifier ?? "app.bruhs.pith"
        let library = files.homeDirectoryForCurrentUser.appendingPathComponent("Library")
        let support = library.appendingPathComponent("Application Support/Pith"), scans = support.appendingPathComponent("Scans")
        var changed: [String: Date] = [:]
        func note(_ url: URL) {
            if let date = try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate { changed[url.path] = date }
        }
        for place in [support, library.appendingPathComponent("Caches/\(bundle)"), library.appendingPathComponent("HTTPStorages/\(bundle)"),
                      library.appendingPathComponent("WebKit/\(bundle)"), library.appendingPathComponent("Saved Application State/\(bundle).savedState")] {
            note(place)
            let items = files.enumerator(at: place, includingPropertiesForKeys: [.contentModificationDateKey])
            while let item = items?.nextObject() as? URL {
                if item.standardizedFileURL.path == scans.standardizedFileURL.path { items?.skipDescendants(); continue }
                note(item)
            }
        }
        return PersistedState(defaults: (UserDefaults.standard.persistentDomain(forName: bundle) ?? [:]) as NSDictionary, changed: changed)
    }

    /// What differs from `earlier`: each default whose value changed, came or went, and each file or folder that did.
    func differences(from earlier: PersistedState) -> [String] {
        let keys = Set((defaults.allKeys + earlier.defaults.allKeys).compactMap { $0 as? String })
        let settings = keys.filter { defaults[$0] as? NSObject != earlier.defaults[$0] as? NSObject }.map { "default \($0)" }
        let paths = Set(changed.keys).union(earlier.changed.keys).filter { changed[$0] != earlier.changed[$0] }.map { "file \($0)" }
        return (settings + paths).sorted()
    }
}
