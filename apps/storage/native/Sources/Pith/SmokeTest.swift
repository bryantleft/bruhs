import AppKit
import SwiftUI
import WebKit
import PithCore

extension AppDelegate {
    /// Runs the real packaged renderer and scanner against a caller-supplied fixture.
    /// No Trash operation touches the person's Trash, and no system setting is changed by this diagnostic.
    func smokeTest(root: URL, report: URL) async {
        // A line at a time, so a run its caller stops still leaves what it printed.
        setvbuf(stdout, nil, _IOLBF, 0)
        // Each check's time, from the one before it, and what it found, printed as it lands, so a run shows where its time
        // goes, and one its caller stops still shows what it found. The report on disk holds every check as it lands too,
        // as a run that hasn't finished, so one its caller's alarm stops still leaves every result it had (`SmokeReport`).
        let began = ContinuousClock.now
        var lap = began
        let partial = SmokeReport(url: report)
        var checks: [String: Bool] = [:] {
            didSet {
                let now = ContinuousClock.now
                let found = checks.keys.filter { oldValue[$0] != checks[$0] }.sorted().map { "\($0) \(checks[$0] == true)" }
                print("took \(Self.seconds(lap.duration(to: now))) s: \(found.isEmpty ? "a check again, unchanged" : found.joined(separator: ", "))")
                lap = now
                partial.landed(checks)
            }
        }
        // The fixture's scans are kept in a folder of the smoke test's own, never the user's, and what it moves to the
        // Trash goes to another of its own, never the user's Trash. Both go when it ends.
        let scans = FileManager.default.temporaryDirectory.appendingPathComponent("pith-smoke-scans-\(UUID().uuidString)")
        let trash = FileManager.default.temporaryDirectory.appendingPathComponent("pith-smoke-trash-\(UUID().uuidString)")
        disk.scansFolder = scans
        disk.trashFolder = trash
        let forgetFolders = { for folder in [scans, trash] { _ = try? FileManager.default.removeItem(at: folder) } }
        // No smoke check opens System Settings: each pane Pith asks for is recorded instead.
        let panes = SystemSettingsAsked()
        openSystemSettings = { panes.asked.append($0) }
        checks["native_fonts_registered"] = BruhsFonts.isAvailable
        // The fallback symbol is a template image too, so the SVG itself has to decode.
        let glyph = Bundle.main.url(forResource: "StatusGlyph", withExtension: "svg").flatMap(NSImage.init(contentsOf:))
        checks["status_glyph_bundled"] = glyph?.isValid == true && statusItem?.image?.isTemplate == true
        // The licences of the work by others that Pith ships go with it: Heroicons' and Monaspace's, kept by hand, and those
        // the build writes from what it bundles: the page's npm packages, the scanner's crates and Sparkle, each by name.
        let notices = Bundle.main.url(forResource: "ThirdPartyNotices", withExtension: "txt").flatMap { try? String(contentsOf: $0, encoding: .utf8) }
        let shipped = ["react", "react-dom", "scheduler", "d3-hierarchy", "serde", "serde_json", "rayon", "rayon-core", "libc", "trash", "objc2", "Sparkle"]
        let named = shipped.filter { name in notices?.range(of: "\n\(name) [0-9]", options: .regularExpression) != nil }
        print("third-party notices: \(notices?.utf8.count ?? 0) bytes, naming \(named.count) of \(shipped.count) checked")
        checks["third_party_notices_bundled"] = notices?.contains("Copyright (c) Tailwind Labs, Inc.") == true
            && notices?.contains("SIL Open Font License, Version 1.1") == true && named == shipped
            && notices?.contains("Copyright (c) Meta Platforms, Inc. and affiliates.") == true && notices?.contains("Andy Matuschak") == true
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
            // macOS keeps the daily check's schedule for the app's bundle ID, the person's Pith's too, so an automated run
            // registers none.
            var dailyChecks = [disk.live?.schedulesDailyCheck]
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
            checks.merge(await checkNoGenericIcons(), uniquingKeysWith: { _, new in new })
            checks.merge(await checkMapMarks(), uniquingKeysWith: { _, new in new })
            // Before anything clicks the map, which would learn the hints.
            let hints = await learnHints(fixture)
            checks.merge(await checkSideLists(fixture), uniquingKeysWith: { _, new in new })
            checks.merge(await checkSideColumn(fixture, picture: report.deletingLastPathComponent().appendingPathComponent("side-column.png")),
                         uniquingKeysWith: { _, new in new })
            checks.merge(await checkPlaces(fixture, report: report, panes: panes), uniquingKeysWith: { _, new in new })
            checks.merge(await checkNotMeasured(fixture, report: report), uniquingKeysWith: { _, new in new })
            checks.merge(await checkRefreshedVolume(fixture), uniquingKeysWith: { _, new in new })
            checks.merge(await checkAskingNotice(panes), uniquingKeysWith: { _, new in new })
            checks.merge(await checkAccessHoldLifts(), uniquingKeysWith: { _, new in new })
            checks.merge(await checkIconsReachEveryPage(), uniquingKeysWith: { _, new in new })
            checks.merge(await checkIconRoute(fixture), uniquingKeysWith: { _, new in new })
            checks.merge(await checkPathBar(fixture, in: main), uniquingKeysWith: { _, new in new })
            checks.merge(await checkDiskMenuRetitlesWhileOpen(in: main), uniquingKeysWith: { _, new in new })
            checks.merge(await checkMapHoldsStill(fixture), uniquingKeysWith: { _, new in new })
            checks.merge(await checkOwnChangesShowAtOnce(fixture), uniquingKeysWith: { _, new in new })
            checks.merge(await checkCheckAgainShowsAtOnce(fixture), uniquingKeysWith: { _, new in new })
            // The selection bridge carries several items too, which ⌘-click picks and Pith keeps.
            let several = await checkSeveralSelected(fixture, picture: report.deletingLastPathComponent().appendingPathComponent("selection-bar.png"))
            checks["selection_bridge"] = checks["selection_bridge"] == true && several
            checks.merge(await checkSeveralTrashed(fixture), uniquingKeysWith: { _, new in new })
            checks.merge(await checkTrashHoldsThroughNewerMaps(fixture), uniquingKeysWith: { _, new in new })
            checks.merge(await checkEachUndoUndoesItsOwnMove(fixture), uniquingKeysWith: { _, new in new })
            checks.merge(await checkUndoMarksAScannedMapEdited(fixture), uniquingKeysWith: { _, new in new })
            checks.merge(await checkOpenedFolderDetail(fixture), uniquingKeysWith: { _, new in new })
            checks.merge(try await checkLiveFollows(disk, in: fixture, prefix: "live_map"), uniquingKeysWith: { _, new in new })
            checks.merge(try await checkLiveReopens(fixture, dailyChecks: &dailyChecks), uniquingKeysWith: { _, new in new })
            print("daily check registered with macOS's scheduler by the run's live maps: \(dailyChecks)")
            checks["left_the_daily_check_schedule_alone"] = dailyChecks.count == 2 && dailyChecks.allSatisfy { $0 == false }
            // Leaving the Disk tab keeps the map, so its open folder survives; closing the window frees WebKit.
            // An identity, not a reference: holding the view here would keep it alive past the window's close.
            let shown = webView.map(ObjectIdentifier.init)
            main.show(.activity)
            let hidden = await eventually { self.webView?.isHidden == true }
            checks["disk_kept_across_tabs"] = shown != nil && webView.map(ObjectIdentifier.init) == shown && hidden
            showDisk()
            main.window.performClose(nil)
            checks["disk_webview_released"] = await eventually { self.webView == nil }
            checks["main_window_released"] = mainWindow == nil
            // A new window's map, with a page of its own, still knows the hints learned in the last one.
            checks["hints_stay_learned_after_reopen"] = await hintsStayLearned(hints, fixture: fixture)
            let samples = activity.history.system.count
            checks["monitoring_survives_window_close"] = await eventually { !self.activity.paused && self.activity.history.system.count > samples }
            // Before the panel opens, which would count as watching again.
            checks["slower_when_unwatched"] = await samplesApart(ActivityModel.interval)
            statusItem?.togglePanel()
            checks["menu_panel_opens"] = statusItem?.panelWindow?.isVisible == true
            statusItem?.togglePanel()
            // Last, after everything the run did: the person's settings and the files Pith keeps for them, their history
            // among them, are as they were before it began. The person's own Pith, running meanwhile, saves its history
            // each minute, so while it runs what it writes is left out, and said to be. Their Scans folder holds no scan
            // memory for the fixture's root, which a run that kept its scans there would have left.
            let now = PersistedState.read()
            let found = stateAtLaunch.map { now.differences(from: $0) }
            let changes = found?.changes ?? ["nothing read at launch"]
            let others = Set((stateAtLaunch?.othersRunning ?? []) + now.othersRunning).sorted()
            if !others.isEmpty {
                print("another Pith runs (process \(others.map(String.init).joined(separator: ", "))), so its history and the folder that holds it are left out: "
                      + "\((found?.leftOut ?? []).isEmpty ? "neither changed" : "\(found?.leftOut ?? []) changed")")
            }
            let roots = Array(Set([root.path, fixture])).sorted()
            let memories = PersistedState.scanMemories(of: roots, in: PersistedState.personsScans)
            print("the person's state: \(changes.isEmpty ? "as it was" : "changed \(changes)"); their Scans folder holds "
                  + "\(memories.isEmpty ? "no scan memory for \(roots)" : "a scan memory for \(memories)")")
            checks["left_the_persons_state_alone"] = changes.isEmpty && memories.isEmpty
            // The report on disk held every check as it landed, as a run stopped now would leave it, before the finished
            // run's report is written over it.
            let landed = (try? Data(contentsOf: report)).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            checks["report_holds_every_check_as_it_lands"] = landed?["checks"] as? [String: Bool] == checks && landed?["error"] is String
            forgetFolders()
            let data = try JSONSerialization.data(withJSONObject: checks, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: report)
            print(String(decoding: data, as: UTF8.self))
            print("smoke test took \(Self.seconds(began.duration(to: .now))) s for \(checks.count) checks")
            if checks.values.contains(false) { exit(1) }
            NSApp.terminate(nil)
        } catch {
            forgetFolders()
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
        func steadyHeight() async throws -> Double? {
            var height = try await web.callAsyncJavaScript(mapHeight, in: nil, contentWorld: .page) as? Double
            for _ in 0..<50 {
                try await Task.sleep(for: .milliseconds(100))
                let again = try await web.callAsyncJavaScript(mapHeight, in: nil, contentWorld: .page) as? Double
                if let again, again > 0, again == height { break }
                height = again
            }
            return height
        }
        let before = try await steadyHeight()
        _ = try await web.callAsyncJavaScript("document.querySelector('aside button')?.click()", in: nil, contentWorld: .page)
        let selection = await eventually { !self.disk.selection.isEmpty }
        // The bundled scanner measures what deleting the selection frees, beside the scan's own runner.
        let frees = await eventually { self.disk.selectedFrees != nil }
        let after = try await steadyHeight()
        print("map height before selection=\(before ?? -1) after=\(after ?? -1)")
        let icon = await checkSelectionIcon()
        // Bigger Text zooms the map's page too. The step is undone, so the page is back at its usual zoom before anything
        // after measures it. The run keeps the step in memory, as it keeps every setting, never in the person's.
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

    /// Selects the fixture's sub folder, as a click does, since macOS can draw a folder unlike in light and dark where it
    /// draws a file's type alike, then switches the window to light and then to dark: for each, the bar under the map
    /// shows the folder's icon as the store draws it in that appearance, off the main thread, as the window's own pixels
    /// show, and not the drawing for the other appearance, where the two differ. The selection and the window's
    /// appearance are as they were after.
    private func checkSelectionIcon() async -> Bool {
        guard let window = mainWindow?.window, let root = disk.result?.root.path else { return false }
        let folder = (root as NSString).appendingPathComponent("sub"), selected = disk.selection.paths
        defer { disk.select(selected) }
        disk.select([folder])
        guard await eventually({ self.disk.selectedItems.map(\.path) == [folder] }), let item = disk.selectedItems.first else { return false }
        let key = disk.iconKey(for: item)
        let size = IconSize(points: 16, scale: window.backingScaleFactor)
        let chosen = window.appearance
        defer { window.appearance = chosen }
        let version = ProcessInfo.processInfo.operatingSystemVersion
        let macOS = "\(version.majorVersion).\(version.minorVersion).\(version.patchVersion)"
        let foldersAlike = AppearanceShown.macOSDrawsFoldersAlike()
        var verdicts: [IconAppearance: AppearanceShown] = [:], seen: [String] = []
        for appearance in IconAppearance.allCases {
            window.appearance = NSAppearance(named: appearance == .dark ? .darkAqua : .aqua)
            guard let own = await Icons.store.icon(for: IconRequest(key, size: size, appearance: appearance)),
                  let other = await Icons.store.icon(for: IconRequest(key, size: size, appearance: appearance == .dark ? .light : .dark)) else { continue }
            let alike = own.image.dataProvider?.data as Data? == other.image.dataProvider?.data as Data?
            var found: [Double] = []
            // Out of 255 a channel: the window's pixels and the store's drawing go through the same colour conversion, so
            // the drawing shown differs from them by rounding alone.
            let matches = await eventually {
                found = Self.cornerShows([own.image, other.image], in: window) ?? []
                return found.count == 2 && found[0] < 4 && (alike || found[0] + 0.5 < found[1])
            }
            verdicts[appearance] = AppearanceShown.judge(matches: matches, alike: alike, foldersAlike: foldersAlike)
            seen.append("\(appearance.rawValue) \(found.map { String(format: "%.1f", $0) })\(alike ? ", its drawings alike" : "")")
        }
        print("selection icon \(key.string): \(IconAppearance.allCases.map { "\($0.rawValue) \(verdicts[$0].map { "\($0)" } ?? "not drawn")" }); "
              + "differences from the drawing of each appearance and the other's \(seen)")
        if verdicts.values.contains(.notProvenHere) {
            print("selection icon: appearance not proven here: macOS \(macOS) draws the folder alike in light and dark, so the bar showing its "
                  + "drawing can't tell which appearance it follows")
        }
        return IconAppearance.allCases.allSatisfy { verdicts[$0] == .shown || verdicts[$0] == .notProvenHere }
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

    /// The map draws macOS's icons on itself and, with Differentiate Without Color on, each file kind's glyph. The
    /// fixture's sub folder shows its icon at the start of its label line, in the room the map keeps for it, drawn on
    /// the canvas from Pith's route. The setting reaches the page as macOS's notice of a display option change makes
    /// the coordinator read it again: Pith alone reads it turned the other way from this Mac's, so By kind shows its
    /// glyphs, or stops, and the map draws again; then it reads this Mac's own once more, and the page follows it back.
    /// Each notice is posted in Pith alone, and no system setting changes.
    private func checkMapMarks() async -> [String: Bool] {
        let names = ["map_shows_icons", "kind_glyphs_follow_differentiate_without_color"]
        guard let web = webView, let coordinator = web.navigationDelegate as? DiskWebView.Coordinator else {
            return Dictionary(uniqueKeysWithValues: names.map { ($0, false) })
        }
        let painted = try? await web.callAsyncJavaScript(Self.mapIcon, arguments: ["name": "sub"], in: nil, contentWorld: .page) as? Double

        let system = NSWorkspace.shared.accessibilityDisplayShouldDifferentiateWithoutColor
        let reads = DiskWebView.Coordinator.differentiateWithoutColor
        let changed = { NSWorkspace.shared.notificationCenter.post(name: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification, object: NSWorkspace.shared) }
        defer { DiskWebView.Coordinator.differentiateWithoutColor = reads; changed() }
        let before = await pageAnswer(web, Self.mapMarks) { (marks: [String: Int]?) in marks != nil }
        DiskWebView.Coordinator.differentiateWithoutColor = { !system }
        changed()
        let turned = await pageAnswer(web, Self.mapMarks) { (marks: [String: Int]?) in
            ((marks?["glyphs"] ?? 0) > 0) == !system && marks?["print"] != nil && marks?["print"] != before?["print"]
        }
        DiskWebView.Coordinator.differentiateWithoutColor = reads
        changed()
        let back = await pageAnswer(web, Self.mapMarks) { (marks: [String: Int]?) in
            ((marks?["glyphs"] ?? 0) > 0) == system && marks?["print"] != nil && marks?["print"] != turned?["print"]
        }
        let followed = before != nil && ((turned?["glyphs"] ?? 0) > 0) == !system && turned?["print"] != before?["print"]
            && ((back?["glyphs"] ?? 0) > 0) == system && back?["print"] != turned?["print"] && coordinator.differentiatesWithoutColor == system
        print("map icons: sub's icon painted \(painted.map { "\(Int($0 * 100))%" } ?? "nothing") of its slot; Differentiate Without Color \(system ? "on" : "off") here, "
              + "By kind's glyphs \(before?["glyphs"] ?? -1), turned \(turned?["glyphs"] ?? -1), back \(back?["glyphs"] ?? -1), and the map drew again \(followed)")
        return [names[0]: (painted ?? 0) >= 0.25, names[1]: followed]
    }

    /// How much of the 14 px square at the start of the label line of the open folder's item `name` its icon covers:
    /// the share of the canvas's own pixels there unlike the map's ground beside it, once that's a quarter or 3 s have
    /// passed. The item is found by selecting it in the map's list of items, and the selection is cleared after.
    private static let mapIcon = mapScript("""
        const box = await boxOf(name);
        if (!box) return null;
        const frame = canvas.getBoundingClientRect(), scale = canvas.width / frame.width;
        const context = canvas.getContext("2d");
        const read = (x, y, size) => context.getImageData(Math.round((box.left - frame.left + x) * scale),
          Math.round((box.top - frame.top + y) * scale), Math.max(1, Math.round(size * scale)), Math.max(1, Math.round(size * scale))).data;
        const covered = () => {
          const slot = read(4, 3, 14), ground = read(2, 10, 1);
          let unlike = 0;
          for (let i = 0; i < slot.length; i += 4) {
            if ([0, 1, 2, 3].some((channel) => Math.abs(slot[i + channel] - ground[channel]) > 24)) unlike += 1;
          }
          return unlike / (slot.length / 4);
        };
        await until(() => covered() >= 0.25);
        const share = covered();
        canvas.parentElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        return share;
        """)

    /// How many glyphs By kind shows, and a print of the map's pixels, which changes whenever the map draws anything else.
    private static let mapMarks = """
        const canvas = document.querySelector("canvas");
        const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        let print = 0;
        for (let i = 0; i < pixels.length; i += 4) print = (print * 31 + pixels[i] + 3 * pixels[i + 1] + 7 * pixels[i + 2] + 11 * pixels[i + 3]) | 0;
        return { glyphs: document.querySelectorAll('[aria-labelledby="kinds-heading"] svg').length, print };
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
        let listed = await liveMapShows { self.disk.result?.root.children?.contains { $0.path == locked.path && $0.kind == .unreadable } == true }
        let sub = (fixture as NSString).appendingPathComponent("sub"), app = "/System/Library/CoreServices/Finder.app"
        let kept = (writers: disk.writers, growth: disk.growth, since: disk.growthSince)
        disk.writers = { since in
            .apps([DiskWriter(name: "Finder", bytes: 3_000_000, bundle: app), DiskWriter(name: "pith-smoke-tool", bytes: 1_000_000)], since: since)
        }
        let grown: [String: Int64] = [sub: 2_000_000]
        let lists = await pageAnswer(web, Self.sideListIcons, arguments: ["grewKey": IconKey.item(sub).string, "appKey": IconKey.item(app).string]) {
            (lists: [String: Bool]?) in
            // A newer map compares itself with the baseline again, which drops a growth put in memory, so it's put back.
            if self.disk.growth != grown { self.disk.smokeTestShowsGrowth(grown, since: Date()) }
            return lists?["grew"] == true && lists?["wrote"] == true && lists?["unreadable"] == true
        }
        disk.writers = kept.writers
        disk.smokeTestShowsGrowth(kept.growth, since: kept.since)
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

    /// Places opens the side column at the live map's root and the home folder, from the table native makes for the
    /// startup disk's map, and the folders the map couldn't read show the apps they belong to. The smoke test gives the
    /// side column a table of known places of its own, whose home folder is inside the fixture, so both show through the
    /// same code while Pith looks at none of the person's folders and asks LaunchServices nothing: its Mail belongs to
    /// Finder, an app every Mac has.
    /// - Messages and Downloads, which nobody may read, show "Needs Full Disk Access" with their places' icons at the
    ///   fixture's root and the home folder, and Couldn't read leaves Downloads out there, since Places names it. The
    ///   section is gone further down.
    /// - Developer and Mail, under 1 GB, don't show. Each has the size the map shows once its folder is opened:
    ///   Developer's from its block, and Mail's, too small for a block of its own, from the live map's index.
    /// - Opened, Mail's Couldn't read row for a folder in it leads with its app's icon, Finder's. So does that folder's
    ///   row in Disk's list of the folders the map couldn't read, drawn as the notice's popover draws it, in a window of
    ///   its own off screen, beside the rows of Messages and Downloads with their places' icons.
    /// - A click on Downloads, which Pith can't read, asks for Full Disk Access in System Settings, as the notices'
    ///   buttons do, and leaves the map where it was. The pane is recorded in `panes`, not opened.
    private func checkPlaces(_ fixture: String, report: URL, panes: SystemSettingsAsked) async -> [String: Bool] {
        let names = ["places_show_at_the_root_and_home", "places_have_the_maps_sizes", "couldnt_read_shows_owner_icons",
                     "unreadable_list_shows_owner_icons", "unreadable_places_open_full_disk_access"]
        let files = FileManager.default, mark = UUID().uuidString.prefix(8).lowercased()
        let home = (fixture as NSString).appendingPathComponent("pith-smoke-home-\(mark)")
        let library = (home as NSString).appendingPathComponent("Library"), downloads = (home as NSString).appendingPathComponent("Downloads")
        let mail = (library as NSString).appendingPathComponent("Mail"), developer = (library as NSString).appendingPathComponent("Developer")
        let messages = (library as NSString).appendingPathComponent("Messages"), inMail = (mail as NSString).appendingPathComponent("V10")
        let finder = "/System/Library/CoreServices/Finder.app"
        let locked = [messages, downloads, inMail]
        let kept = disk.sideColumn.places
        let cleanUp = {
            self.disk.sideColumn.places = kept
            // Readable again first: a folder nobody may list can't be emptied to remove.
            for folder in locked { try? files.setAttributes([.posixPermissions: 0o755], ofItemAtPath: folder) }
            try? files.removeItem(atPath: home)
        }
        defer { cleanUp() }
        let made = (try? files.createDirectory(atPath: developer, withIntermediateDirectories: true)) != nil
            && files.createFile(atPath: (developer as NSString).appendingPathComponent("tool.bin"), contents: Data(count: 1 << 20))
            && (try? files.createDirectory(atPath: mail, withIntermediateDirectories: false)) != nil
            && locked.allSatisfy { (try? files.createDirectory(atPath: $0, withIntermediateDirectories: false, attributes: [.posixPermissions: 0])) != nil }
        disk.sideColumn.places = KnownPlaces(home: URL(fileURLWithPath: home), searchPaths: [.downloadsDirectory: URL(fileURLWithPath: downloads)]) {
            $0 == "com.apple.mail" ? URL(fileURLWithPath: finder) : nil
        }
        func place(_ id: String) -> PlacesTable.Place? { disk.placesTable?.places.first { $0.id == id } }
        guard made, let web = webView, await liveMapShows({
            place("messages") != nil && place("downloads") != nil && place("developer")?.size != nil && place("mail")?.size != nil
        }) else {
            return Dictionary(uniqueKeysWithValues: names.map { ($0, false) })
        }
        let unreadable = place("messages")?.size == nil && place("downloads")?.size == nil
        let sized = (developer: place("developer")?.size, mail: place("mail")?.size)
        func showsTheUnreadable(_ rows: [[String: Any]]?) -> Bool {
            guard let rows, rows.count == 2 else { return false }
            return zip(rows, [("Messages", messages, "messages"), ("Downloads", downloads, "downloads")]).allSatisfy { row, wanted in
                (row["text"] as? String)?.contains(wanted.0) == true && (row["text"] as? String)?.contains("Needs Full Disk Access") == true
                    && row["title"] as? String == wanted.1 && (row["icon"] as? String)?.hasSuffix("/place/\(wanted.2).png") == true
            }
        }
        let atRoot = await pageAnswer(web, Self.placeRows) { showsTheUnreadable($0) }
        let askedBefore = panes.asked.count
        let clicked = try? await web.callAsyncJavaScript(Self.clickPlace, arguments: ["path": downloads], in: nil, contentWorld: .page) as? Bool
        let askedForAccess = await eventually { panes.asked.count > askedBefore } && panes.asked.last == .fullDiskAccess
        // Long enough for a folder it opened to have reached the native side.
        try? await Task.sleep(for: .milliseconds(300))
        let stayed = disk.openFolder == fixture
        disk.pageCommand?(.open(home))
        let atHome = await eventually { self.disk.openFolder == home } ? await pageAnswer(web, Self.placeRows) { showsTheUnreadable($0) } : nil
        // Downloads is named once, in Places: the home folder has nothing else it couldn't read.
        let namedOnce = await pageAnswer(web, "return document.getElementById('unreadable-heading') === null") { (none: Bool?) in none == true } == true
        disk.pageCommand?(.open(developer))
        let inDeveloper = await eventually { self.disk.openFolder == developer }
        let gone = await pageAnswer(web, "return document.getElementById('places-heading') === null") { (gone: Bool?) in gone == true } == true
        let developerShown = disk.result?.root.folder(at: developer)?.size
        // Too small for a block at the root, it opens once the live map sends its folder in detail.
        disk.pageCommand?(.open(mail))
        let inMailFolder = await eventually { self.disk.openFolder == mail }
        let mailShown = disk.result?.root.folder(at: mail)?.size
        // The row shows the rule's plain folder until the owners, found off the main thread, reach the page.
        let ownersIcon = "/" + IconKey.item(finder).string + ".png"
        let ownerIcon = await pageAnswer(web, Self.unreadableRowIcon, arguments: ["path": inMail]) { (src: String?) in src?.hasSuffix(ownersIcon) == true }
        let owned = ownerIcon?.hasSuffix(ownersIcon) == true
        let list = await checkUnreadableList([inMail: .item(finder), messages: .place("messages"), downloads: .place("downloads")],
                                             saving: report.deletingLastPathComponent().appendingPathComponent("unreadable-list.png"))
        disk.pageCommand?(.open(fixture))
        let back = await eventually { self.disk.openFolder == fixture }
        cleanUp()
        let cleared = await liveMapShows { self.disk.result?.root.children?.contains { $0.path == home } != true }
        let settled = await mapSettles()
        print("places: Messages and Downloads \(unreadable ? "can't be read" : "have sizes"), shown at the root \(showsTheUnreadable(atRoot)) and at home "
              + "\(showsTheUnreadable(atHome)), Downloads named once \(namedOnce), gone further down \(gone); Developer "
              + "\(sized.developer.map(String.init) ?? "none") against the map's \(developerShown.map(String.init) ?? "none"), Mail "
              + "\(sized.mail.map(String.init) ?? "none") against \(mailShown.map(String.init) ?? "none"); V10's Couldn't read icon \(ownerIcon ?? "none"); "
              + "Downloads clicked \(clicked == true), asked for \(panes.asked.last?.url?.absoluteString ?? "no pane") \(askedForAccess), the map stayed \(stayed)")
        return [names[0]: unreadable && showsTheUnreadable(atRoot) && showsTheUnreadable(atHome) && namedOnce && inDeveloper && gone && back
                    && cleared && settled,
                names[1]: (sized.developer ?? 0) >= 1 << 20 && sized.developer == developerShown && inMailFolder && sized.mail != nil
                    && sized.mail == mailShown,
                names[2]: inMailFolder && owned,
                names[3]: list,
                names[4]: clicked == true && askedForAccess && stayed]
    }

    /// Clicks the Places row of the place at `path`: whether there was one.
    private static let clickPlace = """
        const button = [...document.querySelectorAll('[aria-labelledby="places-heading"] li button')].find((button) => button.title === path);
        button?.click();
        return button !== undefined;
        """

    /// The rows of Places: each one's text and tooltip, and its icon once it has loaded, decorative.
    private static let placeRows = """
        return [...document.querySelectorAll('[aria-labelledby="places-heading"] li')].map((row) => {
          const icon = row.querySelector("img");
          return { text: row.innerText, title: row.querySelector("button")?.title ?? null,
            icon: icon !== null && icon.complete && icon.naturalWidth > 0 && icon.alt === "" ? icon.src : null };
        });
        """

    /// The icon of `path`'s Couldn't read row, once it has loaded, decorative: its URL, or null.
    private static let unreadableRowIcon = """
        const row = [...document.querySelectorAll('[aria-labelledby="unreadable-heading"] li')].find((row) => row.title === path);
        const icon = row?.querySelector("img") ?? null;
        return icon !== null && icon.complete && icon.naturalWidth > 0 && icon.alt === "" ? icon.src : null;
        """

    /// Disk's list of the folders the map couldn't read, the one its notice opens, leads each row with the icon of what the
    /// folder belongs to (`keys`). The list is drawn as the popover draws it, in a borderless window of its own off screen,
    /// in the appearance the main window doesn't have, so its icons are drawn for it alone: the page draws in the main
    /// window's. Each row's icon is in the icon store for the list's size and appearance, and the list's own pixels show
    /// an icon at the start of each row, which a picture of it saved at `saving` shows too.
    private func checkUnreadableList(_ keys: [String: IconKey], saving: URL) async -> Bool {
        guard let main = mainWindow?.window else { return false }
        let folders = keys.keys.sorted().map { DiskUnreadableFolder(path: $0, reason: .denied) }
        let named = folders.allSatisfy { disk.ownerKey(for: $0.path) == keys[$0.path] }
        let appearance: IconAppearance = IconAppearance(main.effectiveAppearance) == .dark ? .light : .dark
        let host = NSHostingView(rootView: UnreadableList(model: disk, folders: folders, total: UInt64(folders.count)))
        let window = NSWindow(contentRect: NSRect(x: -8000, y: -8000, width: 460, height: 200), styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.appearance = NSAppearance(named: appearance == .dark ? .darkAqua : .aqua)
        window.contentView = host
        window.orderFrontRegardless()
        defer { window.orderOut(nil); window.contentView = nil }
        let size = IconSize(points: 16, scale: window.backingScaleFactor)
        let drawn = await eventually { keys.values.allSatisfy { Icons.store.cachedIcon(for: IconRequest($0, size: size, appearance: appearance)) != nil } }
        // The rows show their icons once the store's drawings reach them.
        var icons = 0
        _ = await eventually {
            guard let picture = host.bitmapImageRepForCachingDisplay(in: host.bounds) else { return false }
            host.cacheDisplay(in: host.bounds, to: picture)
            icons = Self.iconsAtTheStartOfRows(picture, width: host.bounds.width)
            try? picture.representation(using: .png, properties: [:])?.write(to: saving)
            return icons == folders.count
        }
        print("unreadable list: \(folders.count) rows keyed \(named ? "by their owners" : "otherwise"), drawn in \(appearance.rawValue) \(drawn), "
              + "\(icons) icons painted, saved to \(saving.path)")
        return named && drawn && icons == folders.count
    }

    /// How many icons a picture of the unreadable list shows at the start of its rows. Each is a run of pixel rows,
    /// 10 to 20 pt tall, in which much of the 16 pt column after the list's 16 pt margin is unlike the list's own ground,
    /// read in that margin, bridging gaps of up to 2 pt where an icon's own light parts come close to the ground. At
    /// least one of its rows is painted all the way across, which the title's letters there never are.
    private static func iconsAtTheStartOfRows(_ picture: NSBitmapImageRep, width: CGFloat) -> Int {
        let scale = CGFloat(picture.pixelsWide) / width
        guard let ground = picture.colorAt(x: Int(4 * scale), y: Int(4 * scale))?.usingColorSpace(.deviceRGB) else { return 0 }
        func unlike(_ x: Int, _ y: Int) -> Bool {
            guard let color = picture.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else { return false }
            return max(abs(color.redComponent - ground.redComponent), abs(color.greenComponent - ground.greenComponent),
                       abs(color.blueComponent - ground.blueComponent), abs(color.alphaComponent - ground.alphaComponent)) > 0.05
        }
        let columns = Int(17 * scale)..<Int(31 * scale)
        let shares = (0..<picture.pixelsHigh).map { y in Double(columns.filter { unlike($0, y) }.count) / Double(columns.count) }
        var icons = 0, start: Int?, gap = 0, densest = 0.0
        for (y, share) in (shares + [0]).enumerated() {
            if share >= 0.35 {
                if start == nil { start = y; densest = 0 }
                gap = 0
                densest = max(densest, share)
            } else if let begun = start {
                gap += 1
                guard gap > Int(2 * scale) || y == shares.count else { continue }
                if (Int(10 * scale)...Int(20 * scale)).contains(y - gap - begun + 1), densest >= 0.95 { icons += 1 }
                start = nil; gap = 0
            }
        }
        return icons
    }

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
            self.disk.choices.allSatisfy { Icons.store.cachedIcon(for: self.disk.menuIconRequest($0.url.path, appearance: appearance, scale: scale)) != nil }
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

    /// The disk menu retitles its disks in place while it's open. The path bar's disk part is clicked as the person
    /// clicks it, through the app's event queue, and while the menu tracks, a listing of the volumes lands with figures of
    /// the smoke test's own, 7 GB more free on the first disk, as one begun as it opened does. A timer in the run loop's
    /// common modes, which run while a menu tracks, though the main queue may not, reads the open menu's first item and
    /// closes the menu once it shows them, or once the smoke test's patience runs out. The real listing comes back after.
    private func checkDiskMenuRetitlesWhileOpen(in main: MainWindowController) async -> [String: Bool] {
        let name = "disk_menu_retitles_while_open"
        guard let volume = disk.choices.first, let available = volume.available, let content = main.window.contentView,
              let anchor = firstView(DiskMenuAnchor.self, in: content) else { return [name: false] }
        let fresher = available + 7_000_000_000
        let fresh = DiskVolumeChoice(url: volume.url, name: volume.name, total: volume.total, available: fresher, isStartup: volume.isStartup)
        let expected = volume.name + "\tFree " + bytes(fresher)
        let watch = OpenMenuWatch(until: Date().addingTimeInterval(Self.patience))
        let center = NotificationCenter.default
        // Posted as the menu begins and ends tracking, on the main thread, while it tracks.
        let began = center.addObserver(forName: NSMenu.didBeginTrackingNotification, object: nil, queue: nil) { [weak self] note in
            let sender = (note.object as AnyObject?).map(ObjectIdentifier.init)
            MainActor.assumeIsolated {
                guard let self, let menu = anchor.opened?.menu, sender == ObjectIdentifier(menu), watch.menu == nil else { return }
                watch.menu = menu
                watch.item = menu.items.first
                watch.opened = menu.items.first?.title
                self.disk.smokeTestListsVolumes([fresh] + self.disk.choices.dropFirst())
                self.disk.refreshChoices()
            }
        }
        let ended = center.addObserver(forName: NSMenu.didEndTrackingNotification, object: nil, queue: nil) { note in
            let sender = (note.object as AnyObject?).map(ObjectIdentifier.init)
            MainActor.assumeIsolated { if let menu = watch.menu, sender == ObjectIdentifier(menu) { watch.closed = true } }
        }
        let reader = Timer(timeInterval: 0.05, repeats: true) { _ in
            MainActor.assumeIsolated {
                guard let menu = watch.menu, !watch.closed else { return }
                if let item = menu.items.first, item === watch.item, item.title == expected { watch.retitled = true }
                if watch.retitled || Date() > watch.until { menu.cancelTracking() }
            }
        }
        RunLoop.main.add(reader, forMode: .common)
        defer {
            reader.invalidate()
            center.removeObserver(began)
            center.removeObserver(ended)
            disk.smokeTestListsVolumes(nil)
        }
        let key = await eventually { main.window.isKeyWindow }
        Self.clickThroughTheQueue(at: anchor.convert(NSPoint(x: anchor.bounds.midX, y: anchor.bounds.midY), to: nil), in: main.window)
        let closed = await eventually { watch.closed }
        disk.smokeTestListsVolumes(nil)
        disk.refreshChoices()
        let back = await eventually { self.disk.choices.first?.available != fresher }
        let opened = watch.opened.map { $0.hasPrefix(volume.name + "\tFree ") && $0 != expected } == true
        print("disk menu: the window key \(key); opened from the path bar \(watch.menu != nil), first saying \((watch.opened ?? "nothing").replacingOccurrences(of: "\t", with: " ")); "
              + "retitled while open \(watch.retitled), then closed \(closed); the real listing back \(back)")
        return [name: key && opened && watch.retitled && closed && back]
    }

    /// A click at `point` in `window` as the person's comes: its press and release wait in the app's event queue, so
    /// AppKit hands them out from its run loop, as it does a click, not from the task that makes them.
    private static func clickThroughTheQueue(at point: NSPoint, in window: NSWindow) {
        for type in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
            guard let event = NSEvent.mouseEvent(with: type, location: point, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,
                                                 windowNumber: window.windowNumber, context: nil, eventNumber: 0, clickCount: 1,
                                                 pressure: type == .leftMouseDown ? 1 : 0) else { return }
            NSApp.postEvent(event, atStart: false)
        }
    }

    /// The live map holds still. A double-click opens the folder its first click was aimed at, though a newer map
    /// arrives between its clicks and puts another folder there. The check makes two folders of its own in the
    /// fixture, so it needs nothing else of it, and both maps from the live one: in the first, the aimed-at folder is
    /// as big as everything else, so it has a large block; in the newer one it's a byte and the other folder a
    /// thousand times everything else, so that one covers the map. The page holds what it showed while a second click
    /// can still come and the hover card is open, and draws nothing meanwhile. As a control, the newer map shown before
    /// the clicks sends the same double-click into the other folder. Then, with the folders gone, a map sent again, or
    /// with a file a byte bigger, draws nothing either, while one that changes visibly draws.
    private func checkMapHoldsStill(_ fixture: String) async -> [String: Bool] {
        let names = ["double_click_opens_the_folder_clicked", "map_draws_nothing_when_nothing_shows"]
        let files = FileManager.default, mark = UUID().uuidString
        let aimed = (fixture as NSString).appendingPathComponent("pith-smoke-aimed-\(mark)")
        let covering = (fixture as NSString).appendingPathComponent("pith-smoke-covering-\(mark)")
        let folders = [aimed, covering]
        func listed(_ path: String) -> Bool { disk.result?.root.children?.contains { $0.path == path } == true }
        defer { for folder in folders { try? files.removeItem(atPath: folder) } }
        // A folder needs something in it for the map to list it.
        let made = folders.allSatisfy { folder in
            (try? files.createDirectory(atPath: folder, withIntermediateDirectories: false)) != nil
                && files.createFile(atPath: (folder as NSString).appendingPathComponent("item.bin"), contents: Data(count: 4096))
        }
        guard let web = webView, made, await liveMapShows({ folders.allSatisfy(listed) }), disk.openFolder == fixture, await mapSettles(),
              let payload = disk.resultJSON else {
            return Dictionary(uniqueKeysWithValues: names.map { ($0, false) })
        }
        // Each run starts once the live map has answered for the folder opened last, whose map would replace the ones
        // the run sends.
        func doubleClick(between: Bool, at point: Any = NSNull()) async -> [String: Any]? {
            guard await mapSettles() else { return nil }
            return try? await web.callAsyncJavaScript(Self.doubleClickAcross, arguments: ["payload": payload, "aimed": aimed, "covering": covering,
                                                                                    "between": between, "point": point], in: nil, contentWorld: .page) as? [String: Any]
        }
        let held = await doubleClick(between: true)
        let openedAimed = await eventually { self.disk.openFolder == aimed }
        disk.pageCommand?(.open(fixture))
        let backFromAimed = await eventually { self.disk.openFolder == fixture }
        let point = held?["point"] as? [String: Double]
        var control: [String: Any]?
        if let point { control = await doubleClick(between: false, at: point) }
        let openedCovering = await eventually { self.disk.openFolder == covering }
        let landed = disk.openFolder ?? "nowhere"
        disk.pageCommand?(.open(fixture))
        let backFromCovering = await eventually { self.disk.openFolder == fixture }
        let heldDraws = held?["drawnBetween"] as? Int, controlDraws = control?["drawnBefore"] as? Int
        print("double-click at \(point.map { "\($0)" } ?? "no point") across a newer map: drew \(heldDraws ?? -1) times between the clicks, "
              + "opened the folder aimed at \(openedAimed); with that map shown before the clicks it drew \(controlDraws ?? -1) times and opened "
              + "\((landed as NSString).lastPathComponent)")

        for folder in folders { try? files.removeItem(atPath: folder) }
        let gone = await liveMapShows { !folders.contains(where: listed) }
        var draws: [String: Int]?
        if gone, await mapSettles(), let pristine = disk.resultJSON {
            draws = try? await web.callAsyncJavaScript(Self.unchangedMaps, arguments: ["payload": pristine], in: nil, contentWorld: .page) as? [String: Int]
        }
        // The live map's own map again, for whatever comes next.
        disk.revision = UUID()
        print("draws for the same map \(draws?["same"] ?? -1), a file a byte bigger \(draws?["byte"] ?? -1), visibly changed \(draws?["visible"] ?? -1)")
        return [names[0]: heldDraws == 0 && openedAimed && backFromAimed && (controlDraws ?? 0) > 0 && openedCovering && backFromCovering,
                names[1]: gone && draws?["same"] == 0 && draws?["byte"] == 0 && (draws?["visible"] ?? 0) > 0]
    }

    /// The person's own changes show at once, though the pointer rests on the map and holds a newer map from the live
    /// map still: Command-Delete takes the block under the pointer off the map, and Undo puts it back. The item is a
    /// file of the check's own. Move to Trash puts it in the run's own folder, as it does in any automated run, never
    /// in the person's Trash, and Undo moves it back from there.
    private func checkOwnChangesShowAtOnce(_ fixture: String) async -> [String: Bool] {
        let names = ["trash_leaves_the_map_at_once", "undo_returns_to_the_map_at_once"]
        let files = FileManager.default
        // Short enough for the hover card to name it whole.
        let name = "pith-\(UUID().uuidString.prefix(8).lowercased()).bin"
        let item = (fixture as NSString).appendingPathComponent(name)
        var inTrash: URL?
        func listed() -> Bool { disk.result?.root.children?.contains { $0.path == item } == true }
        defer {
            try? files.removeItem(atPath: item)
            if let inTrash { try? files.removeItem(at: inTrash) }
            disk.dismissTrashNote()
        }
        // 1 MiB, the least the live map lists by name (`BIG_FILE`), so the item has a block of its own.
        guard files.createFile(atPath: item, contents: Data(count: 1 << 20)), let web = webView, await liveMapShows(listed), await mapSettles(),
              let payload = disk.resultJSON else {
            return Dictionary(uniqueKeysWithValues: names.map { ($0, false) })
        }
        let trash = try? await web.callAsyncJavaScript(Self.trashUnderPointer, arguments: ["payload": payload, "name": name], in: nil,
                                                       contentWorld: .page) as? [String: Any]
        inTrash = disk.trashed?.moves.first?.trashed
        // Into the run's own folder, not the person's Trash.
        let own = disk.trashFolder.map { folder in inTrash?.path.hasPrefix(folder.path + "/") == true } ?? false
        let after = trash?["after"] as? Double
        let left = trash?["named"] as? Bool == true && trash?["waited"] as? Bool == true && trash?["left"] as? Bool == true
            && (after ?? .infinity) < 1000 && own && !files.fileExists(atPath: item)
        print("Command-Delete under the pointer: the card named the item \(trash?["named"] as? Bool == true), a newer map waited "
              + "\(trash?["waited"] as? Bool == true), the item went to the run's own folder \(own), and its block left "
              + "\(after.map { "\(Int($0)) ms" } ?? "never") after the key")

        // Undo as the Edit menu does it, through the undo manager the move registered with.
        let undo = web.window?.undoManager
        let action = undo?.undoActionName ?? ""
        var back = false
        if let at = trash?["at"] {
            let rest = try? await web.callAsyncJavaScript(Self.restAgain, arguments: ["payload": payload, "name": name, "at": at], in: nil,
                                                          contentWorld: .page) as? [String: Any]
            undo?.undo()
            let named = try? await web.callAsyncJavaScript(Self.cardNames, arguments: ["name": name], in: nil, contentWorld: .page) as? [String: Any]
            let restored = await eventually { files.fileExists(atPath: item) }
            if restored { inTrash = nil }
            let took = named?["after"] as? Double
            back = action == "Move to Trash" && rest?["resting"] as? Bool == true && rest?["waited"] as? Bool == true
                && named?["named"] as? Bool == true && (took ?? .infinity) < 1000 && restored
            print("Undo (\(action)) with the pointer resting \(rest?["resting"] as? Bool == true) and a newer map waiting "
                  + "\(rest?["waited"] as? Bool == true): the item came back \(restored), its block under the pointer \(took.map { "\(Int($0)) ms" } ?? "never") after")
        }
        try? files.removeItem(atPath: item)
        let gone = await liveMapShows { !listed() }
        let settled = await mapSettles()
        // The live map's own map again, for whatever comes next.
        disk.revision = UUID()
        return [names[0]: left, names[1]: back && gone && settled]
    }

    /// A folder opened with a double-click shows its finer tree at once, though the pointer stays on the map. The live
    /// map lists a folder's small parts one by one only in the open folder's finer tree: the coarser tree of the map
    /// around it folds together what's under a 20,000th of the map, and at least 4 KiB. So the check makes a folder of
    /// its own, with a 2 MiB file and six parts of 4 KiB, and 100 MiB beside it, which takes the map's threshold past
    /// 4 KiB.
    private func checkOpenedFolderDetail(_ fixture: String) async -> [String: Bool] {
        let check = "opened_folder_shows_its_detail_at_once"
        let files = FileManager.default, mark = UUID().uuidString.prefix(8).lowercased()
        let heavy = (fixture as NSString).appendingPathComponent("pith-heavy-\(mark)")
        let folder = (fixture as NSString).appendingPathComponent("pith-parts-\(mark)")
        let parts = 6
        func listed(_ path: String) -> Bool { disk.result?.root.children?.contains { $0.path == path } == true }
        defer { for made in [heavy, folder] { try? files.removeItem(atPath: made) } }
        var made = (try? files.createDirectory(atPath: heavy, withIntermediateDirectories: false)) != nil
            && (try? files.createDirectory(atPath: folder, withIntermediateDirectories: false)) != nil
            && files.createFile(atPath: (folder as NSString).appendingPathComponent("big.bin"), contents: Data(count: 2 << 20))
        for part in 1...parts where made {
            let path = (folder as NSString).appendingPathComponent("part-\(part)")
            made = (try? files.createDirectory(atPath: path, withIntermediateDirectories: false)) != nil
                && files.createFile(atPath: (path as NSString).appendingPathComponent("item.bin"), contents: Data(count: 4096))
        }
        if made { made = Self.fill((heavy as NSString).appendingPathComponent("fill.bin"), mebibytes: 100) }
        // The map around the folder has its 2 MiB file and a group of the parts.
        func folded() -> Bool { disk.result?.item(at: folder)?.children?.count == 2 }
        guard made, let web = webView, await liveMapShows({ listed(heavy) && folded() }), await mapSettles() else { return [check: false] }
        let answer = try? await web.callAsyncJavaScript(Self.openAndWatch, arguments: ["name": (folder as NSString).lastPathComponent, "path": folder,
                                                                                     "items": parts + 1], in: nil, contentWorld: .page) as? [String: Any]
        let opened = await eventually { self.disk.openFolder == folder }
        disk.pageCommand?(.open(fixture))
        let back = await eventually { self.disk.openFolder == fixture }
        for made in [heavy, folder] { try? files.removeItem(atPath: made) }
        let gone = await liveMapShows { !listed(heavy) && !listed(folder) }
        let settled = await mapSettles()
        let coarse = answer?["coarse"] as? Bool == true, received = answer?["received"] as? Double, drawn = answer?["drawn"] as? Double
        print("double-click opened the folder \(opened) and drew it at once \(coarse); its finer tree came "
              + "\(received.map { "\(Int($0)) ms" } ?? "never") after, and drew \(drawn.map { "\(Int($0)) ms" } ?? "never") after that")
        return [check: opened && coarse && (received ?? .infinity) < 1500 && (drawn ?? .infinity) < 250 && back && gone && settled]
    }

    /// Double-clicks the map with the newer map, in which `aimed` is a byte and `covering` a thousand times everything
    /// else, arriving between the clicks, or shown before them. Between the clicks, the first map, with `aimed` as big
    /// as everything else, shows first, and the click is at the middle of `aimed`'s block; before them, the click is at
    /// `point`. Returns that point, and how often the map drew once the map before the clicks showed and between the
    /// clicks, or null when the page didn't take a map.
    private static let doubleClickAcross = mapScript("""
        // The live map with the given folders at the given sizes, everything in each alike.
        const mapWith = (sizes) => {
          const map = JSON.parse(payload);
          for (const child of map.root.children) {
            const bytes = sizes[child.path];
            if (bytes === undefined) continue;
            const factor = child.size > 0 ? bytes / child.size : 0;
            const scale = (node) => {
              node.size = Math.max(1, Math.round(node.size * factor));
              for (const inner of node.children ?? []) scale(inner);
            };
            scale(child);
            child.size = bytes;
          }
          map.root.size = map.root.children.reduce((sum, child) => sum + child.size, 0);
          return JSON.stringify(map);
        };
        const rest = JSON.parse(payload).root.size;
        const first = mapWith({ [aimed]: rest, [covering]: Math.round(rest / 2) });
        const newer = mapWith({ [aimed]: 1, [covering]: rest * 1000 });
        // Shows `map` once the page has it, and has drawn it when `drawn` is true.
        const show = async (map, drawn) => {
          const label = canvas.getAttribute("aria-label"), before = draws.length;
          window.pithReceive(map);
          const taken = await until(() => canvas.getAttribute("aria-label") !== label && (!drawn || draws.length > before));
          await pause(250);
          return taken;
        };
        leave();
        await pause(100);
        let at = point;
        if (between) {
          if (!(await show(first, true))) return null;
          at = await blockOf(aimed.slice(aimed.lastIndexOf("/") + 1));
          if (!at) return null;
        } else if (!(await show(newer, true))) {
          return null;
        }
        const drawnBefore = draws.length;
        mouse("mousemove", at);
        await pause(100);
        click(at, 1);
        if (between && !(await show(newer, false))) return null;
        const drawnBetween = draws.length - drawnBefore;
        click(at, 2);
        mouse("dblclick", at, 2);
        leave();
        return { point: at, drawnBefore, drawnBetween };
        """)

    /// How often the map draws, with nothing holding it, for the live map sent again, with its first file a byte bigger,
    /// and with that file four times the size, each folder holding it growing with it.
    private static let unchangedMaps = mapScript("""
        leave();
        await pause(100);
        const send = async (map) => {
          const before = draws.length;
          window.pithReceive(JSON.stringify(map));
          await pause(300);
          return draws.length - before;
        };
        // The first file the map lists, and the folders down to it.
        const fileIn = (node) => {
          if (node.kind === "file") return [node];
          for (const child of node.children ?? []) {
            const found = fileIn(child);
            if (found) return [node, ...found];
          }
          return null;
        };
        const grown = (bytes) => {
          const map = JSON.parse(payload);
          const chain = fileIn(map.root) ?? [];
          const by = bytes(chain.at(-1).size);
          for (const node of chain) node.size += by;
          return map;
        };
        if (fileIn(JSON.parse(payload).root) === null) return null;
        const same = await send(JSON.parse(payload));
        const byte = await send(grown(() => 1));
        const visible = await send(grown((size) => 3 * size));
        return { same, byte, visible };
        """)

    /// Rests the pointer on the block of the open folder's item `name` and clicks it, then sends a newer map with the
    /// item four times its size, which must wait, and presses Command-Delete on the map, which moves the item to the
    /// Trash. Says where the block was, whether the card named it, whether the newer map waited, and whether, and how
    /// many milliseconds after the key, the map drew without the item's block under the pointer.
    private static let trashUnderPointer = mapScript("""
        const at = await blockOf(name);
        if (!at) return null;
        leave();
        await pause(100);
        mouse("mousemove", at);
        await pause(100);
        const named = card().includes(name);
        click(at, 1);
        await pause(100);
        const newer = JSON.parse(payload);
        const item = newer.root.children.find((child) => child.name === name);
        newer.root.size += 3 * item.size;
        item.size *= 4;
        const before = draws.length;
        window.pithReceive(JSON.stringify(newer));
        await pause(300);
        const waited = draws.length === before && card().includes(name);
        const pressed = performance.now();
        canvas.parentElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", code: "Backspace", metaKey: true, bubbles: true, cancelable: true }));
        const left = await until(() => draws.length > before && !card().includes(name));
        return { at, named, waited, left, after: performance.now() - pressed };
        """)

    /// Rests the pointer at `at` again, on whatever block is there now, which holds the map afresh, then sends a newer
    /// map without the item `name` and with the largest of the rest three times its size, which must wait. Says whether
    /// the card opened and the newer map waited.
    private static let restAgain = mapScript("""
        leave();
        await pause(100);
        mouse("mousemove", at);
        await pause(100);
        const resting = card() !== "";
        const newer = JSON.parse(payload);
        newer.root.children = newer.root.children.filter((child) => child.name !== name);
        const largest = newer.root.children.reduce((most, child) => (child.size > most.size ? child : most));
        largest.size *= 3;
        newer.root.size = newer.root.children.reduce((sum, child) => sum + child.size, 0);
        const before = draws.length;
        window.pithReceive(JSON.stringify(newer));
        await pause(300);
        return { resting, waited: draws.length === before };
        """)

    /// Whether the hover card names `name` within 3 s, and how many milliseconds that took: the card names the block
    /// under the pointer in the map drawn.
    private static let cardNames = mapScript("""
        const start = performance.now();
        const named = await until(() => card().includes(name));
        return { named, after: performance.now() - start };
        """)

    /// Double-clicks the block of the open folder's item `name`, a folder at `path`, with the pointer resting on the map
    /// and staying there, then waits for the canvas to say it shows the folder's finer tree, of `items` items. Says
    /// whether the map drew the folder at once, how many milliseconds after the double-click the page had the finer
    /// tree, and how many after that the map drew it.
    private static let openAndWatch = mapScript("""
        const at = await blockOf(name);
        if (!at) return null;
        const finer = (label) => label.startsWith(`Treemap of ${path},`) && label.includes(` in ${items} items.`);
        let received = null;
        const watch = new MutationObserver(() => {
          if (received === null && finer(canvas.getAttribute("aria-label") ?? "")) received = performance.now();
        });
        watch.observe(canvas, { attributes: true, attributeFilter: ["aria-label"] });
        try {
          leave();
          await pause(100);
          mouse("mousemove", at);
          await pause(100);
          click(at, 1);
          await pause(80);
          click(at, 2);
          const opened = performance.now();
          mouse("dblclick", at, 2);
          // The pointer stays on the map.
          const coarse = () => draws.some((draw) => draw.at >= opened && draw.label.startsWith(`Treemap of ${path},`) && !finer(draw.label));
          if (!(await until(() => received !== null, 5000))) return { coarse: coarse() };
          await until(() => draws.some((draw) => finer(draw.label)));
          const drawn = draws.find((draw) => finer(draw.label));
          return { coarse: coarse(), received: received - opened, drawn: drawn ? drawn.at - received : null };
        } finally {
          watch.disconnect();
        }
        """)

    /// Writes `mebibytes` of zeros to `path` from another process, as most large files come.
    static func fill(_ path: String, mebibytes: Int) -> Bool {
        let write = Process()
        write.executableURL = URL(fileURLWithPath: "/bin/dd")
        write.arguments = ["if=/dev/zero", "of=\(path)", "bs=1048576", "count=\(mebibytes)"]
        write.standardError = FileHandle.nullDevice
        guard (try? write.run()) != nil else { return false }
        write.waitUntilExit()
        return write.terminationStatus == 0
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
    func pressCommand(_ key: String, keyCode: UInt16, in window: NSWindow) {
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
        let grew = await liveMapShows(in: model) { (model.result?.root.size ?? 0) >= before + 262_144 }
        try FileManager.default.removeItem(at: added)
        let shrank = await liveMapShows(in: model) { model.result?.root.size == before }
        print("\(prefix): before \(before), grew \(grew), back \(shrank) at \(model.result?.root.size ?? 0)")
        return ["\(prefix)_follows_a_new_file": grew, "\(prefix)_follows_a_deletion": shrank]
    }

    /// Quits the live map as Pith's quit does, which saves it, then opens it in a second model as the next launch
    /// would: it must open on the saved map, not walk again, and go on following changes.
    private func checkLiveReopens(_ fixture: String, dailyChecks: inout [Bool?]) async throws -> [String: Bool] {
        guard let live = disk.live, let size = disk.result?.root.size else { return ["live_map_reopens": false] }
        final class Flag { var on = false }
        let stopped = Flag()
        live.stop(timeout: .seconds(10)) { stopped.on = true }
        try await waitUntil("the map to be saved") { stopped.on }
        let reopened = DiskModel()
        reopened.scansFolder = disk.scansFolder
        reopened.startLive(root: fixture, keep: true)
        dailyChecks.append(reopened.live?.schedulesDailyCheck)
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
        // SwiftUI syncs the field with Activity's search between steps, so each step waits for the two to agree.
        let search = main.state.activity
        main.window.makeFirstResponder(field)
        let editing = await eventually { field.currentEditor() != nil && main.window.firstResponder === field.currentEditor() }
        field.currentEditor()?.insertText("pith smoke")
        let typed = await eventually { field.stringValue == "pith smoke" && search.search == "pith smoke" }
        field.currentEditor()?.selectAll(nil)
        let pressedCut = editing && typed && press("x", 7)
        let cut = await eventually { field.stringValue.isEmpty && search.search.isEmpty && search.canUndoSearch }
            && pressedCut && pasteboard.string(forType: .string) == "pith smoke"
        // What Edit > Undo goes by as ⌘Z is pressed (`undoInFocus`), so a failure says which of it didn't hold.
        let undoItem = NSApp.mainMenu?.items.compactMap(\.submenu).flatMap(\.items).first { $0.keyEquivalent == "z" && $0.keyEquivalentModifierMask == .command }
        undoItem?.menu?.update()
        let keyWindow = NSApp.keyWindow.map { $0 === main.window ? "the main window" : "\(type(of: $0)) \"\($0.title)\"" } ?? "none"
        let responder = main.window.firstResponder.map { "\(type(of: $0))" } ?? "none"
        let stillEditing = field.currentEditor() != nil && main.window.firstResponder === field.currentEditor()
        let undoState = undoItem.map { "\"\($0.title)\" \($0.isEnabled ? "enabled" : "disabled")" } ?? "missing"
        let before = "active \(NSApp.isActive), key window \(keyWindow), first responder \(responder), field editing \(stillEditing), "
            + "a step to undo \(search.canUndoSearch), Undo item \(undoState)"
        let pressedUndo = press("z", 6)
        let undone = await eventually { field.stringValue == "pith smoke" && search.search == "pith smoke" } && pressedUndo
        print("search cut=\(cut) undo=\(undone) field=\"\(field.stringValue)\"; before ⌘Z: \(before); ⌘Z handled \(pressedUndo), search \"\(search.search)\"")
        field.currentEditor()?.selectAll(nil)
        field.currentEditor()?.delete(nil)
        main.state.activity.search = ""
        return cut && undone
    }

    /// Diagnostic budget: 20 seconds covers startup, scan and WebKit initialization.
    private static let patience: TimeInterval = 20

    /// `duration` in seconds, to a tenth.
    private static func seconds(_ duration: Duration) -> String {
        String(format: "%.1f", Double(duration.components.seconds) + Double(duration.components.attoseconds) / 1e18)
    }

    /// Waits for a prerequisite; the run stops, naming what never happened.
    private func waitUntil(_ what: String, _ predicate: () -> Bool) async throws {
        guard await eventually(predicate) else { throw DiskFailure("Native UI diagnostic timed out waiting for \(what).") }
    }

    private func firstView<T: NSView>(_ type: T.Type, in view: NSView) -> T? {
        if let match = view as? T { return match }
        return view.subviews.lazy.compactMap { self.firstView(type, in: $0) }.first
    }
}

// MARK: Shared with SmokeTestEdges.swift

/// What the smoke test's checks of the disk map wait and drive the page with, here and in SmokeTestEdges.swift.
extension AppDelegate {
    /// Waits for a checked outcome; a timeout is that check failing, not the whole run.
    func eventually(_ predicate: () -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(Self.patience)
        while !predicate() {
            guard Date() < deadline, (try? await Task.sleep(for: .milliseconds(100))) != nil else { return false }
        }
        return true
    }

    /// Waits for `model`'s live map, the run's own unless another is given, to show a change a check made on the disk,
    /// as `eventually` waits, but with the patience counted only while the live map has no folder waiting to be listed
    /// (`LiveMapPatience`): on a loaded Mac a slow listing's cooldown can hold the fixture's folder past the whole
    /// patience while the map is only behind. A change that never shows still fails the wait, once nothing has waited
    /// for the whole patience, or after `LiveEdits.longestHold` in all, as long as Pith itself holds a change of the
    /// person's for the live map's index to show. A passing wait ends as soon as the change shows, as before.
    func liveMapShows(in model: DiskModel? = nil, _ predicate: () -> Bool) async -> Bool {
        let model = model ?? disk
        var patience = LiveMapPatience(patience: Self.patience, longest: LiveEdits.longestHold, at: Date())
        while !predicate() {
            guard patience.mayGoOn(at: Date(), waiting: Self.hasFoldersWaiting(model.live)),
                  (try? await Task.sleep(for: .milliseconds(100))) != nil else { return false }
        }
        return true
    }

    /// Whether `live` has folders waiting to be listed, as the scanner's last status line counts them, its cooldowns'
    /// included, or is still making or catching up its map: a change on the disk is on its way to the map.
    private static func hasFoldersWaiting(_ live: LiveMap?) -> Bool {
        switch live?.state {
        case .live(let waiting)?: waiting > 0
        case .opening?, .mapping?, .catchingUp?: true
        case .off?, .unmapped?, .failed?, nil: false
        }
    }

    /// What `script` returns in the map's page, given `arguments`, once `done` holds for it or the smoke test's patience
    /// runs out.
    func pageAnswer<Answer>(_ web: WKWebView, _ script: String, arguments: [String: Any] = [:], until done: (Answer?) -> Bool) async -> Answer? {
        let deadline = Date().addingTimeInterval(Self.patience)
        while true {
            let answer = (try? await web.callAsyncJavaScript(script, arguments: arguments, in: nil, contentWorld: .page)) as? Answer
            if done(answer) || Date() >= deadline { return answer }
            try? await Task.sleep(for: .milliseconds(100))
        }
    }

    /// Waits until no map has reached the page for `quiet` seconds, as once the live map has answered every request:
    /// the fixture doesn't change meanwhile, and the live map answers it within milliseconds.
    func mapSettles(quiet: TimeInterval = 0.6) async -> Bool {
        var last = disk.revision, since = Date()
        return await eventually {
            if self.disk.revision != last { last = self.disk.revision; since = Date() }
            return Date().timeIntervalSince(since) >= quiet
        }
    }

    /// A script that drives the map: `body` runs after what every such script needs.
    /// - `canvas`, the map.
    /// - `pause(ms)`, and `until(done, ms)`, which waits up to `ms` (3 s unless given) for `done()` and says if it came.
    /// - `draws`, each time the map drew while the script ran, with the time and what the canvas said it showed.
    /// - `mouse(type, at, detail)`, `click(at, detail)`, and `leave()`, which moves the pointer off the map.
    /// - `boxOf(name)`, the painted box of the open folder's item `name` in the page, found by selecting the item in the
    ///   map's list of items and reading the ring that outlines it once Pith has answered with the selection, or null;
    ///   `blockOf(name)`, that box's middle.
    /// - `card()`, what the hover card says, or nothing when it's closed.
    static func mapScript(_ body: String) -> String {
        """
        const canvas = document.querySelector("canvas");
        const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const until = async (done, ms = 3000) => {
          const end = performance.now() + ms;
          while (!done() && performance.now() < end) await pause(20);
          return done();
        };
        const draws = [];
        const clearRect = CanvasRenderingContext2D.prototype.clearRect;
        CanvasRenderingContext2D.prototype.clearRect = function (...rect) {
          if (this.canvas === canvas) draws.push({ at: performance.now(), label: canvas.getAttribute("aria-label") ?? "" });
          return clearRect.apply(this, rect);
        };
        const mouse = (type, at, detail = 0) => canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window,
          clientX: at.x, clientY: at.y, button: 0, buttons: type === "mousedown" ? 1 : 0, detail }));
        const click = (at, detail) => { mouse("mousedown", at, detail); mouse("mouseup", at, detail); mouse("click", at, detail); };
        const leave = () => canvas.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
        const boxOf = async (name) => {
          const ring = () => canvas.parentElement.querySelector("div.pointer-events-none.absolute");
          const button = [...document.querySelectorAll('[aria-label^="Items in"] button')].find((button) => button.textContent.startsWith(name + " "));
          button?.click();
          // The selection's rings come before any other, once Pith's answer shows the item's row selected.
          if (!button || !(await until(() => button.hasAttribute("data-selected") && ring() !== null))) return null;
          return ring().getBoundingClientRect();
        };
        const blockOf = async (name) => {
          const box = await boxOf(name);
          return box && { x: box.left + box.width / 2, y: box.top + box.height / 2 };
        };
        const card = () => canvas.parentElement.querySelector(".tooltip")?.textContent ?? "";
        try {
        \(body)
        } finally {
          CanvasRenderingContext2D.prototype.clearRect = clearRect;
        }
        """
    }
}

/// The person's state that a run of Pith could change (`PersistedState`), read without changing anything: Pith's defaults
/// as saved, when each file and folder Pith keeps for them last changed, their Activity history among them, and the
/// other copies of Pith running now, as the person's own is while they use it. Their scans are left out: their own Pith
/// keeps those current while it runs, and the smoke test keeps its own in a folder of its own.
extension PersistedState {
    private static var library: URL { FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library") }

    /// Pith's own folder in Application Support, where the person's history and scans are kept.
    private static var pithSupport: URL { library.appendingPathComponent("Application Support/Pith") }

    /// The person's Scans folder, Pith's own, where their Pith keeps its scans and the live map.
    static var personsScans: URL { pithSupport.appendingPathComponent("Scans") }

    static func read() -> PersistedState {
        let files = FileManager.default
        let bundle = Bundle.main.bundleIdentifier ?? "app.bruhs.pith"
        let support = pithSupport, scans = personsScans
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
        let own = ProcessInfo.processInfo.processIdentifier
        let others = NSRunningApplication.runningApplications(withBundleIdentifier: bundle).map(\.processIdentifier).filter { $0 != own }
        return PersistedState(defaults: (UserDefaults.standard.persistentDomain(forName: bundle) ?? [:]) as NSDictionary, changed: changed,
                              support: support.path, othersRunning: others)
    }
}

/// What the smoke test sees of the disk menu it opens, from a notification and a timer that run while the menu tracks.
@MainActor private final class OpenMenuWatch {
    /// The menu, once it began tracking, and its first item then, with the title it had.
    var menu: NSMenu?
    var item: NSMenuItem?
    var opened: String?
    /// The first item showed the fresher figures while the menu tracked.
    var retitled = false
    var closed = false
    /// When the timer closes the menu, retitled or not.
    let until: Date

    init(until: Date) { self.until = until }
}
