import AppKit
import PithCore
import SwiftUI

/// The room around each part of the path bar: the theme's ghost button, set closer, since the parts sit side by side.
private let partPadding = EdgeInsets(top: 3, leading: 6, bottom: 3, trailing: 6)

/// Where the map is, as Finder's path bar shows it: the disk, whose menu lists every disk and Choose Folder, then each
/// folder down to the open one, each with its own icon. The parts sit apart by their icons and spacing alone. A path too
/// long for its room gives way in the middle, so it never widens the window.
struct DiskPathBar: View {
    let model: DiskModel
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.displayScale) private var displayScale

    var body: some View {
        let path = model.folderPath
        let folders = path?.nodes(in: model.result?.root) ?? []
        let appearance: IconAppearance = colorScheme == .dark ? .dark : .light
        let menuIcons = model.choices.map { DiskModel.menuIconRequest($0.url.path, appearance: appearance, scale: displayScale) }
        PathRow(spacing: 2) {
            DiskMenuButton(model: model, volume: path?.volume)
            ForEach(Array(folders.enumerated()), id: \.element.path) { index, folder in
                if index == folders.count - 1 {
                    OpenFolderPart(model: model, folder: folder)
                } else {
                    // Short of room, an enclosing folder shows its icon alone, then gives way altogether.
                    ViewThatFits(in: .horizontal) {
                        EnclosingFolderPart(model: model, folder: folder, showsName: true)
                        EnclosingFolderPart(model: model, folder: folder, showsName: false)
                        Color.clear.frame(width: 0, height: 0)
                    }
                }
            }
        }
        // The icons line up with the caption under the bar, past each part's own inset.
        .padding(.leading, -partPadding.leading)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Path")
        // The disk menu, made on the main thread when it opens, finds its disks' icons already drawn.
        .task(id: menuIcons) {
            for request in menuIcons { _ = await Icons.store.icon(for: request) }
        }
    }
}

/// The path bar's parts in a row, each as wide as `FolderPath.fit` gives it room. An enclosing folder's part given less
/// than its whole width shows its icon alone, and one given none is left out.
private struct PathRow: Layout {
    let spacing: CGFloat

    private func widths(in width: CGFloat?, _ subviews: Subviews) -> [CGFloat] {
        let full = subviews.map { $0.sizeThatFits(.unspecified).width }
        guard let width else { return full }
        let icons = zip(subviews, full).map { subview, full in subview.sizeThatFits(ProposedViewSize(width: max(0, full - 1), height: nil)).width }
        let minimum = subviews.map { $0.sizeThatFits(ProposedViewSize(width: 0, height: nil)).width }
        return FolderPath.fit(full: full, icons: icons, minimum: minimum, spacing: spacing, width: width)
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let shown = zip(subviews, widths(in: proposal.width, subviews)).filter { $0.1 > 0 }
        let height = shown.map { subview, width in subview.sizeThatFits(ProposedViewSize(width: width, height: nil)).height }.max() ?? 0
        return CGSize(width: shown.map(\.1).reduce(0, +) + spacing * CGFloat(max(0, shown.count - 1)), height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        for (subview, width) in zip(subviews, widths(in: bounds.width, subviews)) {
            subview.place(at: CGPoint(x: x, y: bounds.midY), anchor: .leading, proposal: ProposedViewSize(width: width, height: nil))
            if width > 0 { x += width + spacing }
        }
    }
}

/// The path bar's first part: the disk the map is on, by its own icon and name. Its menu lists every disk with its
/// free space, then Choose Folder.
private struct DiskMenuButton: View {
    let model: DiskModel
    let volume: FolderPath.Volume?
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.displayScale) private var displayScale
    @State private var anchor = MenuAnchor()

    var body: some View {
        Button {
            anchor.popUp(model.diskMenu(appearance: colorScheme == .dark ? .dark : .light, scale: displayScale))
        } label: {
            HStack(spacing: 5) {
                if let volume { SystemIconView(key: .item(volume.path)) }
                // Before any map there's no disk to name, only the list of them.
                Text(verbatim: volume?.name ?? "Disks")
                    .font(BruhsType.label)
                    .foregroundStyle(BruhsColor.text)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Image(systemName: "chevron.down")
                    .font(BruhsType.note)
                    .imageScale(.small)
                    .foregroundStyle(BruhsColor.textTertiary)
                    .accessibilityHidden(true)
            }
        }
        .buttonStyle(BruhsButtonStyle(tone: .ghost, padding: partPadding))
        .background(MenuAnchorView(anchor: anchor))
        .help(model.liveMapRuns ? "Choose a disk or a folder to show. The startup disk shows at once; another disk is scanned." : "Choose a disk or a folder to scan.")
        .accessibilityHint("Shows the disks and Choose Folder")
    }
}

/// A folder enclosing the open one, with its icon and, while there's room, its name. Clicking it goes there.
private struct EnclosingFolderPart: View {
    let model: DiskModel
    let folder: DiskNode
    let showsName: Bool

    var body: some View {
        Button { model.show(folder.path) } label: { FolderLabel(model: model, folder: folder, showsName: showsName, isOpen: false) }
            .buttonStyle(BruhsButtonStyle(tone: .ghost, padding: partPadding))
            .disabled(model.isScanning || model.isTrashing)
            .help(folder.path)
            .contextMenu { FolderActions(model: model, path: folder.path) }
            // Its icon alone says nothing to VoiceOver.
            .accessibilityLabel((folder.path as NSString).lastPathComponent)
    }
}

/// The open folder, where the path ends: its name shortens only once nothing else is left to give way.
private struct OpenFolderPart: View {
    let model: DiskModel
    let folder: DiskNode

    var body: some View {
        FolderLabel(model: model, folder: folder, showsName: true, isOpen: true)
            .padding(partPadding)
            .help(folder.path)
            .contextMenu { FolderActions(model: model, path: folder.path) }
            // The breadcrumb the path bar replaced marked it as the current location; VoiceOver hears it as selected.
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isSelected)
    }
}

private struct FolderLabel: View {
    let model: DiskModel
    let folder: DiskNode
    let showsName: Bool
    let isOpen: Bool

    var body: some View {
        HStack(spacing: 5) {
            SystemIconView(key: model.iconKey(for: folder))
            if showsName {
                Text(verbatim: (folder.path as NSString).lastPathComponent)
                    .font(BruhsType.data)
                    .foregroundStyle(isOpen ? BruhsColor.text : BruhsColor.textSecondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
        }
    }
}

/// A path folder's context menu, as Finder's path bar offers.
private struct FolderActions: View {
    let model: DiskModel
    let path: String

    var body: some View {
        Button("Reveal in Finder") { model.reveal(path) }
        Button("Copy Path") { model.copyPath(path) }
    }
}

/// Where the disk menu opens: an AppKit view behind the disk's button, since SwiftUI can't place an NSMenu. It holds
/// the menu while it shows, so the chosen item's action still has it.
@MainActor private final class MenuAnchor {
    weak var view: NSView?
    private var menu: DiskItemMenu?

    /// Opens `menu` under the button, as a pull-down menu opens.
    func popUp(_ menu: DiskItemMenu) {
        guard let view else { return }
        self.menu = menu
        menu.menu.popUp(positioning: nil, at: NSPoint(x: 0, y: view.bounds.height + 2), in: view)
    }
}

private struct MenuAnchorView: NSViewRepresentable {
    let anchor: MenuAnchor

    func makeNSView(context: Context) -> NSView { Anchor() }
    func updateNSView(_ view: NSView, context: Context) { anchor.view = view }

    /// Flipped, so the menu's top meets the button's bottom edge, and never in the way of a click.
    private final class Anchor: NSView {
        override var isFlipped: Bool { true }
        override func hitTest(_ point: NSPoint) -> NSView? { nil }
    }
}

extension DiskModel {
    /// A disk's icon in the disk menu, at the menu's 16 pt, as the icon store draws it. The path bar asks for it ahead of
    /// time, so the menu usually finds it drawn.
    static func menuIconRequest(_ path: String, appearance: IconAppearance, scale: CGFloat) -> IconRequest {
        IconRequest(.item(path), size: IconSize(points: 16, scale: scale), appearance: appearance)
    }

    /// The disk menu: each disk Disk lists, with its icon and free space, then Choose Folder. The startup disk shows
    /// from the live map; another disk is scanned, as Choose Folder scans a folder on one.
    func diskMenu(appearance: IconAppearance, scale: CGFloat) -> DiskItemMenu {
        let menu = DiskItemMenu()
        let busy = isScanning || isTrashing
        let shown = folderPath?.volume.path
        let font = NSFont.menuFont(ofSize: 0)
        // The free space lines up in a column after the longest name.
        let column = (choices.map { ($0.name as NSString).size(withAttributes: [.font: font]).width }.max() ?? 0) + 24
        for volume in choices {
            let item = menu.add(volume.name, enabled: !busy) { [weak self] in self?.show(volume.url.path) }
            let icon = Self.menuIconRequest(volume.url.path, appearance: appearance, scale: scale)
            if let drawn = Icons.store.cachedIcon(for: icon) {
                item.image = drawn.nsImage
            } else {
                // An icon the store hasn't drawn, or has let go, is drawn off the main thread and shows once it's ready,
                // whether the menu is open by then or not.
                Task { item.image = await Icons.store.icon(for: icon)?.nsImage }
            }
            item.state = volume.url.path == shown ? .on : .off
            if let available = volume.available {
                item.attributedTitle = Self.menuTitle(volume.name, free: bytes(available), column: column, font: font)
            }
        }
        menu.separator()
        let choose = menu.add("Choose Folder…", enabled: !busy) { [weak self] in self?.chooseFolder() }
        // ⌘O, as the File menu's Choose Folder.
        choose.keyEquivalent = "o"
        // The free space the menu shows next time is as of now.
        refreshChoices()
        return menu
    }

    /// "Macintosh HD", then its free space as a figure led by its name, "Free 245 GB", at `column`.
    private static func menuTitle(_ name: String, free: String, column: CGFloat, font: NSFont) -> NSAttributedString {
        let paragraph = NSMutableParagraphStyle()
        paragraph.tabStops = [NSTextTab(textAlignment: .left, location: column)]
        let small = NSFont.menuFont(ofSize: NSFont.smallSystemFontSize)
        let title = NSMutableAttributedString(string: name + "\t", attributes: [.font: font, .paragraphStyle: paragraph])
        title.append(NSAttributedString(string: "Free ", attributes: [.font: small, .foregroundColor: NSColor.secondaryLabelColor, .paragraphStyle: paragraph]))
        title.append(NSAttributedString(string: free, attributes: [.font: BruhsType.monaspaceFace(small.pointSize), .foregroundColor: NSColor.secondaryLabelColor,
                                                                   .paragraphStyle: paragraph]))
        return title
    }
}
