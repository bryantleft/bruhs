import AppKit
import PithCore
import SwiftUI

/// The Activity table. AppKit owns row updates because SwiftUI's Table re-entered its diff when
/// selection changed during the 2 s refresh. Rows are reused by stable id, so selection and
/// disclosure survive re-sorting, and nothing animates.
struct ActivityTable: NSViewRepresentable {
    let listing: ActivityListing
    /// While searching, System opens so matching macOS processes are visible.
    let opensSystem: Bool
    /// True while the table ranks a range, so its columns say they hold averages.
    var ranged = false
    /// The View menu's text size; rows grow with it.
    var textScale: Double = 1
    @Binding var selection: ActivityRowID?
    @Binding var expanded: Set<ActivityRowID>
    @Binding var sort: ActivitySort
    /// Asks to quit a row's app, from its context menu.
    var quit: (ActivityListing.App) -> Void = { _ in }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeNSView(context: Context) -> NSScrollView {
        let outline = ActivityOutlineView()
        outline.style = .fullWidth
        outline.rowHeight = 26
        outline.intercellSpacing = NSSize(width: 10, height: 0)
        outline.backgroundColor = .clear
        outline.indentationPerLevel = 14
        outline.autoresizesOutlineColumn = false
        outline.floatsGroupRows = false
        outline.columnAutoresizingStyle = .firstColumnOnlyAutoresizingStyle
        outline.setAccessibilityLabel("Apps and processes")
        for column in ActivityColumn.allCases where column != .network || SystemSampler.countsNetwork {
            let tableColumn = NSTableColumn(identifier: NSUserInterfaceItemIdentifier(column.rawValue))
            tableColumn.title = column.title
            tableColumn.headerToolTip = column.help
            tableColumn.width = column == .name ? 320 : column == .power ? 76 : 92
            tableColumn.minWidth = column == .name ? 200 : 64
            tableColumn.sortDescriptorPrototype = NSSortDescriptor(key: column.rawValue, ascending: column == .name)
            if column != .name { tableColumn.headerCell.alignment = .right }
            outline.addTableColumn(tableColumn)
            if column == .name { outline.outlineTableColumn = tableColumn }
        }
        outline.sortDescriptors = [Self.descriptor(sort)]
        outline.dataSource = context.coordinator
        outline.delegate = context.coordinator
        context.coordinator.currentOutline = outline
        let menu = NSMenu()
        menu.delegate = context.coordinator
        outline.menu = menu
        let scroll = NSScrollView()
        scroll.documentView = outline
        scroll.hasVerticalScroller = true
        // Past the App column's minimum, a narrow window or Bigger Text scrolls the figures sideways rather than
        // cutting the last off.
        scroll.hasHorizontalScroller = true
        scroll.autohidesScrollers = true
        scroll.drawsBackground = false
        BruhsScroller.install(in: scroll)
        return scroll
    }

    func updateNSView(_ scroll: NSScrollView, context: Context) {
        guard let outline = scroll.documentView as? NSOutlineView else { return }
        context.coordinator.update(outline, with: self)
    }

    static func descriptor(_ sort: ActivitySort) -> NSSortDescriptor {
        NSSortDescriptor(key: sort.column.rawValue, ascending: sort.ascending)
    }

    @MainActor final class Coordinator: NSObject, NSOutlineViewDataSource, NSOutlineViewDelegate, NSMenuDelegate {
        private var table: ActivityTable
        private var roots: [ActivityNode] = []
        private var nodes: [ActivityRowID: ActivityNode] = [:]
        /// True while the coordinator itself changes the outline view, so its callbacks aren't user input.
        private var isUpdating = false
        /// The selection last scrolled into view. A selection made elsewhere (the panel) is revealed once.
        private var revealed: ActivityRowID?

        init(_ table: ActivityTable) { self.table = table }

        private var scale: Double = 1
        private var ranged = false

        func update(_ outline: NSOutlineView, with table: ActivityTable) {
            self.table = table
            isUpdating = true
            defer { isUpdating = false }
            (outline as? ActivityOutlineView)?.copyText = { [weak self, weak outline] in outline.flatMap { self?.copyText(in: $0) } }
            if scale != table.textScale {
                scale = table.textScale
                outline.rowHeight = (26 * scale).rounded()
            }
            if ranged != table.ranged || outline.tableColumns.contains(where: { $0.title.isEmpty }) {
                ranged = table.ranged
                for column in outline.tableColumns {
                    guard let id = ActivityColumn(rawValue: column.identifier.rawValue) else { continue }
                    column.title = id.title(ranged: ranged)
                    column.headerToolTip = id.help(ranged: ranged)
                }
            }
            rebuild(table.listing)
            let descriptor = ActivityTable.descriptor(table.sort)
            if outline.sortDescriptors.first != descriptor { outline.sortDescriptors = [descriptor] }
            outline.reloadData()
            applyDisclosure(roots, in: outline)
            let row = table.selection.flatMap { nodes[$0] }.map(outline.row(forItem:)) ?? -1
            if row >= 0 {
                outline.selectRowIndexes(IndexSet(integer: row), byExtendingSelection: false)
                if revealed != table.selection {
                    outline.scrollRowToVisible(row)
                    revealed = table.selection
                }
            } else {
                outline.deselectAll(nil)
            }
        }

        /// Reuses each id's node object: NSOutlineView tracks items by identity.
        private func rebuild(_ listing: ActivityListing) {
            var next: [ActivityRowID: ActivityNode] = [:]
            func node(_ id: ActivityRowID, _ content: ActivityNode.Content, children: [ActivityNode] = []) -> ActivityNode {
                let node = nodes[id] ?? ActivityNode(id: id)
                node.content = content
                node.children = children
                next[id] = node
                return node
            }
            func app(_ app: ActivityListing.App) -> ActivityNode {
                node(.app(app.id), .app(app), children: app.helpers.map { node(.helper(app: app.id, name: $0.name), .helper($0, restricted: app.restricted)) })
            }
            var roots = listing.apps.isEmpty ? [] : [node(.appsHeader, .header)]
            roots += listing.apps.map(app)
            if let system = listing.system { roots.append(node(.system, .system(system), children: system.apps.map(app))) }
            self.roots = roots
            nodes = next
        }

        private func applyDisclosure(_ level: [ActivityNode], in outline: NSOutlineView) {
            for node in level where !node.children.isEmpty {
                if table.expanded.contains(node.id) || (node.id == .system && table.opensSystem) {
                    outline.expandItem(node)
                    applyDisclosure(node.children, in: outline)
                } else {
                    outline.collapseItem(node)
                }
            }
        }

        // MARK: Data source

        func outlineView(_ outlineView: NSOutlineView, numberOfChildrenOfItem item: Any?) -> Int {
            (item as? ActivityNode)?.children.count ?? roots.count
        }

        func outlineView(_ outlineView: NSOutlineView, child index: Int, ofItem item: Any?) -> Any {
            (item as? ActivityNode)?.children[index] ?? roots[index]
        }

        func outlineView(_ outlineView: NSOutlineView, isItemExpandable item: Any) -> Bool {
            (item as? ActivityNode)?.children.isEmpty == false
        }

        // MARK: Delegate

        func outlineView(_ outlineView: NSOutlineView, viewFor tableColumn: NSTableColumn?, item: Any) -> NSView? {
            guard let node = item as? ActivityNode, let id = tableColumn?.identifier, let column = ActivityColumn(rawValue: id.rawValue) else { return nil }
            if column == .name {
                let cell = outlineView.makeView(withIdentifier: ActivityNameCell.identifier, owner: nil) as? ActivityNameCell ?? ActivityNameCell()
                cell.show(node, scale: scale)
                return cell
            }
            let cell = outlineView.makeView(withIdentifier: ActivityNumberCell.identifier, owner: nil) as? ActivityNumberCell ?? ActivityNumberCell()
            cell.show(node, column: column, scale: scale)
            return cell
        }

        func outlineView(_ outlineView: NSOutlineView, rowViewForItem item: Any) -> NSTableRowView? {
            let row = outlineView.makeView(withIdentifier: ActivityRowView.identifier, owner: nil) as? ActivityRowView ?? ActivityRowView()
            row.isHeader = (item as? ActivityNode)?.id == .appsHeader
            return row
        }

        func outlineView(_ outlineView: NSOutlineView, shouldSelectItem item: Any) -> Bool {
            (item as? ActivityNode)?.id != .appsHeader
        }

        func outlineView(_ outlineView: NSOutlineView, typeSelectStringFor tableColumn: NSTableColumn?, item: Any) -> String? {
            (item as? ActivityNode)?.name
        }

        func outlineViewSelectionDidChange(_ notification: Notification) {
            guard !isUpdating, let outline = notification.object as? NSOutlineView else { return }
            let selected = (outline.item(atRow: outline.selectedRow) as? ActivityNode)?.id
            revealed = selected
            table.selection = selected
        }

        func outlineViewItemDidExpand(_ notification: Notification) {
            guard !isUpdating, let node = notification.userInfo?["NSObject"] as? ActivityNode else { return }
            table.expanded.insert(node.id)
        }

        func outlineViewItemDidCollapse(_ notification: Notification) {
            guard !isUpdating, let node = notification.userInfo?["NSObject"] as? ActivityNode else { return }
            table.expanded.remove(node.id)
        }

        func outlineView(_ outlineView: NSOutlineView, sortDescriptorsDidChange oldDescriptors: [NSSortDescriptor]) {
            guard !isUpdating, let first = outlineView.sortDescriptors.first, let key = first.key, let column = ActivityColumn(rawValue: key) else { return }
            table.sort = ActivitySort(column: column, ascending: first.ascending)
        }

        // MARK: Context menu and copy

        /// The clicked row's actions, as Activity Monitor offers them, built when the menu opens.
        func menuNeedsUpdate(_ menu: NSMenu) {
            menu.removeAllItems()
            guard let outline = currentOutline, outline.clickedRow >= 0, let node = outline.item(atRow: outline.clickedRow) as? ActivityNode else { return }
            let actions = DiskItemMenu()
            if case .app(let app) = node.content {
                let refusal = ProcessControl.refusal(kind: app.identity.kind, members: app.members, isRunning: app.isRunning)
                actions.add("Quit…", enabled: refusal == nil) { [table] in table.quit(app) }
                actions.separator()
                actions.add("Reveal in Finder", enabled: !app.executable.isEmpty) { NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: app.executable)]) }
            }
            actions.add("Copy Name") { Self.copy(node.name) }
            if case .app(let app) = node.content, !app.executable.isEmpty { actions.add("Copy Path") { Self.copy(app.executable) } }
            if let pids = node.pids, !pids.isEmpty { actions.add(pids.count == 1 ? "Copy PID" : "Copy PIDs") { Self.copy(pids.map(String.init).joined(separator: " ")) } }
            for item in actions.menu.items { actions.menu.removeItem(item); menu.addItem(item) }
            menuActions = actions
        }

        /// Keeps the menu's closures alive while it's open.
        private var menuActions: DiskItemMenu?
        weak var currentOutline: NSOutlineView?

        /// The selected row as text: its name, then its path when it has one.
        func copyText(in outline: NSOutlineView) -> String? {
            guard let node = outline.item(atRow: outline.selectedRow) as? ActivityNode else { return nil }
            if case .app(let app) = node.content, !app.executable.isEmpty { return "\(node.name)\n\(app.executable)" }
            return node.name
        }

        static func copy(_ text: String) {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(text, forType: .string)
        }
    }
}

/// The table's outline view: Copy copies the selected row.
final class ActivityOutlineView: NSOutlineView {
    var copyText: (() -> String?)?

    @objc func copy(_ sender: Any?) {
        guard let text = copyText?() else { NSSound.beep(); return }
        ActivityTable.Coordinator.copy(text)
    }

    override func validateUserInterfaceItem(_ item: any NSValidatedUserInterfaceItem) -> Bool {
        if item.action == #selector(copy(_:)) { return selectedRow >= 0 }
        return super.validateUserInterfaceItem(item)
    }
}

extension ActivityColumn {
    var title: String { title(ranged: false) }

    /// While a range is ranked the figures are averages across it, so the headers say so.
    func title(ranged: Bool) -> String {
        switch self {
        case .name: "App"
        case .cpu: ranged ? "Avg CPU" : "CPU"
        case .memory: ranged ? "Avg memory" : "Memory"
        case .power: ranged ? "Avg power" : "Power"
        case .read: ranged ? "Avg read" : "Disk read"
        case .written: ranged ? "Avg write" : "Disk write"
        case .network: ranged ? "Avg network" : "Network"
        }
    }

    var help: String { help(ranged: false) }

    func help(ranged: Bool) -> String {
        switch self {
        case .name: "Apps and the processes they run. macOS's own processes are grouped under System."
        case .cpu: ranged ? "Average share of your whole Mac across the range, counting the time an app wasn't running as idle." : "Share of your whole Mac: 100% means every core is busy. A badge marks an app with a process holding a whole core."
        case .memory: ranged ? "Average footprint while the app ran in the range." : "Physical memory footprint, summed across an app's processes. Memory they share can count more than once."
        case .power: "An estimate in watts, from the energy macOS counts for each process. Protected processes have none."
        case .read: ranged ? "Average data read from disk per second across the range." : "Data read from disk per second."
        case .written: ranged ? "Average data written to disk per second across the range." : "Data written to disk per second."
        case .network: ranged ? "Average data sent and received over the network per second across the range." : "Data sent and received over the network per second."
        }
    }
}

/// One table row's model object. NSOutlineView tracks items by identity, so the coordinator keeps
/// one node per row id and updates its content each sample.
@MainActor final class ActivityNode: NSObject {
    enum Content {
        case header
        case app(ActivityListing.App)
        case helper(ActivityListing.Helper, restricted: Bool)
        case system(ActivityListing.System)
    }

    let id: ActivityRowID
    var content: Content = .header
    var children: [ActivityNode] = []

    init(id: ActivityRowID) { self.id = id }

    var name: String {
        switch content {
        case .header: "Apps"
        case .app(let app): app.identity.displayName
        case .helper(let helper, _): helper.name
        case .system: "System"
        }
    }

    /// How many processes the row stands for, shown as a badge after the name when it's more than one.
    var groupedCount: Int? {
        let count = switch content {
        case .header: 0
        case .app(let app): app.isRunning ? app.processCount : 0
        case .helper(let helper, _): helper.count
        case .system(let system): system.processCount
        }
        return count > 1 ? count : nil
    }

    /// What follows the name in tertiary text: a tool's version, a system process's description, or how many of
    /// System's processes macOS protects.
    var detail: String? {
        switch content {
        case .header, .helper: nil
        case .app(let app): app.isRunning ? app.identity.secondaryText : "Exited"
        case .system(let system): system.protectedCount > 0 ? "\(system.protectedCount) protected" : nil
        }
    }

    /// The row's name and details as one phrase, for VoiceOver and the tooltip.
    var summary: String {
        [name, groupedCount.map(processCount), detail].compactMap { $0 }.joined(separator: ", ")
    }

    var values: ActivityListing.Values? {
        switch content {
        case .header: nil
        case .app(let app): app.values
        case .helper(let helper, _): helper.values
        case .system(let system): system.values
        }
    }

    /// Whether a missing value is macOS refusing access rather than a reading still to come.
    var isProtected: Bool {
        switch content {
        case .header, .system: false
        case .app(let app): app.restricted
        case .helper(_, let restricted): restricted
        }
    }

    /// Whether the row's figures are missing because macOS protects it, so its name carries a lock.
    var isLocked: Bool { isProtected && values?.memory == nil }

    /// One of its processes holds most of a core, which a share of the whole Mac hides.
    var holdsACore: Bool { (values?.cores ?? 0) >= 0.9 }

    /// The row's process IDs, for Copy PID.
    var pids: [Int32]? {
        switch content {
        case .header, .system: nil
        case .app(let app): app.members.map(\.pid).sorted()
        case .helper(let helper, _): helper.pids
        }
    }
}

/// Keeps bruhs text colours on the translucent persimmon selection, rather than AppKit's
/// white-on-accent, and draws the hairline between rows.
final class ActivityRowView: NSTableRowView {
    static let identifier = NSUserInterfaceItemIdentifier("ActivityRow")
    var isHeader = false

    override init(frame: NSRect) {
        super.init(frame: frame)
        identifier = Self.identifier
    }

    required init?(coder: NSCoder) { fatalError("ActivityRowView is created in code") }

    override var interiorBackgroundStyle: NSView.BackgroundStyle { .normal }

    /// The accent marks the selection only while the table has focus, as AppKit's own tables do; otherwise a neutral
    /// fill keeps the row marked without claiming the keyboard. A ring with the fill keeps it visible in light mode,
    /// where the translucent fill alone is faint against the canvas.
    override func drawSelection(in dirtyRect: NSRect) {
        let shape = NSBezierPath(cgPath: Path(roundedRect: bounds.insetBy(dx: 4.5, dy: 1.5), cornerRadius: BruhsRadius.seed, style: .continuous).cgPath)
        if isEmphasized {
            BruhsNSColor.selection.setFill(); shape.fill()
            BruhsNSColor.accent.withAlphaComponent(0.55).setStroke()
        } else {
            BruhsNSColor.text.withAlphaComponent(0.08).setFill(); shape.fill()
            BruhsNSColor.hairline.setStroke()
        }
        shape.lineWidth = 1
        shape.stroke()
    }

    override func drawBackground(in dirtyRect: NSRect) {
        guard !isHeader else { return }
        BruhsNSColor.hairline.setFill()
        NSRect(x: bounds.minX + 4, y: isFlipped ? bounds.maxY - 1 : bounds.minY, width: bounds.width - 8, height: 1).fill()
    }
}

/// Icon, name, process count badge, lock and secondary text. Names are in the system font: they aren't data.
final class ActivityNameCell: NSTableCellView {
    static let identifier = NSUserInterfaceItemIdentifier("ActivityName")
    private let icon = NSImageView()
    private let name = NSTextField(labelWithString: "")
    private let count = CountBadgeView()
    private let core = CountBadgeView()
    private let lock = NSImageView()
    private let detail = NSTextField(labelWithString: "")

    init() {
        super.init(frame: .zero)
        identifier = Self.identifier
        imageView = icon
        textField = name
        icon.imageScaling = .scaleProportionallyUpOrDown
        icon.setAccessibilityElement(false)
        name.lineBreakMode = .byTruncatingTail
        detail.lineBreakMode = .byTruncatingTail
        detail.font = .systemFont(ofSize: 12)
        detail.textColor = NSColor(BruhsColor.textTertiary)
        detail.setAccessibilityElement(false)
        count.setAccessibilityElement(false)
        core.setAccessibilityElement(false)
        core.text = "Full core"
        core.toolTip = "One of its processes keeps a whole core busy. On a Mac with many cores that reads as a small share."
        lock.image = NSImage(systemSymbolName: "lock.fill", accessibilityDescription: nil)?
            .withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: 9, weight: .semibold))
        lock.contentTintColor = BruhsNSColor.textTertiary
        lock.toolTip = "Protected by macOS, so Pith can't read its CPU, memory or disk activity"
        lock.setAccessibilityElement(false)
        // The name keeps its width and the marks after it never shrink; the secondary text gives way first.
        name.setContentCompressionResistancePriority(.defaultLow + 1, for: .horizontal)
        detail.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        for mark in [count, core, lock] as [NSView] {
            mark.setContentCompressionResistancePriority(.required, for: .horizontal)
            mark.setContentHuggingPriority(.required, for: .horizontal)
        }
        let stack = NSStackView(views: [icon, name, count, core, lock, detail])
        stack.orientation = .horizontal
        stack.spacing = 6
        stack.alignment = .centerY
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            icon.widthAnchor.constraint(equalToConstant: 16), icon.heightAnchor.constraint(equalToConstant: 16),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 2),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -2),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
    }

    required init?(coder: NSCoder) { fatalError("ActivityNameCell is created in code") }

    func show(_ node: ActivityNode, scale: Double = 1) {
        let size = { (points: CGFloat) in (points * scale).rounded() }
        name.stringValue = node.name
        count.scale = scale
        count.count = node.groupedCount ?? 0
        count.isHidden = node.groupedCount == nil
        core.scale = scale
        core.isHidden = !node.holdsACore
        lock.isHidden = !node.isLocked
        detail.stringValue = node.detail ?? ""
        detail.isHidden = node.detail == nil
        detail.font = .systemFont(ofSize: size(12))
        switch node.content {
        case .header:
            icon.isHidden = true
            name.font = .systemFont(ofSize: size(11), weight: .semibold)
            name.textColor = NSColor(BruhsColor.textSecondary)
        case .app(let app):
            icon.isHidden = false
            icon.image = AppIconCache.shared.icon(for: app.executable)
            name.font = .systemFont(ofSize: size(13))
            name.textColor = NSColor(app.isRunning ? BruhsColor.text : BruhsColor.textSecondary)
        case .helper:
            icon.isHidden = true
            name.font = .systemFont(ofSize: size(13))
            name.textColor = NSColor(BruhsColor.textSecondary)
        case .system:
            icon.isHidden = true
            name.font = .systemFont(ofSize: size(13), weight: .semibold)
            name.textColor = NSColor(BruhsColor.text)
        }
        var spoken = node.isLocked ? "\(node.summary), protected by macOS" : node.summary
        if node.holdsACore { spoken += ", holds a whole core" }
        name.setAccessibilityLabel(spoken)
        toolTip = spoken
    }
}

/// A process count or short tag beside a row's name, drawn like BruhsBadge: Monaspace digits, or system text for
/// words, in a rounded box with a hairline ring.
final class CountBadgeView: NSView {
    var count = 0 {
        didSet { if count != oldValue { invalidateIntrinsicContentSize(); needsDisplay = true } }
    }
    /// A word instead of a count, such as "Full core".
    var text: String? {
        didSet { if text != oldValue { invalidateIntrinsicContentSize(); needsDisplay = true } }
    }
    var scale: Double = 1 {
        didSet { if scale != oldValue { invalidateIntrinsicContentSize(); needsDisplay = true } }
    }

    private var label: NSAttributedString {
        let size = (10.5 * scale).rounded(.toNearestOrAwayFromZero)
        if let text {
            return NSAttributedString(string: text, attributes: [.font: NSFont.systemFont(ofSize: size, weight: .medium), .foregroundColor: BruhsNSColor.textSecondary])
        }
        let font = BruhsFonts.isAvailable ? NSFont(name: "MonaspaceNeonVar-Regular", size: size) : nil
        return NSAttributedString(string: String(count), attributes: [
            .font: font ?? .monospacedDigitSystemFont(ofSize: size, weight: .regular),
            .foregroundColor: BruhsNSColor.textSecondary,
        ])
    }

    override var intrinsicContentSize: NSSize {
        let size = label.size()
        return NSSize(width: ceil(size.width) + 10, height: ceil(size.height) + 3)
    }

    // AppKit draws with the view's appearance current, so the dynamic roles resolve for light, dark and Increase Contrast here.
    override func draw(_ dirtyRect: NSRect) {
        let box = bounds.insetBy(dx: 0.5, dy: 0.5)
        let radius = min(BruhsRadius.grape, box.height / 2)
        let shape = NSBezierPath(roundedRect: box, xRadius: radius, yRadius: radius)
        BruhsNSColor.text.withAlphaComponent(0.06).setFill()
        shape.fill()
        BruhsNSColor.hairline.setStroke()
        shape.lineWidth = 1
        shape.stroke()
        let label = label
        let size = label.size()
        label.draw(at: NSPoint(x: (bounds.width - size.width) / 2, y: (bounds.height - size.height) / 2))
    }
}

/// A right-aligned figure in Monaspace. Idle and unread figures stay empty, so busy rows stand out; a row macOS
/// protects says so once, with the lock after its name.
final class ActivityNumberCell: NSTableCellView {
    static let identifier = NSUserInterfaceItemIdentifier("ActivityNumber")
    private let label = NSTextField(labelWithString: "")

    init() {
        super.init(frame: .zero)
        identifier = Self.identifier
        textField = label
        label.alignment = .right
        label.lineBreakMode = .byClipping
        label.translatesAutoresizingMaskIntoConstraints = false
        addSubview(label)
        NSLayoutConstraint.activate([
            label.leadingAnchor.constraint(equalTo: leadingAnchor),
            label.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -2),
            label.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
    }

    required init?(coder: NSCoder) { fatalError("ActivityNumberCell is created in code") }

    func show(_ node: ActivityNode, column: ActivityColumn, scale: Double = 1) {
        guard let values = node.values else {
            label.stringValue = ""; toolTip = nil; label.setAccessibilityLabel(nil)
            return
        }
        let figure = ActivityFigure(column, values)
        label.font = Self.font(scale)
        label.textColor = BruhsNSColor.text
        switch figure {
        case .unavailable:
            label.stringValue = ""
            toolTip = node.isProtected ? "Protected by macOS" : "No reading yet"
        case .zero(let zero):
            label.stringValue = ""
            toolTip = zero
        case .value(let text, _, _):
            label.stringValue = text
            toolTip = nil
        }
        label.setAccessibilityLabel("\(column.title) \(figure.spoken(protected: node.isProtected))")
    }

    private static func font(_ scale: Double) -> NSFont {
        let size: CGFloat = (12 * scale).rounded()
        return BruhsFonts.isAvailable ? NSFont(name: "MonaspaceNeonVar-Regular", size: size) ?? .monospacedDigitSystemFont(ofSize: size, weight: .regular)
            : .monospacedDigitSystemFont(ofSize: size, weight: .regular)
    }
}

/// How one figure reads in the table and to VoiceOver.
enum ActivityFigure: Equatable {
    /// No reading: macOS protects the process, or the first sample with a rate hasn't arrived.
    case unavailable
    /// Below what the figure can show, such as CPU under 0.05%. Lists leave it empty; a labelled figure shows it, as "0%".
    case zero(String)
    /// The figure as shown and as spoken, and the number behind it, whose rise or fall sets which way its digits spin.
    case value(String, spoken: String, amount: Double)

    init(_ column: ActivityColumn, _ values: ActivityListing.Values) {
        switch column {
        case .name:
            self = .unavailable
        case .cpu:
            guard let cpu = values.cpu else { self = .unavailable; return }
            // Below what one decimal can show, "0%" is more honest than 0.0%.
            self = cpu < 0.05 ? .zero("0%") : .value(percent(cpu), spoken: percent(cpu), amount: cpu)
        case .memory:
            guard let memory = values.memory else { self = .unavailable; return }
            self = memory == 0 ? .zero(memorySize(0)) : .value(memorySize(memory), spoken: memorySize(memory), amount: Double(memory))
        case .power:
            guard let power = values.power else { self = .unavailable; return }
            self = power < 0.05 ? .zero("0 W") : .value(watts(power), spoken: "\(watts(power).replacingOccurrences(of: " W", with: "")) watts", amount: power)
        case .read, .written, .network:
            guard let speed = column == .read ? values.read : column == .written ? values.written : values.network else { self = .unavailable; return }
            self = speed < 1 ? .zero(rate(0)) : .value(rate(speed), spoken: "\(bytes(UInt64(speed))) per second", amount: speed)
        }
    }

    func spoken(protected: Bool) -> String {
        switch self {
        case .unavailable: protected ? "unavailable, protected by macOS" : "no reading yet"
        case .zero: "zero"
        case .value(_, let spoken, _): spoken
        }
    }

    /// The number behind the figure: zero below what it can show, nil without a reading.
    var amount: Double? {
        switch self {
        case .unavailable: nil
        case .zero: 0
        case .value(_, _, let amount): amount
        }
    }
}

/// A figure outside the table, in Monaspace. Like the table, a list leaves idle and unread figures empty; set
/// `showsZero` where the figure has its own label, so "Read" never stands beside nothing.
struct FigureText: View {
    let figure: ActivityFigure
    var color: NSColor = BruhsNSColor.textSecondary
    var showsZero = false

    var body: some View {
        FlowText(text, amount: figure.amount, face: BruhsType.dataSmallFace, color: tint)
    }

    private var text: String {
        switch figure {
        case .unavailable: ""
        case .zero(let zero): showsZero ? zero : ""
        case .value(let text, _, _): text
        }
    }

    private var tint: NSColor { if case .zero = figure { BruhsNSColor.textTertiary } else { color } }
}
