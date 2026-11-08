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

/// The menu bar title, which AppKit draws to the left of the glyph: the memory-pressure symbol in its status colour only
/// while pressure is elevated, so the item draws attention only when something is wrong, then the value in fixed digit
/// cells unless `showsValue` is off. The cells pad on the left, so the digits stay against the glyph as they tick.
@MainActor func statusTitle(cpu: String?, memory: String? = nil, pressure: MemoryPressure, showsValue: Bool) -> NSAttributedString {
    // The menu bar's own size, with tabular digits so values tick in place.
    let font = NSFont.monospacedDigitSystemFont(ofSize: NSFont.menuBarFont(ofSize: 0).pointSize, weight: .medium)
    let title = NSMutableAttributedString()
    func text(_ string: String) { title.append(NSAttributedString(string: string, attributes: [.font: font])) }
    func symbol(_ image: NSImage) {
        let attachment = NSTextAttachment()
        attachment.image = image
        attachment.bounds = CGRect(x: 0, y: (font.capHeight - image.size.height) / 2, width: image.size.width, height: image.size.height)
        title.append(NSAttributedString(attachment: attachment))
    }
    if pressure.isElevated,
       let warning = NSImage(systemSymbolName: pressure.symbol, accessibilityDescription: pressure.label)?.withSymbolConfiguration(
        NSImage.SymbolConfiguration(pointSize: font.pointSize, weight: .medium).applying(.init(paletteColors: [NSColor(pressure.tint)]))) {
        warning.isTemplate = false
        symbol(warning)
    }
    // Without a reading, at launch and after waking, the glyph shows alone.
    if showsValue, let cpu = PanelSummary.menuBarValue(cpu) {
        if title.length > 0 { text(" ") }
        text(cpu)
    }
    // Memory in use follows its own small symbol, so the two percents can't be confused.
    if showsValue, let memory = PanelSummary.menuBarValue(memory),
       let chip = NSImage(systemSymbolName: "memorychip", accessibilityDescription: "Memory")?.withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: font.pointSize - 2, weight: .medium)) {
        chip.isTemplate = true
        if title.length > 0 { text(" ") }
        symbol(chip)
        text(memory)
    }
    // AppKit leaves 2 pt between the title and the glyph; the space gives the value room.
    if title.length > 0 { text(" ") }
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
        // The value reads first and the glyph closes the item, nearest the menu bar's other icons.
        item.button?.imagePosition = .imageRight
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
        let shows = activity.menuBarShows
        let cpu = activity.paused || shows == .memory ? nil : activity.snapshot?.cpu.map { percent($0, glance: true) }
        let memoryUse = activity.paused ? nil : activity.snapshot?.memory.map { Double($0.used) / Double(max(1, $0.physical)) * 100 }
        let memory = shows == .cpu ? nil : memoryUse.map { percent($0, glance: true) }
        let pressure = activity.paused ? MemoryPressure.unknown : activity.snapshot?.pressure ?? .unknown
        // Every title has the same width (see PanelSummary.menuBarValue), so a variable-length item never
        // changes size as values tick; it grows only while the pressure symbol shows. Icon-only mode drops the
        // value but keeps that symbol, because the warning is what a menu bar monitor is for.
        let glyphOnly = activity.iconOnly && !pressure.isElevated
        let length = glyphOnly ? NSStatusItem.squareLength : NSStatusItem.variableLength
        if item.length != length { item.length = length }
        let position: NSControl.ImagePosition = glyphOnly ? .imageOnly : .imageRight
        if button.imagePosition != position { button.imagePosition = position }
        button.attributedTitle = glyphOnly ? NSAttributedString() : statusTitle(cpu: cpu, memory: memory, pressure: pressure, showsValue: !activity.iconOnly)
        let spoken = { (value: String?) in value.map { $0.replacingOccurrences(of: "%", with: " percent") } ?? "unavailable" }
        let state = activity.paused
            ? "monitoring paused"
            : [shows == .memory ? nil : "CPU \(spoken(cpu))", shows == .cpu ? nil : "memory used \(spoken(memory))", "memory pressure \(pressure.label.lowercased())"]
                .compactMap { $0 }.joined(separator: ", ")
        button.setAccessibilityLabel("Pith")
        button.setAccessibilityValue(state)
        let readings = activity.paused ? ["Monitoring paused"]
            : [cpu.map { "CPU \($0)" }, memory.map { "Memory used \($0)" }, "Memory pressure \(pressure.label.lowercased())"].compactMap { $0 }
        button.toolTip = (["Pith"] + readings).joined(separator: "\n")
    }

    /// The panel runs under the popover's border and arrow (hasFullSizeContent), so the popover is that much larger.
    private func popoverSize(_ panel: CGSize) -> CGSize {
        CGSize(width: panel.width + chrome.left + chrome.right, height: panel.height + chrome.top + chrome.bottom)
    }

    func closePanel() { popover.performClose(nil) }
    func popoverDidClose(_ notification: Notification) {
        activity.showsDiskSpace = false
        // Each opening builds a fresh panel; a closed one kept would still redraw with every sample.
        popover.contentViewController = nil
    }

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
