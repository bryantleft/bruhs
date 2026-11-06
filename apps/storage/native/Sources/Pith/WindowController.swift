import AppKit
import PithCore
import SwiftUI
import WebKit

enum WindowTab: String, CaseIterable, Identifiable {
    case activity, disk
    var id: Self { self }
    var title: String {
        switch self {
        case .activity: "Activity"
        case .disk: "Disk"
        }
    }
}

/// Which tab the main window shows, plus the Activity tab's own state.
@MainActor @Observable final class MainWindowState {
    var tab: WindowTab
    let activity = ActivityState()
    init(tab: WindowTab) { self.tab = tab }
}

/// Pith's one main window, with Activity and Disk as tabs. SwiftUI's title, subtitle, toolbar
/// items and search field reach the NSWindow's unified toolbar through the hosting controller's
/// scene bridging (macOS 14), so macOS draws all of the chrome.
@MainActor final class MainWindowController: NSObject, NSWindowDelegate {
    let window: NSWindow
    let state: MainWindowState
    private let closed: () -> Void

    init(activity: ActivityModel, disk: DiskModel, tab: WindowTab, webCreated: @escaping (WKWebView) -> Void, closed: @escaping () -> Void) {
        state = MainWindowState(tab: tab)
        self.closed = closed
        let content = NSHostingController(rootView: MainWindowView(activity: activity, disk: disk, state: state, webCreated: webCreated))
        content.sceneBridgingOptions = [.title, .toolbars]
        // Only the minimum size follows SwiftUI, so switching tabs or showing the inspector never resizes the window.
        content.sizingOptions = [.minSize]
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1100, height: 760), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        super.init()
        window.contentViewController = content
        // Assigning the controller shrinks the window to the content's ideal size.
        window.setContentSize(NSSize(width: 1100, height: 760))
        window.toolbarStyle = .unified
        // Activity and Disk are already tabs; macOS's own window tabs would be a second, competing set.
        window.tabbingMode = .disallowed
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.center()
        window.setFrameAutosaveName("Pith Main Window")
    }

    func show(_ tab: WindowTab) {
        state.tab = tab
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
    }

    func windowWillClose(_ notification: Notification) {
        // Dropping the SwiftUI tree releases the disk map's WKWebView. Sampling carries on in ActivityModel.
        window.contentViewController = nil
        closed()
    }
}

struct MainWindowView: View {
    let activity: ActivityModel
    let disk: DiskModel
    @Bindable var state: MainWindowState
    let webCreated: (WKWebView) -> Void

    var body: some View {
        Group {
            switch state.tab {
            case .activity: ActivityView(model: activity, state: state.activity)
            // Only the visible tab exists, so leaving Disk releases its WKWebView.
            case .disk: DiskView(model: disk, webCreated: webCreated)
            }
        }
        .frame(minWidth: 820, minHeight: 560)
        .navigationTitle(state.tab.title)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Picker("View", selection: $state.tab) {
                    ForEach(WindowTab.allCases) { tab in Text(tab.title).tag(tab) }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .help("Show Activity (⌘1) or Disk (⌘2)")
            }
        }
    }
}
