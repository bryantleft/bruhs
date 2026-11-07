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
    @Binding var selection: ActivityRowID?
    @Binding var expanded: Set<ActivityRowID>
    @Binding var sort: ActivitySort

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeNSView(context: Context) -> NSScrollView {
        let outline = NSOutlineView()
        outline.style = .fullWidth
        outline.rowHeight = 26
        outline.intercellSpacing = NSSize(width: 10, height: 0)
        outline.backgroundColor = .clear
        outline.indentationPerLevel = 14
        outline.autoresizesOutlineColumn = false
        outline.floatsGroupRows = false
        outline.columnAutoresizingStyle = .firstColumnOnlyAutoresizingStyle
        outline.setAccessibilityLabel("Apps and processes")
        for column in ActivityColumn.allCases {
            let tableColumn = NSTableColumn(identifier: NSUserInterfaceItemIdentifier(column.rawValue))
            tableColumn.title = column.title
            tableColumn.headerToolTip = column.help
            tableColumn.width = column == .name ? 320 : 92
            tableColumn.minWidth = column == .name ? 200 : 64
            tableColumn.sortDescriptorPrototype = NSSortDescriptor(key: column.rawValue, ascending: column == .name)
            if column != .name { tableColumn.headerCell.alignment = .right }
            outline.addTableColumn(tableColumn)
            if column == .name { outline.outlineTableColumn = tableColumn }
        }
        outline.sortDescriptors = [Self.descriptor(sort)]
        outline.dataSource = context.coordinator
        outline.delegate = context.coordinator
        let scroll = NSScrollView()
        scroll.documentView = outline
        scroll.hasVerticalScroller = true
        scroll.autohidesScrollers = true
        scroll.drawsBackground = false
        return scroll
    }

    func updateNSView(_ scroll: NSScrollView, context: Context) {
        guard let outline = scroll.documentView as? NSOutlineView else { return }
        context.coordinator.update(outline, with: self)
    }

    static func descriptor(_ sort: ActivitySort) -> NSSortDescriptor {
        NSSortDescriptor(key: sort.column.rawValue, ascending: sort.ascending)
    }

    @MainActor final class Coordinator: NSObject, NSOutlineViewDataSource, NSOutlineViewDelegate {
        private var table: ActivityTable
        private var roots: [ActivityNode] = []
        private var nodes: [ActivityRowID: ActivityNode] = [:]
        /// True while the coordinator itself changes the outline view, so its callbacks aren't user input.
        private var isUpdating = false
        /// The selection last scrolled into view. A selection made elsewhere (the panel) is revealed once.
        private var revealed: ActivityRowID?

        init(_ table: ActivityTable) { self.table = table }

        func update(_ outline: NSOutlineView, with table: ActivityTable) {
            self.table = table
            isUpdating = true
            defer { isUpdating = false }
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
                cell.show(node)
                return cell
            }
            let cell = outlineView.makeView(withIdentifier: ActivityNumberCell.identifier, owner: nil) as? ActivityNumberCell ?? ActivityNumberCell()
            cell.show(node, column: column)
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
    }
}

extension ActivityColumn {
    var title: String {
        switch self {
        case .name: "App"
        case .cpu: "CPU"
        case .memory: "Memory"
        case .read: "Disk read"
        case .written: "Disk write"
        }
    }

    var help: String {
        switch self {
        case .name: "Apps and the processes they run. macOS's own processes are grouped under System."
        case .cpu: "Share of your whole Mac: 100% means every core is busy."
        case .memory: "Physical memory footprint, summed across an app's processes. Memory they share can count more than once."
        case .read: "Data read from disk per second."
        case .written: "Data written to disk per second."
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

    /// What follows the name: process count, a tool's version or a system process's description.
    var detail: String? {
        switch content {
        case .header: nil
        case .app(let app):
            if !app.isRunning { "Exited" }
            else if app.processCount > 1 { [app.identity.secondaryText, "\(app.processCount) processes"].compactMap { $0 }.joined(separator: " · ") }
            else { app.identity.secondaryText }
        case .helper(let helper, _): helper.count > 1 ? "+\(helper.count - 1)" : nil
        case .system(let system):
            system.protectedCount > 0 ? "\(system.processCount) processes, \(system.protectedCount) protected" : "\(system.processCount) processes"
        }
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

    override func drawSelection(in dirtyRect: NSRect) {
        NSColor(BruhsColor.selection).setFill()
        NSBezierPath(cgPath: Path(roundedRect: bounds.insetBy(dx: 4, dy: 1), cornerRadius: BruhsRadius.seed, style: .continuous).cgPath).fill()
    }

    override func drawBackground(in dirtyRect: NSRect) {
        guard !isHeader else { return }
        BruhsNSColor.hairline.setFill()
        NSRect(x: bounds.minX + 4, y: isFlipped ? bounds.maxY - 1 : bounds.minY, width: bounds.width - 8, height: 1).fill()
    }
}

/// Icon, name and secondary text, in the system font: names and labels aren't data.
final class ActivityNameCell: NSTableCellView {
    static let identifier = NSUserInterfaceItemIdentifier("ActivityName")
    private let icon = NSImageView()
    private let name = NSTextField(labelWithString: "")
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
        // The name keeps its width; the secondary text gives way first.
        name.setContentCompressionResistancePriority(.defaultLow + 1, for: .horizontal)
        detail.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let stack = NSStackView(views: [icon, name, detail])
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

    func show(_ node: ActivityNode) {
        name.stringValue = node.name
        detail.stringValue = node.detail ?? ""
        detail.isHidden = node.detail == nil
        switch node.content {
        case .header:
            icon.isHidden = true
            name.font = .systemFont(ofSize: 11, weight: .semibold)
            name.textColor = NSColor(BruhsColor.textSecondary)
        case .app(let app):
            icon.isHidden = false
            icon.image = AppIconCache.shared.icon(for: app.executable)
            name.font = .systemFont(ofSize: 13)
            name.textColor = NSColor(app.isRunning ? BruhsColor.text : BruhsColor.textSecondary)
        case .helper:
            icon.isHidden = true
            name.font = .systemFont(ofSize: 13)
            name.textColor = NSColor(BruhsColor.textSecondary)
        case .system:
            icon.isHidden = true
            name.font = .systemFont(ofSize: 13, weight: .semibold)
            name.textColor = NSColor(BruhsColor.text)
        }
        let spoken = [node.name, node.detail].compactMap { $0 }.joined(separator: ", ")
        name.setAccessibilityLabel(spoken)
        toolTip = spoken
    }
}

/// A right-aligned figure in Monaspace. Zero is a dim en dash; a value macOS won't give is an
/// em dash that says why.
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

    func show(_ node: ActivityNode, column: ActivityColumn) {
        guard let values = node.values else {
            label.stringValue = ""; toolTip = nil; label.setAccessibilityLabel(nil)
            return
        }
        let figure = ActivityFigure(column, values)
        label.stringValue = figure.text
        switch figure {
        case .unavailable:
            // Monaspace draws em and en dashes alike, so the "unavailable" dash is set in the system font.
            label.font = .systemFont(ofSize: 12)
            label.textColor = NSColor(BruhsColor.textSecondary)
            toolTip = node.isProtected ? "Protected by macOS" : "No reading yet"
        case .zero:
            label.font = Self.font
            label.textColor = NSColor(BruhsColor.textTertiary)
            toolTip = nil
        case .value:
            label.font = Self.font
            label.textColor = NSColor(BruhsColor.text)
            toolTip = nil
        }
        label.setAccessibilityLabel("\(column.title) \(figure.spoken(protected: node.isProtected))")
    }

    private static var font: NSFont {
        let size: CGFloat = 12
        return BruhsFonts.isAvailable ? NSFont(name: "MonaspaceNeonVar-Regular", size: size) ?? .monospacedDigitSystemFont(ofSize: size, weight: .regular)
            : .monospacedDigitSystemFont(ofSize: size, weight: .regular)
    }
}

/// How one figure reads in the table and to VoiceOver.
enum ActivityFigure: Equatable {
    case unavailable
    case zero
    case value(String, spoken: String)

    init(_ column: ActivityColumn, _ values: ActivityListing.Values) {
        switch column {
        case .name:
            self = .unavailable
        case .cpu:
            guard let cpu = values.cpu else { self = .unavailable; return }
            // Below what one decimal can show, the dash says "nothing" more honestly than 0.0%.
            self = cpu < 0.05 ? .zero : .value(percent(cpu), spoken: percent(cpu))
        case .memory:
            guard let memory = values.memory else { self = .unavailable; return }
            self = memory == 0 ? .zero : .value(bytes(memory), spoken: bytes(memory))
        case .read, .written:
            guard let speed = column == .read ? values.read : values.written else { self = .unavailable; return }
            self = speed < 1 ? .zero : .value(rate(speed), spoken: "\(bytes(UInt64(speed))) per second")
        }
    }

    var text: String {
        switch self {
        case .unavailable: "—"
        case .zero: "–"
        case .value(let text, _): text
        }
    }

    func spoken(protected: Bool) -> String {
        switch self {
        case .unavailable: protected ? "unavailable, protected by macOS" : "no reading yet"
        case .zero: "zero"
        case .value(_, let spoken): spoken
        }
    }
}

/// A figure outside the table, drawn the same way: Monaspace numbers, a dim en dash for zero,
/// and a system-font em dash for unavailable, since Monaspace draws both dashes alike.
struct FigureText: View {
    let figure: ActivityFigure
    var color: Color = BruhsColor.textSecondary

    var body: some View {
        Text(figure.text)
            .font(figure == .unavailable ? .system(size: 11) : BruhsType.dataSmall)
            .foregroundStyle(figure == .zero ? BruhsColor.textTertiary : color)
    }
}
