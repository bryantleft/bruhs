import AppKit
import PithCore
import SwiftUI

/// What the panel can ask the app to do.
struct PanelActions {
    /// Opens Activity, selecting the app with this id when one is given.
    let openActivity: (_ appID: String?) -> Void
    let openDisk: () -> Void
    let openSettings: () -> Void
}

/// The bruh-slice glyph generated into native/Brand. As a template image, AppKit tints it to
/// match the menu bar, the same as Apple's own extras.
@MainActor func statusGlyph() -> NSImage? {
    guard let url = Bundle.main.url(forResource: "StatusGlyph", withExtension: "svg"), let image = NSImage(contentsOf: url) else {
        // `swift run` has no bundle resources; the packaged app always does, and the smoke test checks it.
        NSLog("Pith: StatusGlyph.svg is missing from the app bundle, so the menu bar shows a fallback symbol.")
        return NSImage(systemSymbolName: "circle.lefthalf.filled", accessibilityDescription: "Pith")
    }
    image.isTemplate = true
    image.size = NSSize(width: 16, height: 16)
    image.accessibilityDescription = "Pith"
    return image
}

/// The menu bar title after the glyph: the CPU value in fixed digit cells unless `showsValue` is off, plus the
/// memory-pressure symbol in its status colour only while pressure is elevated, so the item draws attention only
/// when something is wrong.
@MainActor func statusTitle(cpu: String?, pressure: MemoryPressure, showsValue: Bool) -> NSAttributedString {
    // The menu bar's own size, with tabular digits so values tick in place.
    let font = NSFont.monospacedDigitSystemFont(ofSize: NSFont.menuBarFont(ofSize: 0).pointSize, weight: .medium)
    // AppKit leaves 2 pt between the glyph and the title; the space gives the value room.
    let title = NSMutableAttributedString(string: showsValue ? " " + PanelSummary.menuBarValue(cpu) : "", attributes: [.font: font])
    guard pressure.isElevated,
          let symbol = NSImage(systemSymbolName: pressure.symbol, accessibilityDescription: pressure.label)?.withSymbolConfiguration(
            NSImage.SymbolConfiguration(pointSize: font.pointSize, weight: .medium).applying(.init(paletteColors: [NSColor(pressure.tint)])))
    else { return title }
    symbol.isTemplate = false
    let attachment = NSTextAttachment()
    attachment.image = symbol
    attachment.bounds = CGRect(x: 0, y: (font.capHeight - symbol.size.height) / 2, width: symbol.size.width, height: symbol.size.height)
    title.append(NSAttributedString(string: " ", attributes: [.font: font]))
    title.append(NSAttributedString(attachment: attachment))
    return title
}

/// Owns the menu bar item and the panel it opens.
@MainActor final class StatusItemController: NSObject, NSPopoverDelegate {
    private let activity: ActivityModel
    private let actions: PanelActions
    private let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let popover = NSPopover()
    private(set) var panelContentHeight: CGFloat = 0
    /// The panel's own size, inside the popover's border and arrow.
    private var panelSize = CGSize.zero
    /// The popover's border and arrow, which it draws over its content's edges and reports as safe-area insets.
    /// macOS 26.3 reports 13 pt on every side; the first panel shown corrects this for the running system.
    private var chrome = NSEdgeInsets(top: 13, left: 13, bottom: 13, right: 13)

    var panelWindow: NSWindow? { popover.contentViewController?.view.window }
    var image: NSImage? { item.button?.image }
    /// False while macOS keeps the item off screen, e.g. when the menu bar has no room or the user hid it.
    var isOnScreen: Bool {
        guard let window = item.button?.window else { return false }
        return NSScreen.screens.contains { $0.frame.contains(window.frame) }
    }
    /// False while the open panel scrolls. Expected only on displays shorter than MenuPanelLayout.idealSize;
    /// anywhere else it means idealSize has fallen behind the panel's content.
    var panelContentFits: Bool { panelContentHeight <= panelSize.height + 0.5 }

    init(activity: ActivityModel, actions: PanelActions) {
        self.activity = activity
        self.actions = actions
        super.init()
        item.button?.image = statusGlyph()
        item.button?.target = self
        item.button?.action = #selector(togglePanel)
        popover.behavior = .transient
        // The panel's canvas runs under the arrow too, so the whole popover is one bruhs surface.
        popover.hasFullSizeContent = true
        popover.delegate = self
        update()
    }

    func update() {
        guard let button = item.button else { return }
        let cpu = activity.paused ? nil : activity.snapshot?.cpu.map { percent($0, glance: true) }
        let pressure = activity.paused ? MemoryPressure.unknown : activity.snapshot?.pressure ?? .unknown
        // Every title has the same width (see PanelSummary.menuBarValue), so a variable-length item never
        // changes size as values tick; it grows only while the pressure symbol shows. Icon-only mode drops the
        // value but keeps that symbol, because the warning is what a menu bar monitor is for.
        let glyphOnly = activity.iconOnly && !pressure.isElevated
        let length = glyphOnly ? NSStatusItem.squareLength : NSStatusItem.variableLength
        if item.length != length { item.length = length }
        button.attributedTitle = glyphOnly ? NSAttributedString() : statusTitle(cpu: cpu, pressure: pressure, showsValue: !activity.iconOnly)
        let state = activity.paused
            ? "monitoring paused"
            : "CPU \(cpu.map { $0.replacingOccurrences(of: "%", with: " percent") } ?? "unavailable"), memory pressure \(pressure.label.lowercased())"
        button.setAccessibilityLabel("Pith")
        button.setAccessibilityValue(state)
        button.toolTip = "Pith · \(activity.paused ? "Monitoring paused" : "CPU \(cpu ?? "—") · Memory pressure \(pressure.label.lowercased())")"
    }

    /// The panel runs under the popover's border and arrow (hasFullSizeContent), so the popover is that much larger.
    private func popoverSize(_ panel: CGSize) -> CGSize {
        CGSize(width: panel.width + chrome.left + chrome.right, height: panel.height + chrome.top + chrome.bottom)
    }

    func closePanel() { popover.performClose(nil) }
    func popoverDidClose(_ notification: Notification) { activity.showsDiskSpace = false }

    @objc func togglePanel() {
        guard let button = item.button else { return }
        if popover.isShown { popover.performClose(nil); return }
        guard let window = button.window, let screen = window.screen ?? NSScreen.main else { return }
        let anchor = window.convertToScreen(button.convert(button.bounds, to: nil))
        let size = MenuPanelLayout.contentSize(anchor: anchor, visibleFrame: screen.visibleFrame)
        panelSize = size
        let close: (@escaping () -> Void) -> () -> Void = { [weak self] action in { self?.closePanel(); action() } }
        let panel = MenuPanel(model: activity, size: size, actions: PanelActions(
            openActivity: { [actions, weak self] id in self?.closePanel(); actions.openActivity(id) },
            openDisk: close(actions.openDisk),
            openSettings: close(actions.openSettings)),
            contentHeight: { [weak self] in self?.panelContentHeight = $0 })
        let controller = NSHostingController(rootView: panel)
        controller.sizingOptions = []
        controller.preferredContentSize = popoverSize(size)
        popover.contentViewController = controller
        popover.contentSize = popoverSize(size)
        activity.showsDiskSpace = true
        popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        let reported = controller.view.safeAreaInsets
        if !NSEdgeInsetsEqual(reported, chrome) {
            chrome = reported
            popover.contentSize = popoverSize(size)
        }
        controller.view.window?.makeKey()
    }
}
