import AppKit
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

@MainActor final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, NSMenuItemValidation {
    let activity = ActivityModel()
    let disk = DiskModel()
    private(set) var statusItem: StatusItemController?
    /// The Activity | Disk window, created on demand and released when closed.
    private(set) var mainWindow: MainWindowController?
    private var settingsWindow: NSWindow?
    private var observers: [NSObjectProtocol] = []
    weak var webView: WKWebView?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        BruhsFonts.register()
        let menu = NSMenu()
        let appMenu = NSMenuItem(); menu.addItem(appMenu)
        appMenu.submenu = NSMenu()
        appMenu.submenu?.addItem(withTitle: "Settings…", action: #selector(showSettings), keyEquivalent: ",").target = self
        appMenu.submenu?.addItem(.separator())
        appMenu.submenu?.addItem(withTitle: "Quit Pith", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let file = NSMenuItem(title: "File", action: nil, keyEquivalent: ""); menu.addItem(file)
        file.submenu = NSMenu(title: "File")
        file.submenu?.addItem(withTitle: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        let edit = NSMenuItem(title: "Edit", action: nil, keyEquivalent: ""); menu.addItem(edit)
        edit.submenu = NSMenu(title: "Edit")
        for (name, action, key) in [("Copy", "copy:", "c"), ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")] {
            edit.submenu?.addItem(withTitle: name, action: Selector(action), keyEquivalent: key)
        }
        edit.submenu?.addItem(.separator())
        edit.submenu?.addItem(withTitle: "Find…", action: #selector(findInActivity), keyEquivalent: "f").target = self
        let view = NSMenuItem(title: "View", action: nil, keyEquivalent: ""); menu.addItem(view)
        view.submenu = NSMenu(title: "View")
        view.submenu?.addItem(withTitle: "Activity", action: #selector(showActivityFromMenu), keyEquivalent: "1").target = self
        view.submenu?.addItem(withTitle: "Disk", action: #selector(showDisk), keyEquivalent: "2").target = self
        view.submenu?.addItem(.separator())
        let inspector = NSMenuItem(title: "Show Inspector", action: #selector(toggleInspector), keyEquivalent: "i")
        inspector.keyEquivalentModifierMask = [.command, .option]
        inspector.target = self
        view.submenu?.addItem(inspector)
        NSApp.mainMenu = menu
        statusItem = StatusItemController(activity: activity, actions: PanelActions(
            openActivity: { [weak self] id in self?.showActivity(selecting: id) },
            openDisk: { [weak self] in self?.showDisk() },
            openSettings: { [weak self] in self?.showSettings() }))
        activity.onSample = { [weak self] in self?.statusItem?.update() }
        activity.start(); statusItem?.update()
        let center = NSWorkspace.shared.notificationCenter
        observers.append(center.addObserver(forName: NSWorkspace.willSleepNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.activity.pause() }
        })
        observers.append(center.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.activity.start() }
        })
        if CommandLine.arguments.contains("--activity") { showActivity() }
        if let index = CommandLine.arguments.firstIndex(of: "--scan"), CommandLine.arguments.indices.contains(index + 1) {
            showDisk(); disk.scan(URL(fileURLWithPath: CommandLine.arguments[index + 1]))
        }
        if let index = CommandLine.arguments.firstIndex(of: "--smoke-test"), CommandLine.arguments.indices.contains(index + 2) {
            let root = URL(fileURLWithPath: CommandLine.arguments[index + 1])
            let report = URL(fileURLWithPath: CommandLine.arguments[index + 2])
            Task { await smokeTest(root: root, report: report) }
        }
    }

    @objc private func showActivityFromMenu() { showActivity() }

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
            // Settings has one pane, so the HIG asks for "App Name Settings" and no minimize or zoom.
            let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 460, height: 360), styleMask: [.titled, .closable], backing: .buffered, defer: false)
            window.title = "Pith Settings"; window.contentView = NSHostingView(rootView: SettingsView(model: activity))
            window.delegate = self; window.isReleasedWhenClosed = false; window.center()
            window.setFrameAutosaveName("Pith Settings")
            settingsWindow = window
        }
        NSApp.activate(ignoringOtherApps: true); settingsWindow?.makeKeyAndOrderFront(nil)
    }
    private func openMainWindow(_ tab: WindowTab) {
        if mainWindow == nil {
            mainWindow = MainWindowController(activity: activity, disk: disk, tab: tab,
                webCreated: { [weak self] web in self?.webView = web },
                closed: { [weak self] in self?.mainWindow = nil })
        }
        mainWindow?.show(tab)
    }

    @objc private func findInActivity() {
        mainWindow?.window.toolbar?.items.lazy.compactMap { $0 as? NSSearchToolbarItem }.first?.beginSearchInteraction()
    }
    @objc private func toggleInspector() { mainWindow?.state.activity.showsInspector.toggle() }

    func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
        let activityShowing = mainWindow?.window.isVisible == true && mainWindow?.state.tab == .activity
        switch menuItem.action {
        case #selector(findInActivity): return activityShowing
        case #selector(toggleInspector):
            menuItem.title = mainWindow?.state.activity.showsInspector == false ? "Show Inspector" : "Hide Inspector"
            return activityShowing
        default: return true
        }
    }

    func windowWillClose(_ notification: Notification) {
        guard let window = notification.object as? NSWindow, window === settingsWindow else { return }
        window.contentView = nil; settingsWindow = nil
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { showActivity(); return false }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        activity.pause(); disk.cancel()
        return .terminateNow
    }
    func applicationWillTerminate(_ notification: Notification) {
        activity.pause(); disk.cancel()
        for observer in observers { NSWorkspace.shared.notificationCenter.removeObserver(observer) }
    }
}
