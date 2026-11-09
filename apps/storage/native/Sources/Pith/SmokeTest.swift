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
        return [names[0]: first.drawn, names[1]: first.loaded == [false, false], names[2]: stopped > 0 && caughtUp && afterStopping.drawn,
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
        let deadline = Date().addingTimeInterval(Self.patience)
        while true {
            let base = (try? await web.callAsyncJavaScript("return window.pithIconBase ?? null", in: nil, contentWorld: .page)) as? String
            if wanted(base) || Date() >= deadline { return base }
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
