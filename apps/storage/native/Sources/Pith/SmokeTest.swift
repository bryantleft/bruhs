import AppKit
import WebKit
import PithCore

extension AppDelegate {
    /// Runs the real packaged renderer and scanner against a caller-supplied fixture.
    /// No Trash operation or system setting is changed by this diagnostic.
    func smokeTest(root: URL, report: URL) async {
        var checks: [String: Bool] = [:]
        checks["native_fonts_registered"] = BruhsFonts.isAvailable
        // The fallback symbol is a template image too, so the SVG itself has to decode.
        let glyph = Bundle.main.url(forResource: "StatusGlyph", withExtension: "svg").flatMap(NSImage.init(contentsOf:))
        checks["status_glyph_bundled"] = glyph?.isValid == true && statusItem?.image?.isTemplate == true
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
                checks["menu_panel_stays_on_screen"] = populatedPanel.screen?.frame.contains(populatedPanel.frame) == true
            } else {
                checks["menu_panel_size_stable"] = false
                checks["menu_panel_stays_on_screen"] = false
            }
            // MenuPanelLayout.idealSize must hold the populated panel without scrolling on a display this tall.
            checks["menu_panel_content_fits"] = (statusItem?.panelContentHeight ?? 0) > 0 && statusItem?.panelContentFits == true
            statusItem?.togglePanel()

            showActivity()
            try await waitUntil("a CPU reading in Activity") { self.activity.snapshot?.cpu != nil }
            checks["native_metrics"] = activity.snapshot?.cpu != nil
            let pid = ProcessInfo.processInfo.processIdentifier
            let own = activity.snapshot?.apps.first { $0.members.contains { $0.pid == pid } }
            checks["own_process_metrics"] = (own?.memory ?? 0) > 0
            // Pith names itself from its bundle and sorts macOS's own daemons into System.
            checks["process_identity"] = own?.identity.kind == .app && own?.name == "Pith"
                && activity.snapshot?.apps.contains { $0.identity.kind == .system } == true

            guard let main = mainWindow else { throw DiskFailure("Activity didn't open the main window.") }
            // Title, subtitle, toolbar items and search reach the NSWindow through scene bridging.
            checks["window_toolbar_bridged"] = await eventually {
                main.window.title == "Activity" && main.window.subtitle.hasPrefix("Live")
                    && main.window.toolbar?.items.contains { $0 is NSSearchToolbarItem } == true
            }

            // Rank by the last few samples, as a drag across the chart does.
            try await waitUntil("three samples of history") { self.activity.history.system.compactMap(\.cpu).count >= 3 }
            guard let window = activity.window else { throw DiskFailure("Activity has no history window.") }
            let range = (window.upperBound - 3 * ActivityModel.interval)...window.upperBound
            main.state.activity.rank(by: range)
            let ranked = ActivityListing(history: activity.history, latest: activity.snapshot, range: range, search: "", includeExited: false, sort: main.state.activity.sort)
            checks["range_ranking_scope"] = await eventually { main.window.subtitle.hasPrefix("Paused at") }
                && activity.history.systemCPU(in: range) != nil && !ranked.apps.isEmpty && main.state.activity.sort == .cpuDescending
            // Escape with the table focused arrives as SwiftUI's exit command.
            if let content = main.window.contentView, let table = firstView(NSOutlineView.self, in: content) { main.window.makeFirstResponder(table) }
            if let escape = NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,
                                             windowNumber: main.window.windowNumber, context: nil, characters: "\u{1b}", charactersIgnoringModifiers: "\u{1b}", isARepeat: false, keyCode: 53) {
                main.window.sendEvent(escape)
            }
            checks["escape_returns_to_live"] = await eventually { main.state.activity.range == nil && main.window.subtitle.hasPrefix("Live") }

            activity.pause()
            let pausedCount = activity.history.system.count
            // Longer than a sampling interval, so a pause that didn't stop sampling can't pass by luck.
            try await Task.sleep(for: .seconds(ActivityModel.interval * 1.5))
            checks["pause_stops_history"] = activity.history.system.count == pausedCount
            activity.start()

            showDisk()
            checks["tab_switches_title"] = await eventually { main.window.title == "Disk" && main.state.tab == .disk }
            disk.scan(root)
            try await waitUntil("the scan to finish") { !self.disk.isScanning }
            if let error = disk.error { throw DiskFailure(error) }
            checks["native_scan"] = disk.result?.root.path == root.resolvingSymlinksInPath().path
            checks.merge(try await inspectDisk(), uniquingKeysWith: { _, new in new })
            // Leaving the Disk tab drops DiskView; closing the window drops the whole tree. Both must free WebKit.
            main.show(.activity)
            let releasedOnTabSwitch = await eventually { self.webView == nil }
            showDisk()
            try await waitUntil("the disk map to load again") { self.webView != nil }
            main.window.performClose(nil)
            let releasedOnClose = await eventually { self.webView == nil }
            checks["disk_webview_released"] = releasedOnTabSwitch && releasedOnClose
            checks["main_window_released"] = mainWindow == nil
            let samples = activity.history.system.count
            checks["monitoring_survives_window_close"] = await eventually { !self.activity.paused && self.activity.history.system.count > samples }
            statusItem?.togglePanel()
            checks["menu_panel_opens"] = statusItem?.panelWindow?.isVisible == true
            statusItem?.togglePanel()
            let data = try JSONSerialization.data(withJSONObject: checks, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: report)
            print(String(decoding: data, as: UTF8.self))
            if checks.values.contains(false) { exit(1) }
            NSApp.terminate(nil)
        } catch {
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
        guard rendered else { throw DiskFailure("The real WKWebView did not render a treemap. \(disk.error ?? "No native error.")") }
        // The labels' face must load. `document.fonts.check` would also pass with no matching face declared at all.
        let fonts = (try? await web.callAsyncJavaScript("return (await document.fonts.load('11px MonaspaceNeonVariable')).some((face) => face.status === 'loaded')", in: nil, contentWorld: .page)) as? Bool == true
        let labels = (try await web.callAsyncJavaScript("return document.querySelector('canvas').getAttribute('aria-label').includes('Treemap') && document.querySelector('nav[aria-label]') !== null", in: nil, contentWorld: .page)) as? Bool == true
        _ = try await web.callAsyncJavaScript("document.querySelector('aside button')?.click()", in: nil, contentWorld: .page)
        try await Task.sleep(for: .milliseconds(100))
        let selection = disk.selected != nil
        _ = try await web.callAsyncJavaScript("window.location.href = 'https://example.com/'", in: nil, contentWorld: .page)
        try await Task.sleep(for: .milliseconds(200))
        return ["treemap_rendered": rendered, "bundled_fonts": fonts, "accessible_map": labels,
            "selection_bridge": selection, "remote_navigation_blocked": web.url?.scheme == "pith"]
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
