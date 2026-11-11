import AppKit
import PithCore
import WebKit

/// The smoke test's run: Activity, the menu panel and the disk map's page, then each area's checks in turn, from the
/// files beside this one, and last, the person's state, which the run leaves as it found it.
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

    /// `duration` in seconds, to a tenth.
    private static func seconds(_ duration: Duration) -> String {
        String(format: "%.1f", Double(duration.components.seconds) + Double(duration.components.attoseconds) / 1e18)
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
