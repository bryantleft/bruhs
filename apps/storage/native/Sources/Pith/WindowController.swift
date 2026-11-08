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
    var tab: WindowTab {
        didSet { if tab == .disk { diskOpened = true } }
    }
    /// Disk stays alive once shown, so switching tabs keeps the map's open folder and highlight.
    private(set) var diskOpened: Bool
    let activity = ActivityState()
    init(tab: WindowTab) { self.tab = tab; diskOpened = tab == .disk }
}

/// Pith's one main window, with Activity and Disk as tabs. SwiftUI's title, subtitle, toolbar
/// items and search field reach the NSWindow's unified toolbar through the hosting controller's
/// scene bridging (macOS 14), so macOS draws the controls; the window itself is the bruhs canvas.
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
        // Wide enough for every Activity column beside the inspector at its usual width.
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1180, height: 760), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        super.init()
        window.contentViewController = content
        // Assigning the controller shrinks the window to the content's ideal size.
        window.setContentSize(NSSize(width: 1180, height: 760))
        window.toolbarStyle = .unified
        // The canvas shows under the toolbar and through the disk map's transparent page. Without a transparent
        // title bar, macOS paints its own grey band behind the toolbar.
        window.backgroundColor = BruhsNSColor.canvas
        window.titlebarAppearsTransparent = true
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
        ZStack {
            // Activity exists only while shown: its search field and toolbar items belong to it.
            if state.tab == .activity { ActivityView(model: activity, state: state.activity) }
            // Disk, once opened, lives until the window closes, hidden while Activity shows.
            if state.diskOpened {
                let showing = state.tab == .disk
                DiskView(model: disk, visible: showing, webCreated: webCreated)
                    .opacity(showing ? 1 : 0)
                    .allowsHitTesting(showing)
                    .accessibilityHidden(!showing)
            }
        }
        .frame(minWidth: 820, minHeight: 560)
        // The tabs name themselves in the toolbar, so the title is the app's.
        .navigationTitle("Pith")
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
        .tint(BruhsColor.accent)
    }
}
