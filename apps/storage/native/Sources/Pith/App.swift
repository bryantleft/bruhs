import AppKit
import Quartz
import SwiftUI
import WebKit
import PithCore

@main @MainActor struct PithApp {
    static func main() async {
        if CommandLine.arguments.contains("--probe") { await probe(); return }
        let application = NSApplication.shared
        let delegate = AppDelegate()
        application.delegate = delegate
        withExtendedLifetime(delegate) { application.run() }
    }

    private static func probe() async {
        let sampler = SystemSampler()
        for _ in 0..<20 {
            let start = ProcessInfo.processInfo.systemUptime
            let sample = await sampler.sample()
            print("sample_ms=\((ProcessInfo.processInfo.systemUptime - start) * 1000) apps=\(sample.apps.count) readable=\(sample.apps.filter { !$0.restricted }.count) cpu=\(sample.cpu.map(String.init(describing:)) ?? "unknown") pressure=\(sample.pressure.label) error=\(sample.error ?? "none")")
            if let own = sample.apps.first(where: { $0.members.contains { $0.pid == ProcessInfo.processInfo.processIdentifier } }) {
                print("own_footprint=\(own.memory.map(String.init) ?? "unknown") own_cpu=\(own.cpu.map(String.init(describing:)) ?? "unknown")")
            }
        }
    }
}

@MainActor final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, NSMenuItemValidation, QLPreviewPanelDataSource {
    let activity = ActivityModel()
    let disk = DiskModel()
    let alertSettings = AlertSettings()
    let updates = Updates()
    /// Sparkle, started unless the build has no feed or the run is automated.
    private var updater: SparkleUpdater?
    private var alerts: AlertMonitor?
    private(set) var shortcut: PanelShortcut?
    private var diskCheckedAt = Date.distantPast
    private(set) var statusItem: StatusItemController?
    /// The Activity | Disk window, created on demand and released when closed.
    private(set) var mainWindow: MainWindowController?
    private var settingsWindow: NSWindow?
    private var welcomeWindow: NSWindow?
    private var updateWindow: NSWindow?
    private var observers: [NSObjectProtocol] = []
    weak var webView: WKWebView?
    /// What Quick Look shows; the panel asks for it through the responder chain, which ends at this delegate.
    private var previewItems: [URL] = []

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        BruhsFonts.register()
        NSApp.mainMenu = makeMainMenu()
        // The permission question is the one update window nobody asked for, at a launch, so it comes forward without
        // taking focus from whatever the person is doing.
        updates.present = { [weak self] in self?.showUpdates(activating: self?.updates.flow.phase != .askingPermission) }
        statusItem = StatusItemController(activity: activity, updates: updates, actions: PanelActions(
            openActivity: { [weak self] id in self?.showActivity(selecting: id) },
            openDisk: { [weak self] in self?.showDisk() },
            openSettings: { [weak self] in self?.showSettings() },
            checkForUpdates: { [weak self] in self?.checkForUpdates() },
            openUpdate: { [weak self] in self?.showUpdates() }))
        alerts = AlertMonitor(settings: alertSettings, activity: activity, open: { [weak self] id in self?.showActivity(selecting: id) })
        shortcut = PanelShortcut { [weak self] in self?.statusItem?.togglePanel() }
        activity.onSample = { [weak self] in
            guard let self else { return }
            statusItem?.update()
            if let snapshot = activity.snapshot, !activity.paused {
                // The disk alert needs a reading even while the panel is closed; once a minute is plenty for a disk.
                if alertSettings.isOn(.disk), Date().timeIntervalSince(diskCheckedAt) >= 60 { diskCheckedAt = Date(); activity.refreshDiskSpace() }
                alerts?.check(snapshot)
            }
        }
        disk.showQuickLook = { [weak self] urls in self?.quickLook(urls) }
        disk.writers = { [weak self] since in self?.activity.writers(since: since) ?? .empty }
        activity.start(); statusItem?.update()
        let center = NSWorkspace.shared.notificationCenter
        observers.append(center.addObserver(forName: NSWorkspace.willSleepNotification, object: nil, queue: .main) { [weak self] _ in
            // The map is saved before the Mac sleeps, since a Mac that doesn't wake up again never quits Pith.
            Task { @MainActor in self?.activity.pause(); self?.disk.live?.save() }
        })
        observers.append(center.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.activity.start() }
        })
        // The disk menu and the path bar name the disks mounted now.
        for name in [NSWorkspace.didMountNotification, NSWorkspace.didUnmountNotification, NSWorkspace.didRenameVolumeNotification] {
            observers.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor in self?.disk.refreshChoices() }
            })
        }
        let automated = CommandLine.arguments.contains { ["--activity", "--scan", "--smoke-test"].contains($0) }
        // An automated run never goes online or asks the person anything, and leaves their update settings alone. Nor
        // does it map the person's disk, which the smoke test does with a folder of its own.
        if !automated { startUpdates(); disk.startLive() }
        if CommandLine.arguments.contains("--activity") { showActivity() }
        if let index = CommandLine.arguments.firstIndex(of: "--scan"), CommandLine.arguments.indices.contains(index + 1) {
            showDisk(); disk.scan(URL(fileURLWithPath: CommandLine.arguments[index + 1]))
        }
        if let index = CommandLine.arguments.firstIndex(of: "--smoke-test"), CommandLine.arguments.indices.contains(index + 2) {
            let root = URL(fileURLWithPath: CommandLine.arguments[index + 1])
            let report = URL(fileURLWithPath: CommandLine.arguments[index + 2])
            Task { await smokeTest(root: root, report: report) }
        }
        // A menu bar item can be hidden by macOS or crowded out behind the notch, so the first launch says where Pith is.
        if !automated && !UserDefaults.standard.bool(forKey: WelcomeView.seenKey) { showWelcome() }
    }

    // MARK: Menus

    private func makeMainMenu() -> NSMenu {
        let menu = NSMenu()
        func submenu(_ title: String) -> NSMenu {
            let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            let sub = NSMenu(title: title)
            item.submenu = sub
            menu.addItem(item)
            return sub
        }
        func add(_ menu: NSMenu, _ title: String, _ action: Selector?, _ key: String = "", _ modifiers: NSEvent.ModifierFlags = .command, target: AnyObject? = nil) {
            let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
            item.keyEquivalentModifierMask = modifiers
            item.target = target
            menu.addItem(item)
        }
        let app = submenu("Pith")
        add(app, "About Pith", #selector(showAbout), target: self)
        add(app, "Check for Updates…", #selector(checkForUpdates), target: self)
        app.addItem(.separator())
        add(app, "Settings…", #selector(showSettings), ",", target: self)
        app.addItem(.separator())
        add(app, "Hide Pith", #selector(NSApplication.hide(_:)), "h")
        add(app, "Hide Others", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option])
        add(app, "Show All", #selector(NSApplication.unhideAllApplications(_:)))
        app.addItem(.separator())
        add(app, "Quit Pith", #selector(NSApplication.terminate(_:)), "q")

        let file = submenu("File")
        add(file, "Choose Folder…", #selector(chooseFolder), "o", target: self)
        add(file, "Show Startup Disk", #selector(scanStartupDisk), target: self)
        add(file, "Check Again", #selector(scanAgain), "r", target: self)
        file.addItem(.separator())
        add(file, "Quick Look", #selector(quickLookSelection), "y", target: self)
        add(file, "Reveal in Finder", #selector(revealSelection), "r", [.command, .option], target: self)
        add(file, "Copy Path", #selector(copySelectionPath), "c", [.command, .option], target: self)
        add(file, "Move to Trash", #selector(trashSelection), "\u{8}", target: self)
        file.addItem(.separator())
        add(file, "Export Activity…", #selector(exportActivity), "e", [.command, .shift], target: self)
        file.addItem(.separator())
        add(file, "Close Window", #selector(NSWindow.performClose(_:)), "w")

        let edit = submenu("Edit")
        add(edit, "Undo", #selector(undoInFocus(_:)), "z", target: self)
        add(edit, "Redo", #selector(redoInFocus(_:)), "z", [.command, .shift], target: self)
        edit.addItem(.separator())
        add(edit, "Cut", #selector(NSText.cut(_:)), "x")
        add(edit, "Copy", #selector(NSText.copy(_:)), "c")
        add(edit, "Paste", #selector(NSText.paste(_:)), "v")
        add(edit, "Select All", #selector(NSText.selectAll(_:)), "a")
        edit.addItem(.separator())
        add(edit, "Find…", #selector(findInActivity), "f", target: self)

        let view = submenu("View")
        add(view, "Activity", #selector(showActivityFromMenu), "1", target: self)
        add(view, "Disk", #selector(showDisk), "2", target: self)
        view.addItem(.separator())
        add(view, "Bigger Text", #selector(biggerText), "+", target: self)
        add(view, "Smaller Text", #selector(smallerText), "-", target: self)
        add(view, "Actual Size", #selector(actualTextSize), "0", target: self)

        let go = submenu("Go")
        add(go, "Back", #selector(goBack), "[", target: self)
        add(go, "Forward", #selector(goForward), "]", target: self)
        add(go, "Enclosing Folder", #selector(enclosingFolder), String(Character(UnicodeScalar(NSUpArrowFunctionKey)!)), target: self)

        let window = submenu("Window")
        add(window, "Minimize", #selector(NSWindow.performMiniaturize(_:)), "m")
        add(window, "Zoom", #selector(NSWindow.performZoom(_:)))
        window.addItem(.separator())
        add(window, "Show Welcome", #selector(showWelcome), target: self)
        add(window, "Bring All to Front", #selector(NSApplication.arrangeInFront(_:)))
        NSApp.windowsMenu = window
        return menu
    }

    @objc private func showActivityFromMenu() { showActivity() }
    /// An accessory app is never frontmost on its own, so bring it forward for the standard panel.
    @objc private func showAbout() {
        NSApp.activate(ignoringOtherApps: true)
        NSApp.orderFrontStandardAboutPanel(nil)
    }

    /// Opens Activity; with an id, that app is selected and scrolled into view.
    func showActivity(selecting appID: String? = nil) {
        statusItem?.closePanel()
        if let appID { activity.focusAppID = appID }
        openMainWindow(.activity)
    }
    @objc func showDisk() {
        statusItem?.closePanel()
        openMainWindow(.disk)
    }
    @objc func showSettings() {
        statusItem?.closePanel()
        if settingsWindow == nil {
            // Settings has one pane, so the HIG asks for "App Name Settings" and no minimize or zoom. It sizes to its form.
            let host = NSHostingController(rootView: SettingsView(model: activity, alerts: alertSettings, disk: disk, shortcut: shortcut, updates: updates))
            host.sizingOptions = [.preferredContentSize]
            let window = NSWindow(contentViewController: host)
            window.styleMask = [.titled, .closable]
            window.title = "Pith Settings"
            window.backgroundColor = BruhsNSColor.canvas
            window.titlebarAppearsTransparent = true
            window.delegate = self; window.isReleasedWhenClosed = false; window.center()
            window.setFrameAutosaveName("Pith Settings")
            settingsWindow = window
        }
        NSApp.activate(ignoringOtherApps: true); settingsWindow?.makeKeyAndOrderFront(nil)
    }
    @objc func showWelcome() {
        statusItem?.closePanel()
        if welcomeWindow == nil {
            let host = NSHostingController(rootView: WelcomeView(activity: activity, glyph: statusGlyph(), open: { [weak self] tab in
                self?.welcomeWindow?.performClose(nil)
                if tab == .activity { self?.showActivity() } else { self?.showDisk() }
            }, close: { [weak self] in self?.welcomeWindow?.performClose(nil) }))
            host.sizingOptions = [.preferredContentSize]
            let window = NSWindow(contentViewController: host)
            window.styleMask = [.titled, .closable]
            window.title = "Welcome to Pith"
            window.backgroundColor = BruhsNSColor.canvas
            window.titlebarAppearsTransparent = true
            window.delegate = self; window.isReleasedWhenClosed = false; window.center()
            welcomeWindow = window
        }
        UserDefaults.standard.set(true, forKey: WelcomeView.seenKey)
        NSApp.activate(ignoringOtherApps: true); welcomeWindow?.makeKeyAndOrderFront(nil)
    }

    // MARK: Updates

    /// Builds signed only for this Mac have no feed, so Sparkle declines to start and Pith never offers to update them.
    private func startUpdates() {
        let updater = SparkleUpdater(updates: updates)
        do {
            try updater.start()
            self.updater = updater
        } catch {
            NSLog("Pith: updates are off in this build: %@", error.localizedDescription)
        }
    }

    @objc func checkForUpdates() { updates.check() }

    /// The update window, which Sparkle's steps bring forward and the panel's reminder opens.
    func showUpdates(activating: Bool = true) {
        statusItem?.closePanel()
        if updateWindow == nil {
            let host = NSHostingController(rootView: UpdateView(updates: updates, close: { [weak self] in self?.updateWindow?.performClose(nil) }))
            host.sizingOptions = [.preferredContentSize]
            let window = NSWindow(contentViewController: host)
            window.styleMask = [.titled, .closable]
            window.title = "Software Update"
            window.backgroundColor = BruhsNSColor.canvas
            window.titlebarAppearsTransparent = true
            window.delegate = self; window.isReleasedWhenClosed = false; window.center()
            updateWindow = window
        }
        if activating {
            NSApp.activate(ignoringOtherApps: true); updateWindow?.makeKeyAndOrderFront(nil)
        } else {
            updateWindow?.orderFrontRegardless()
        }
    }

    private func openMainWindow(_ tab: WindowTab) {
        if mainWindow == nil {
            mainWindow = MainWindowController(activity: activity, disk: disk, tab: tab,
                webCreated: { [weak self] web in self?.webView = web },
                closed: { [weak self] in self?.mainWindow = nil; self?.activity.activityOnScreen = false })
            mainWindow?.visibilityChanged = { [weak self] in self?.activity.activityOnScreen = self?.mainWindow?.showsActivity == true }
        }
        mainWindow?.show(tab)
    }

    @objc private func findInActivity() {
        mainWindow?.window.toolbar?.items.lazy.compactMap { $0 as? NSSearchToolbarItem }.first?.beginSearchInteraction()
    }

    // MARK: Undo

    /// The undo manager Edit > Undo acts on. SwiftUI gives a search field an undo manager of its own, apart from the
    /// window's, so the menu's usual undo: reaches the window and finds nothing; the focused view's manager comes first
    /// when it holds something, then the window's, which holds Move to Trash.
    private var undoTarget: UndoManager? {
        let window = NSApp.keyWindow
        if let focused = window?.firstResponder?.undoManager, focused !== window?.undoManager, focused.canUndo || focused.canRedo { return focused }
        return window?.undoManager
    }

    /// Activity's search state while its search field is being edited, whose steps Activity keeps itself.
    private var focusedSearch: ActivityState? {
        guard let main = mainWindow, NSApp.keyWindow === main.window,
              let field = main.window.toolbar?.items.lazy.compactMap({ ($0 as? NSSearchToolbarItem)?.searchField }).first,
              let editor = field.currentEditor(), editor === main.window.firstResponder else { return nil }
        return main.state.activity
    }

    @objc private func undoInFocus(_ sender: Any?) {
        if let search = focusedSearch { search.undoSearch() } else { undoTarget?.undo() }
    }
    @objc private func redoInFocus(_ sender: Any?) {
        if let search = focusedSearch { search.redoSearch() } else { undoTarget?.redo() }
    }

    // MARK: Disk commands

    private var diskShowing: Bool { mainWindow?.window.isVisible == true && mainWindow?.state.tab == .disk }

    @objc private func chooseFolder() { showDisk(); disk.chooseFolder() }
    /// Shows the startup disk from the live map, as the disk menu's startup disk does: at its root when the map shown is
    /// the whole disk. Without the live map it scans the disk, again if the map shown is a scan of it.
    @objc private func scanStartupDisk() {
        showDisk()
        if disk.liveMapRuns { disk.show("/") } else { disk.scan(URL(fileURLWithPath: "/")) }
    }
    /// The live map lists the open folder again, everything in it; a scanned map is scanned again.
    @objc private func scanAgain() {
        if disk.liveView != nil {
            if let folder = disk.openFolder ?? disk.result?.root.path { disk.checkAgain(folder) }
            return
        }
        guard let root = disk.result?.root.path ?? disk.scope else { return }
        disk.scan(URL(fileURLWithPath: root))
    }
    @objc private func quickLookSelection() { disk.quickLook(nil) }
    @objc private func revealSelection() { if let path = disk.selected { disk.reveal(path) } }
    @objc private func copySelectionPath() { if let path = disk.selected { disk.copyPath(path) } }
    @objc private func trashSelection() { if let path = disk.selected { disk.requestTrash(path, undoManager: mainWindow?.window.undoManager) } }
    // The map's page keeps the open folders and Back and Forward's history, so the Go menu moves it.
    @objc private func goBack() { disk.pageCommand?(.back) }
    @objc private func goForward() { disk.pageCommand?(.forward) }
    @objc private func enclosingFolder() { disk.pageCommand?(.up) }

    /// Saves Activity's table, as it's searched, sorted and ranked now, as CSV.
    @objc private func exportActivity() {
        let state = mainWindow?.state.activity
        let listing = ActivityListing(history: activity.history, latest: activity.snapshot, range: state?.range, search: state?.search ?? "",
                                      includeExited: state?.includeExited ?? false, sort: state?.sort ?? .cpuDescending)
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.commaSeparatedText]
        panel.nameFieldStringValue = "Pith Activity \(Date().formatted(.iso8601.year().month().day().dateSeparator(.dash).time(includingFractionalSeconds: false).timeSeparator(.omitted)))"
        NSApp.activate(ignoringOtherApps: true)
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do { try listing.csv().write(to: url, atomically: true, encoding: .utf8) }
        catch {
            let alert = NSAlert(error: error)
            alert.messageText = "Pith couldn’t save the export."
            alert.runModal()
        }
    }

    // MARK: Text size

    @objc private func biggerText() { TextSize.shared.step(1) }
    @objc private func smallerText() { TextSize.shared.step(-1) }
    @objc private func actualTextSize() { TextSize.shared.reset() }

    func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
        let activityShowing = mainWindow?.window.isVisible == true && mainWindow?.state.tab == .activity
        let selection = diskShowing && disk.selected != nil
        switch menuItem.action {
        case #selector(findInActivity): return activityShowing
        case #selector(quickLookSelection), #selector(revealSelection), #selector(copySelectionPath): return selection
        case #selector(trashSelection): return selection && !disk.isScanning && (try? disk.selectedPlan?.get()) != nil
        case #selector(scanAgain):
            let live = disk.liveView != nil
            menuItem.title = live ? "Check Again" : "Scan Again"
            return diskShowing && !disk.isScanning && disk.scope != nil && (!live || disk.live?.state.isMapped == true)
        case #selector(scanStartupDisk):
            menuItem.title = disk.liveMapRuns ? "Show Startup Disk" : "Scan Startup Disk"
            return !disk.isScanning && !disk.isTrashing
        case #selector(chooseFolder): return !disk.isScanning && !disk.isTrashing
        // While a scan runs, the map under it is dimmed and doesn't take clicks, so it doesn't move either.
        case #selector(goBack): return diskShowing && !disk.isScanning && disk.canGoBack
        case #selector(goForward): return diskShowing && !disk.isScanning && disk.canGoForward
        case #selector(enclosingFolder): return diskShowing && !disk.isScanning && disk.openFolder != nil && disk.openFolder != disk.result?.root.path
        case #selector(biggerText): return TextSize.shared.canGrow
        case #selector(smallerText): return TextSize.shared.canShrink
        case #selector(actualTextSize): return TextSize.shared.scale != 1
        case #selector(exportActivity): return activity.snapshot != nil
        case #selector(checkForUpdates):
            menuItem.isHidden = !updates.isAvailable
            return updates.canCheck
        case #selector(undoInFocus(_:)):
            if let search = focusedSearch { menuItem.title = "Undo Typing"; return search.canUndoSearch }
            menuItem.title = undoTarget?.undoMenuItemTitle ?? "Undo"
            return undoTarget?.canUndo == true
        case #selector(redoInFocus(_:)):
            if let search = focusedSearch { menuItem.title = "Redo Typing"; return search.canRedoSearch }
            menuItem.title = undoTarget?.redoMenuItemTitle ?? "Redo"
            return undoTarget?.canRedo == true
        default: return true
        }
    }

    // MARK: Quick Look

    private func quickLook(_ urls: [URL]) {
        previewItems = urls
        guard let panel = QLPreviewPanel.shared() else { return }
        if panel.isVisible { panel.reloadData() } else { panel.makeKeyAndOrderFront(nil) }
    }

    // QLPreviewPanel calls these on the main thread; they're declared on NSObject without an actor.
    nonisolated override func acceptsPreviewPanelControl(_ panel: QLPreviewPanel!) -> Bool { MainActor.assumeIsolated { !previewItems.isEmpty } }
    nonisolated override func beginPreviewPanelControl(_ panel: QLPreviewPanel!) { MainActor.assumeIsolated { panel.dataSource = self; panel.reloadData() } }
    nonisolated override func endPreviewPanelControl(_ panel: QLPreviewPanel!) { MainActor.assumeIsolated { panel.dataSource = nil } }
    nonisolated func numberOfPreviewItems(in panel: QLPreviewPanel!) -> Int { MainActor.assumeIsolated { previewItems.count } }
    nonisolated func previewPanel(_ panel: QLPreviewPanel!, previewItemAt index: Int) -> (any QLPreviewItem)! {
        MainActor.assumeIsolated { previewItems[index] as NSURL }
    }

    // MARK: Lifecycle

    func windowWillClose(_ notification: Notification) {
        guard let window = notification.object as? NSWindow else { return }
        if window === settingsWindow { window.contentViewController = nil; settingsWindow = nil }
        if window === welcomeWindow { window.contentViewController = nil; welcomeWindow = nil }
        if window === updateWindow { updates.windowClosed(); window.contentViewController = nil; updateWindow = nil }
    }
    /// Opening Pith again from Finder while it runs shows where it lives, the fallback when macOS hides the menu bar item.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { showWelcome(); return false }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        activity.pause(); disk.cancel()
        // The scanner saves the map as it exits, so the next launch catches up from here rather than walking again.
        // Saving the development Mac's map took 0.65 to 0.99 s; past five, Pith quits regardless.
        disk.live?.stopNow(timeout: 5)
        return .terminateNow
    }
    func applicationWillTerminate(_ notification: Notification) {
        activity.pause(); disk.cancel()
        for observer in observers { NSWorkspace.shared.notificationCenter.removeObserver(observer) }
    }
}
