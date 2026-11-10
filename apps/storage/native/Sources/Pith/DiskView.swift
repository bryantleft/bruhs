import SwiftUI
import WebKit
import PithCore

struct DiskView: View {
    let model: DiskModel
    /// False while another tab shows. The view stays alive so the map keeps its open folder and highlight.
    let visible: Bool
    let webCreated: (WKWebView) -> Void
    @Environment(\.undoManager) private var undoManager

    var body: some View {
        VStack(spacing: 0) {
            DiskControlBar(model: model)
            DiskNotices(model: model)
            Rectangle().fill(BruhsColor.hairline).frame(height: 1)
            ZStack(alignment: .top) {
                // While a scan runs the map keeps the earlier scan, dimmed, until the new one arrives.
                DiskWebView(model: model, visible: visible && model.result != nil, textScale: TextSize.shared.scale, created: webCreated)
                    .opacity(model.result == nil ? 0 : model.isScanning ? 0.35 : 1)
                    .allowsHitTesting(model.result != nil && !model.isScanning)
                    .accessibilityHidden(model.result == nil || model.isScanning)
                if model.result == nil {
                    if let live = model.live, model.liveView != nil, !live.state.isFailed {
                        LiveMapWaiting(live: live)
                    } else if model.isScanning {
                        VStack(spacing: 10) {
                            BruhsSpinner(diameter: 24, lineWidth: 2.5).accessibilityLabel("Scanning")
                            Text("The map appears when the scan finishes.").font(BruhsType.body).foregroundStyle(BruhsColor.textSecondary)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        DiskVolumeList(model: model)
                    }
                } else if model.isScanning {
                    Text(model.rescanning.map { "Scanning \(URL(fileURLWithPath: $0).lastPathComponent) again. The map updates when it finishes." }
                         ?? "Showing the earlier scan until this one finishes.")
                        .font(BruhsType.body)
                        .foregroundStyle(BruhsColor.text)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(BruhsColor.surface, in: Capsule())
                        .overlay(Capsule().strokeBorder(BruhsColor.hairline, lineWidth: 1))
                        .padding(.top, 14)
                }
            }
            // Always there while a map is: appearing on a selection would shrink the map under the pointer, so the second
            // click of a double-click could land on another block. Without a selection it describes the open folder.
            if let result = model.result {
                if !model.selectedItems.isEmpty {
                    DiskSelectionBar(model: model, items: model.selectedItems, isSelection: true, plan: model.selectedPlan) {
                        model.requestTrash(model.selection.paths, undoManager: undoManager)
                    }
                } else {
                    let folder = model.openFolder.flatMap { result.item(at: $0) } ?? result.root
                    DiskSelectionBar(model: model, items: [folder], isSelection: false, plan: nil) {}
                }
            }
        }
        .onAppear {
            model.refreshChoices()
            model.visibilityChanged(visible)
            Icons.prepare()
        }
        .onChange(of: visible) { _, now in model.visibilityChanged(now) }
        .onDisappear { model.visibilityChanged(false) }
        // One question for the whole move, listing what it does to each item that syncs or is a Photos library.
        .alert(model.confirming?.question ?? "", isPresented: Binding(get: { model.confirming != nil }, set: { if !$0 { model.confirming = nil } })) {
            Button("Cancel", role: .cancel) { model.confirming = nil }
            Button("Move to Trash", role: .destructive) {
                if let batch = model.confirming { model.trash(batch, undoManager: undoManager) }
                model.confirming = nil
            }
        } message: {
            Text(model.confirming?.confirmation ?? "")
        }
    }
}

/// "Where the space is" for a map of a whole volume: a link to its popover, which a click on the map's Not measured block
/// opens too. While a scan runs, the map it accounts for stays on screen, dimmed, and takes no clicks, so the link stays
/// and is the way to it.
struct WhereTheSpaceIsLink: View {
    let model: DiskModel

    private var showsWhereTheSpaceIs: Binding<Bool> {
        Binding(get: { model.showsWhereTheSpaceIs }, set: { model.showsWhereTheSpaceIs = $0 })
    }

    var body: some View {
        if let rows = model.spaceRows {
            Button("Where the space is") { model.showsWhereTheSpaceIs.toggle() }
                .buttonStyle(.link)
                .font(BruhsType.note)
                .foregroundStyle(BruhsColor.accent)
                .popover(isPresented: showsWhereTheSpaceIs, arrowEdge: .bottom) { WhereTheSpaceIsView(rows: rows) }
                .help("What the disk’s used space holds, including what the scan couldn’t measure")
                // Gone with the link, so it doesn't open again by itself when the link comes back.
                .onDisappear { model.showsWhereTheSpaceIs = false }
        }
    }
}

/// Where the map is, as one path from the disk down, with a caption on what the map holds and Cancel while a scan runs.
private struct DiskControlBar: View {
    let model: DiskModel

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                DiskPathBar(model: model)
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    switch model.caption {
                    case .message(let message)?:
                        Text(message)
                            .font(BruhsType.note)
                            .foregroundStyle(BruhsColor.textSecondary)
                            .lineLimit(1)
                    case .figures(let figures)?:
                        ForEach(figures, id: \.self) { LabeledFigure(label: $0.label, value: $0.value) }
                    case nil:
                        EmptyView()
                    }
                    if model.liveView == nil, model.result != nil, !model.isScanning, !model.changes.isEmpty {
                        let count = model.changes.count
                        Text(model.changes.everything || count == 0 ? "Folders changed since then." : "\(count.formatted()) \(count == 1 ? "folder" : "folders") changed since then.")
                            .font(BruhsType.note)
                            .foregroundStyle(BruhsColor.textSecondary)
                            .lineLimit(1)
                        Button("Refresh") { model.refresh() }
                            .buttonStyle(.link)
                            .font(BruhsType.note)
                            .foregroundStyle(BruhsColor.accent)
                            .disabled(model.isTrashing)
                            .help(model.changes.everything
                                  ? "macOS lost track of some changes, so this scans the whole folder again."
                                  : "Scan the folders that changed again, and put them in their places on the map.")
                    }
                    WhereTheSpaceIsLink(model: model)
                }
            }
            Spacer(minLength: 12)
            if model.isScanning {
                BruhsSpinner(diameter: 14, lineWidth: 2)
                    .accessibilityLabel("Scanning")
                Button("Cancel") { model.cancel() }
                    .buttonStyle(.bruhsGhost)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(minHeight: 52)
    }
}

/// Problems, the last move to the Trash, folders macOS is asking about, and folders the scan couldn't read, each with
/// its one action. The smoke test draws them too, so they aren't private.
struct DiskNotices: View {
    let model: DiskModel
    @State private var showsUnreadable = false

    var body: some View {
        if let problem = model.problem {
            DiskNotice(symbol: "exclamationmark.triangle.fill", tint: BruhsColor.statusCritical, message: problem.message) {
                if problem.offersDiskAccess {
                    Button("Full Disk Access…") { openDiskAccess() }
                        .buttonStyle(.bruhsGhost)
                        .help("Grant Pith access in System Settings, then scan again.")
                }
                Button { model.problem = nil } label: { Image(systemName: "xmark") }
                    .buttonStyle(.bruhsGhost)
                    .help("Dismiss")
                    .accessibilityLabel("Dismiss")
            }
        }
        if let moved = model.trashed {
            DiskNotice(symbol: "trash", tint: BruhsColor.textSecondary, message: moved.note) {
                Button("Undo") { model.undoTrash() }
                    .buttonStyle(.bruhsGhost)
                    .help(moved.moves.count == 1 ? "Put it back where it was (⌘Z)" : "Put them back where they were (⌘Z)")
                Button { model.dismissTrashNote() } label: { Image(systemName: "xmark") }
                    .buttonStyle(.bruhsGhost)
                    .help("Dismiss")
                    .accessibilityLabel("Dismiss")
            }
        }
        if let folders = model.askingFolders {
            AskingNoticeView(folders: folders)
        }
        if let result = model.result, result.summary.errors > 0 {
            DiskNotice(symbol: "lock.fill", tint: BruhsColor.statusWarning, message: unreadableMessage(result.summary)) {
                Button(showsUnreadable ? "Hide Folders" : "Show Folders") { showsUnreadable.toggle() }
                    .buttonStyle(.bruhsGhost)
                    .popover(isPresented: $showsUnreadable, arrowEdge: .bottom) { UnreadableList(model: model, folders: result.unreadableFolders, total: result.summary.errors) }
                if result.summary.unreadable.protected > 0 {
                    Button("Full Disk Access…") { openDiskAccess() }
                        .buttonStyle(.bruhsGhost)
                        .help(model.liveView == nil ? "Grant Pith access in System Settings, then scan again." : "Grant Pith access in System Settings, then read them again.")
                    if model.liveView != nil {
                        Button("Read Again") { model.retryUnreadable() }
                            .buttonStyle(.bruhsGhost)
                            .help("Read the folders the map couldn’t, as after Full Disk Access is granted.")
                    }
                }
            }
        }
    }

    /// Which of the folders Full Disk Access would open up, since it can't help with the rest.
    private func unreadableMessage(_ summary: DiskSummary) -> String {
        let total = summary.errors, protected = summary.unreadable.protected
        let folders = "\(total.formatted()) \(total == 1 ? "folder" : "folders")"
        if protected == total { return "\(folders) couldn’t be read, so this map leaves them out. macOS protects them; Full Disk Access lets Pith read them." }
        if protected == 0 { return "\(folders) couldn’t be read, so this map leaves them out. They belong to macOS or another user." }
        return "\(folders) couldn’t be read, so this map leaves them out. Full Disk Access lets Pith read \(protected.formatted()) of them; the rest belong to macOS or another user."
    }
}

/// macOS asking the person whether Pith may read some of the live map's folders, which the map goes on without until
/// they answer (`AskingNotice`): what answering does, or Full Disk Access, which the button opens in System Settings. The
/// caption keeps its own status meanwhile.
private struct AskingNoticeView: View {
    let folders: Int

    var body: some View {
        DiskNotice(symbol: AskingNotice.symbol, tint: BruhsColor.statusWarning, message: AskingNotice.sentence(folders: folders)) {
            Button("Full Disk Access…") { openDiskAccess() }
                .buttonStyle(.bruhsGhost)
                .help("Give Pith Full Disk Access in System Settings, so it can read these folders without asking.")
        }
    }
}

/// The folders a scan couldn't read, with why, so the user can see what Full Disk Access would change. The smoke test
/// draws it too, so it isn't private.
struct UnreadableList: View {
    let model: DiskModel
    let folders: [DiskUnreadableFolder]
    let total: UInt64

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Folders the scan couldn’t read").font(BruhsType.label).foregroundStyle(BruhsColor.text)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 4) {
                    ForEach(folders, id: \.path) { folder in
                        HStack(spacing: 8) {
                            // The app the folder belongs to, when Pith can tell without looking the folder up.
                            SystemIconView(key: model.ownerKey(for: folder.path))
                            Text(folder.path)
                                .font(BruhsType.dataSmall)
                                .foregroundStyle(BruhsColor.text)
                                .lineLimit(1)
                                .truncationMode(.middle)
                                .help(folder.path)
                            Spacer(minLength: 8)
                            BruhsBadge(text: folder.reason == .protected ? "Needs access" : folder.reason == .denied ? "No permission" : "Unreadable")
                        }
                        .contextMenu {
                            Button("Reveal in Finder") { model.reveal([folder.path]) }
                            Button("Copy Path") { model.copyPath([folder.path]) }
                        }
                    }
                }
                .bruhsScrollers(inset: 4)
            }
            .frame(maxHeight: 280)
            if total > UInt64(folders.count) {
                Text("And \((total - UInt64(folders.count)).formatted()) more, deeper down.").font(BruhsType.note).foregroundStyle(BruhsColor.textTertiary)
            }
        }
        .padding(16)
        .frame(width: 460, alignment: .leading)
        .background(BruhsColor.canvas)
    }
}

/// A one-line message about the scan, its symbol and colour repeating what the words say.
private struct DiskNotice<Action: View>: View {
    let symbol: String
    let tint: Color
    let message: String
    @ViewBuilder var action: Action

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: symbol)
                .foregroundStyle(tint)
                .accessibilityHidden(true)
            Text(message)
                .foregroundStyle(BruhsColor.text)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 12)
            action
        }
        .font(BruhsType.body)
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
    }
}

extension DiskNotice where Action == EmptyView {
    init(symbol: String, tint: Color, message: String) {
        self.init(symbol: symbol, tint: tint, message: message) { EmptyView() }
    }
}

/// What shows before the live map's first tree: the first walk with why it's needed, or the saved map opening.
private struct LiveMapWaiting: View {
    let live: LiveMap

    var body: some View {
        VStack(spacing: 10) {
            BruhsSpinner(diameter: 24, lineWidth: 2.5).accessibilityLabel(title)
            Text(title).font(BruhsType.label).foregroundStyle(BruhsColor.text)
            if let detail {
                Text(detail)
                    .font(BruhsType.body)
                    .foregroundStyle(BruhsColor.textSecondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 420)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var title: String {
        switch live.state {
        case .mapping: "Mapping the startup disk"
        case .catchingUp: "Catching up"
        default: "Opening the map"
        }
    }

    private var detail: String? {
        switch live.state {
        case .mapping where live.asking > 0:
            return "macOS is asking whether Pith may read some folders. Pith maps the rest meanwhile, and adds those once you answer."
        case .mapping:
            if let reason = live.rebuildReason { return "\(reason) Pith maps the disk again, in about a minute, and keeps it current after." }
            return "Pith maps the disk once, in about a minute. After that the map keeps itself current as files change, with no scans."
        case .catchingUp: return "Pith is listing what changed while it was closed."
        default: return nil
        }
    }
}

/// The volumes to scan, when the live map can't run: each with its capacity, as Finder's sidebar lists them.
private struct DiskVolumeList: View {
    let model: DiskModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text("Disks").font(BruhsType.sectionTitle).foregroundStyle(BruhsColor.textTertiary).accessibilityAddTraits(.isHeader)
                ForEach(model.choices) { volume in
                    HStack(spacing: 14) {
                        // Drawn off the main thread by the icon store, as every icon on Disk is.
                        SystemIconView(key: .item(volume.url.path), size: 32)
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text(volume.name).font(BruhsType.label).foregroundStyle(BruhsColor.text).lineLimit(1)
                                if volume.isStartup { BruhsBadge(text: "Startup disk") }
                            }
                            if let total = volume.total, let available = volume.available, total > 0 {
                                CapacityBar(used: 1 - Double(available) / Double(total))
                                HStack(spacing: 12) {
                                    LabeledFigure(label: "Free", value: bytes(available))
                                    LabeledFigure(label: "Capacity", value: bytes(total))
                                }
                            }
                        }
                        Spacer(minLength: 12)
                        Button("Scan") { model.scan(volume.url) }
                            .buttonStyle(.bruhsSoft)
                            .help("Map what takes up space on \(volume.name)")
                    }
                    .padding(14)
                    .bruhsWell(radius: BruhsRadius.lychee)
                    .accessibilityElement(children: .contain)
                }
            }
            .frame(maxWidth: 520)
            .padding(24)
            .frame(maxWidth: .infinity)
            .bruhsScrollers()
        }
    }
}

/// The selected item, led by its icon and path, or several, led by the group's icon and how many, with their combined
/// figures; or the open folder's figures while nothing is selected, since the path bar names the open folder; and what
/// can be done with them.
private struct DiskSelectionBar: View {
    let model: DiskModel
    /// What it describes: the items selected, or the open folder alone.
    let items: [DiskNode]
    /// False while it describes the open folder, which Move to Trash never targets from here.
    let isSelection: Bool
    let plan: Result<TrashBatch, DiskFailure>?
    let trash: () -> Void

    /// The one item it describes, whose own path and figures show; nil for several.
    private var item: DiskNode? { items.count == 1 ? items.first : nil }
    private var paths: [String] { items.map(\.path) }
    /// Their combined size, which counts nothing twice: no item selected is inside another.
    private var size: UInt64 { items.reduce(0) { $0 + $1.size } }

    private var refusal: String? {
        if case .failure(let failure)? = plan { return failure.message }
        return nil
    }
    private var asks: Bool { (try? plan?.get())?.asks == true }

    private func pathText(_ path: String) -> some View {
        Text(path)
            .font(BruhsType.dataSmall)
            .foregroundStyle(BruhsColor.text)
            .lineLimit(1)
            .truncationMode(.middle)
            .textSelection(.enabled)
            .help(path)
    }

    /// Size, then for one item its Files and Clones, and Frees now when deleting frees less than the size.
    private func figures(files: Bool, clones: Bool) -> some View {
        HStack(spacing: 10) {
            LabeledFigure(label: "Size", value: bytes(size))
            if let item {
                if files, item.kind == .dir { LabeledFigure(label: "Files", value: monaspaced(item.fileCount.formatted())) }
                if clones, let shared = item.clones, shared >= 1_000_000 {
                    LabeledFigure(label: "Clones", value: bytes(shared))
                        .help("It also holds \(bytes(shared)) of APFS clones. Each shares its blocks with another copy, which the map counts instead, so the size leaves them out.")
                }
            }
            // Clones, hard links and snapshots outside them keep the blocks they share, so deleting them can free less. A
            // figure from before the items changed says it's from then, not now, and its help says when Pith measured it
            // and when it measures them again.
            if isSelection, let frees = model.selectedFrees, let age = model.freesAge, frees.bytes + 1_000_000 < size {
                LabeledFigure(label: age.isCurrent ? "Frees now" : "Frees", value: bytes(frees.bytes))
                    .help(frees.help(several: item == nil, age: age))
            }
        }
        .fixedSize()
    }

    var body: some View {
        HStack(spacing: 12) {
            if isSelection {
                HStack(spacing: 6) {
                    if let item {
                        SystemIconView(key: model.iconKey(for: item))
                        // A short path shows whole; a long one truncates in its middle at a third of a narrow window, so the
                        // figures keep their room.
                        ViewThatFits(in: .horizontal) {
                            pathText(item.path).fixedSize()
                            pathText(item.path).frame(maxWidth: 260, alignment: .leading)
                        }
                    } else {
                        // Several: the group's icon, as the map's smaller items have, and how many, a figure then a word.
                        SystemIconView(key: .group)
                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text(verbatim: monaspaced(items.count.formatted())).font(BruhsType.dataSmall)
                            Text("items").font(BruhsType.note)
                        }
                        .foregroundStyle(BruhsColor.text)
                        .fixedSize()
                        .accessibilityElement(children: .combine)
                    }
                }
                .layoutPriority(2)
            }
            // The buttons keep their labels; at narrow widths the figures give way, Files first, then Clones.
            ViewThatFits(in: .horizontal) {
                figures(files: true, clones: true)
                figures(files: false, clones: true)
                figures(files: false, clones: false)
            }
            .layoutPriority(1)
            Spacer(minLength: 12)
            if model.liveView == nil, let item, item.kind == .dir, model.changes.touches(item.path), !model.isScanning {
                Button("Scan Again") { model.rescan(item.path) }
                    .buttonStyle(.bruhsGhost)
                    .fixedSize()
                    .disabled(model.isTrashing)
                    .help("Something in it changed since the scan. Scan it again to update its size.")
            }
            // Quick Look goes through every item selected, as Finder's does.
            Button("Quick Look") { model.quickLook(paths) }
                .buttonStyle(.bruhsGhost)
                .fixedSize()
                .help(item == nil ? "Preview them (Space)" : "Preview it (Space)")
            Button("Reveal in Finder") { model.reveal(paths) }
                .buttonStyle(.bruhsGhost)
                .fixedSize()
            if isSelection {
                Button(asks ? "Move to Trash…" : "Move to Trash", action: trash)
                    .buttonStyle(.bruhsSoftDanger)
                    .fixedSize()
                    .disabled(refusal != nil || model.isScanning || model.isTrashing)
                    .help(refusal ?? (item == nil ? "Move them to the Trash (⌘⌫). You can undo this." : "Move it to the Trash (⌘⌫). You can undo this."))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .overlay(alignment: .top) {
            Rectangle().fill(BruhsColor.hairline).frame(height: 1)
        }
    }
}

struct DiskWebView: NSViewRepresentable {
    let model: DiskModel
    let visible: Bool
    /// The View menu's text size. The page zooms by it, so the map's labels and lists grow with the rest of Pith.
    let textScale: Double
    let created: (WKWebView) -> Void
    /// Light or dark, which the page's icons are drawn in.
    @Environment(\.colorScheme) private var colorScheme
    func makeCoordinator() -> Coordinator { Coordinator(model: model) }
    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.setURLSchemeHandler(BundledAssets { [weak model] url in model?.iconRequest(for: url) }, forURLScheme: "pith")
        config.userContentController.add(context.coordinator, name: "pith")
        // Tab reaches the map's buttons even when the Mac's Keyboard navigation setting is off.
        config.preferences.tabFocusesLinks = true
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        // One surface: the page is transparent, so the web view mustn't paint its own white
        // page behind it. macOS has no public switch for that; this key is WebKit's own.
        if view.responds(to: Selector(("_setDrawsBackground:"))) {
            view.setValue(false, forKey: "drawsBackground")
        } else {
            assertionFailure("WKWebView no longer takes drawsBackground, so the disk map paints a page behind it.")
        }
        view.underPageBackgroundColor = .clear
        context.coordinator.web = view
        context.coordinator.followDisplayOptions()
        context.coordinator.followOwners()
        model.pageCommand = { [weak coordinator = context.coordinator] command in coordinator?.run(command) }
        created(view)
        view.pageZoom = textScale
        if let url = URL(string: "pith://app/index.html") { view.load(URLRequest(url: url)) }
        return view
    }
    func updateNSView(_ nsView: WKWebView, context: Context) {
        // Hidden, it leaves the key view loop and can't take a click, but its page and open folder stay.
        if nsView.isHidden == visible { nsView.isHidden = !visible }
        if nsView.pageZoom != textScale { nsView.pageZoom = textScale }
        context.coordinator.iconAppearance = IconAppearance(colorScheme)
        context.coordinator.iconRule = model.iconRule
        context.coordinator.doubleClickInterval = NSEvent.doubleClickInterval
        context.coordinator.differentiatesWithoutColor = Coordinator.differentiateWithoutColor()
        context.coordinator.scanning = model.isScanning
        context.coordinator.send(revision: model.revision)
        // After its map, which carries it: a map of a whole volume goes out with the figures measured for it. Without a
        // map, it goes on its own. The page matches it to its map by root.
        context.coordinator.notMeasured = model.notMeasured
        context.coordinator.selection = model.selection.paths
    }
    static func dismantleNSView(_ view: WKWebView, coordinator: Coordinator) {
        view.stopLoading(); view.navigationDelegate = nil
        view.configuration.userContentController.removeScriptMessageHandler(forName: "pith")
        coordinator.stopFollowingDisplayOptions()
        coordinator.web = nil
        coordinator.model.pageCommand = nil
    }

    @MainActor final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        /// "Nov 3": what grew is compared across days, so the page names the day.
        static func day(_ date: Date) -> String { date.formatted(.dateTime.month(.abbreviated).day()) }

        let model: DiskModel
        weak var web: WKWebView?
        var ready = false
        var revision: UUID?
        private var menu: DiskItemMenu?
        /// The appearance the page's icons are drawn in, the web view's own. A new one takes a new generation of icon
        /// URLs, since WebKit keeps an image from Pith's scheme for as long as its URL stays the same, and the page gets
        /// their new base at once.
        var iconAppearance: IconAppearance? {
            didSet {
                guard iconAppearance != oldValue else { return }
                if oldValue != nil { iconGeneration += 1 }
                sendIcons()
            }
        }
        private var iconGeneration = 1
        /// Where the page loads its icons from, up to their size and key (`IconPolicy.base`).
        private var iconBase: String? { iconAppearance.map { IconPolicy.base(generation: iconGeneration, appearance: $0) } }
        /// Pith's icon rule as the page applies it, which travels with the base. A new one, as when macOS stops asking,
        /// goes to the page at once.
        var iconRule: IconRule? {
            didSet {
                guard iconRule != oldValue else { return }
                iconRuleJSON = iconRule.flatMap(Self.json)
                sendIcons()
            }
        }
        /// The rule as JSON, encoded once for each rule and in one spelling for it: the page tries the icons it was
        /// refused again when the text changes.
        private var iconRuleJSON: String?
        /// The Places section's table as the page last got it. It travels with a map, in the same call, and only when it
        /// changes, so the page shows its sizes with the map they're the figures of.
        private var sentPlaces: PlacesTable?
        /// The apps that own the folders the map couldn't read, by folder, as keys, which Couldn't read shows. They go to
        /// the page once it's ready and whenever they change, as when a container's app is found between maps.
        private var owners: [String: String] = [:] {
            didSet { if owners != oldValue { sendOwners() } }
        }
        /// How long macOS waits for a second click to make a double-click, which the page holds its map still for
        /// after a click: a web page can't read it. It goes to the page once it's ready and when the setting changes.
        var doubleClickInterval: TimeInterval? {
            didSet { if doubleClickInterval != oldValue { sendDoubleClickInterval() } }
        }
        /// Whether macOS's Differentiate Without Color is on, which the page answers with each file kind's glyph on the
        /// map and in By kind, a cue that doesn't need colour. A web page can't read it, so it goes to the page once it's
        /// ready and whenever it changes.
        var differentiatesWithoutColor: Bool? {
            didSet { if differentiatesWithoutColor != oldValue { sendDifferentiateWithoutColor() } }
        }
        /// Whether a scan is running. The map it was drawn from stays on screen meanwhile, dimmed, and takes no clicks, so
        /// its hover cards offer none. The page can't tell, so it goes there once the page is ready and whenever it changes.
        var scanning: Bool? {
            didSet { if scanning != oldValue { sendScanning() } }
        }
        /// The used space of the volume a map of a whole volume shows, which the page draws as its Not measured block at
        /// the map's root and gives the root's shares of. It travels with the map it was measured for, so the page draws
        /// them at once, and on its own only when it changes without a map.
        var notMeasured: DiskModel.NotMeasured? {
            didSet { sendNotMeasured() }
        }
        /// The used space as the page last got it, nil for none.
        private var sentNotMeasured: DiskModel.NotMeasured?
        /// The items selected, by path, which Pith keeps (`DiskSelection`): the page says what was clicked, and outlines
        /// what this says, so it goes to the page once it's ready and whenever it changes.
        var selection: [String]? {
            didSet { sendSelection() }
        }
        /// The selection as the page last got it, nil for none sent to this page.
        private var sentSelection: [String]?
        /// Reads Differentiate Without Color as macOS has it, for every update of the view and every notice of a change. The
        /// smoke test reads a value of its own here instead, turning the setting for Pith alone, so no system setting
        /// changes.
        static var differentiateWithoutColor: () -> Bool = { NSWorkspace.shared.accessibilityDisplayShouldDifferentiateWithoutColor }
        /// macOS posts display option changes, Differentiate Without Color's among them, without SwiftUI drawing the view
        /// again, so the coordinator listens for them while the page is there.
        private var displayOptions: NSObjectProtocol?
        init(model: DiskModel) { self.model = model }

        func followDisplayOptions() {
            guard displayOptions == nil else { return }
            displayOptions = NSWorkspace.shared.notificationCenter.addObserver(
                forName: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor in self?.differentiatesWithoutColor = Coordinator.differentiateWithoutColor() }
            }
        }
        /// Follows the owners of the folders the map couldn't read, which `SideColumnFeed` finds off the main thread,
        /// often after the map they belong to has gone to the page, so each change is watched for here and sent on its
        /// own rather than with a map.
        func followOwners() {
            owners = withObservationTracking { model.owners.mapValues(\.string) } onChange: { [weak self] in
                Task { @MainActor in self?.followOwners() }
            }
        }
        func stopFollowingDisplayOptions() {
            if let displayOptions { NSWorkspace.shared.notificationCenter.removeObserver(displayOptions) }
            displayOptions = nil
        }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard BridgePolicy.allows(url: message.frameInfo.request.url, mainFrame: message.frameInfo.isMainFrame),
                  let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
            let path = body["path"] as? String
            switch action {
            case "ready":
                // Every page load starts empty, a reload, a new window and a restart after a crash included, so it gets
                // the icons' base and rule, the map's settings, whether a scan is running, the owners and the click hints
                // learned, and then the scan again with its places and its volume's used space, and the native selection
                // and history it no longer has are dropped.
                ready = true; revision = nil; model.select([]); model.mapStartsOver(); sendIcons(); sendDoubleClickInterval()
                sendDifferentiateWithoutColor(); sendScanning(); sendOwners(); sendLearnedHints()
                sentPlaces = nil; sentNotMeasured = nil; sentSelection = nil
                send(revision: model.revision)
                selection = model.selection.paths
            // A click selects the item clicked, or none; a ⌘-click adds it or takes it out; Shift and an arrow key add the
            // next item, which stays when a held key asks for it again. Pith answers with the selection.
            case "select":
                let paths = body["paths"] as? [String] ?? []
                switch body["how"] as? String {
                case "toggle": for path in paths { model.toggle(path) }
                case "add": for path in paths { model.add(path) }
                default: model.select(paths)
                }
            case "learnedHint": if let hint = body["hint"] as? String { model.mapHints.learn(hint) }
            case "whereTheSpaceIs": model.explainNotMeasured()
            case "fullDiskAccess": openDiskAccess()
            case "location":
                if let path {
                    model.pageMoved(to: path, wanting: body["wanted"] as? String, canGoBack: body["canGoBack"] as? Bool == true,
                                    canGoForward: body["canGoForward"] as? Bool == true)
                }
            case "quickLook": model.quickLook(body["paths"] as? [String] ?? [])
            case "trash":
                if let paths = body["paths"] as? [String], !paths.isEmpty { model.requestTrash(paths, undoManager: web?.window?.undoManager) }
            case "menu": showMenu(for: path)
            default: break
            }
        }

        /// The item's actions at the pointer, as Finder offers them: on an item selected among several, they act on every
        /// item selected. WebKit's own menu would offer Reload, which empties the map. Whether Move to Trash asks first
        /// comes from the items' plan, which the selection has in hand or is making off the main thread.
        private func showMenu(for path: String?) {
            guard let result = model.result else { return }
            let target = path.flatMap { result.item(at: $0) }
            let targets = target.map { model.selection.paths.contains($0.path) ? model.selection.paths : [$0.path] } ?? []
            Task {
                let plan = targets.isEmpty ? nil : try? await model.trashPlan(forSelected: targets).get()
                showMenu(target: target, targets: targets, plan: plan)
            }
        }

        private func showMenu(target: DiskNode?, targets: [String], plan: TrashBatch?) {
            guard let web, let window = web.window, let result = model.result else { return }
            let folder = target?.kind == .dir ? target?.path : nil
            let menu = DiskItemMenu()
            if !targets.isEmpty {
                menu.add("Quick Look") { [model] in model.quickLook(targets) }
                menu.add("Reveal in Finder") { [model] in model.reveal(targets) }
                menu.add(targets.count == 1 ? "Copy Path" : "Copy Paths") { [model] in model.copyPath(targets) }
            }
            let rescan = folder ?? model.openFolder ?? result.root.path
            if model.liveView != nil {
                // The live map follows changes itself; this is for when something looks off.
                menu.add(rescan == result.root.path ? "Check Again" : "Check This Folder Again", enabled: model.live?.state.isMapped == true) { [model] in model.checkAgain(rescan) }
            } else {
                menu.add(rescan == result.root.path ? "Scan Again" : "Scan This Folder Again", enabled: !model.isScanning) { [model] in model.rescan(rescan) }
            }
            if !targets.isEmpty {
                menu.separator()
                menu.add(plan?.asks == true ? "Move to Trash…" : "Move to Trash", enabled: plan != nil && !model.isScanning) { [model, weak window] in
                    model.requestTrash(targets, undoManager: window?.undoManager)
                }
            }
            self.menu = menu
            let point = web.convert(window.mouseLocationOutsideOfEventStream, from: nil)
            menu.menu.popUp(positioning: nil, at: point, in: web)
        }

        /// Runs a command of the path bar or the Go menu in the page, once it's ready for them.
        func run(_ command: MapCommand) {
            guard ready, let web else { return }
            let (name, path): (String, String?) = switch command {
            case .open(let folder): ("open", folder)
            case .back: ("back", nil)
            case .forward: ("forward", nil)
            case .up: ("up", nil)
            }
            web.callAsyncJavaScript("window.pithCommand?.(command, path)", arguments: ["command": name, "path": path as Any? ?? NSNull()],
                                    in: nil, in: .page) { result in
                if case .failure(let error) = result { NSLog("Pith: the disk map didn’t take the \(name) command: \(error.localizedDescription)") }
            }
        }

        func send(revision: UUID) {
            guard ready, revision != self.revision, let web else { return }
            self.revision = revision
            do {
                let payload = try model.resultJSON ?? model.result.map { String(decoding: try JSONEncoder().encode($0), as: UTF8.self) }
                // What grew since the last scan of this folder travels apart from the scanner's own result.
                var writers: [DiskWriter] = []
                let growth = model.growthSince.map { since in
                    var growth: [String: Any] = ["since": Self.day(since), "changes": model.growth]
                    // Who wrote while it grew: a correlation, which the page words as one. Each app comes with its bundle,
                    // for its icon.
                    switch model.writers?(since) {
                    case .apps(let apps, let from)?:
                        writers = apps
                        growth["writers"] = apps.map { ["name": $0.name, "bytes": $0.bytes, "bundle": $0.bundle as Any? ?? NSNull()] as [String: Any] }
                        growth["writersSince"] = Self.day(from)
                    case .historyOff?:
                        growth["writersHint"] = "Turn on Keep a week of history in Settings to see which apps wrote the most since then."
                    case .empty?, nil:
                        break
                    }
                    return growth
                }
                // Before the page can ask: it may load the icons of the apps it names now, and of no others.
                model.pageWriters = writers
                // A map the person's own action made shows at once; any other waits while they click or read a card.
                let atOnce = model.mapAnswersPerson
                model.mapAnswersPerson = false
                // The icons' base and rule aren't in it: the page has them since it was ready, and gets them again when
                // they change.
                var script = "window.pithReceive(payload, atOnce); window.pithReceiveGrowth?.(growth)"
                var arguments: [String: Any] = ["payload": payload as Any? ?? NSNull(), "atOnce": atOnce, "growth": growth as Any? ?? NSNull()]
                // The Places section's table comes with the map its sizes are the figures of, in the same call, so the page
                // draws them together, and only when it changes.
                let places = model.placesTable
                if places != sentPlaces {
                    sentPlaces = places
                    script = "window.pithReceivePlaces?.(places); " + script
                    arguments["places"] = places.flatMap(Self.json) ?? NSNull()
                }
                // So is the volume's used space, measured for this map before it went out.
                let usedSpace = model.notMeasured
                if usedSpace != sentNotMeasured {
                    sentNotMeasured = usedSpace
                    script = "window.pithReceiveNotMeasured?.(root, bytes, used); " + script
                    arguments.merge(Self.arguments(usedSpace)) { _, new in new }
                }
                web.callAsyncJavaScript(script, arguments: arguments, in: nil, in: .page) { [weak self] result in
                    if case .failure(let error) = result { self?.model.problem = DiskProblem(message: "Pith couldn’t draw the disk map: \(error.localizedDescription)") }
                }
            } catch { model.problem = DiskProblem(message: "Pith couldn’t prepare the disk map: \(error.localizedDescription)") }
        }

        /// `value` as JSON in one spelling, as the page reads a table native sends: the icon rule, Places and the owners.
        private static func json(_ value: some Encodable) -> String? {
            let encoder = JSONEncoder()
            encoder.outputFormatting = .sortedKeys
            return (try? encoder.encode(value)).map { String(decoding: $0, as: UTF8.self) }
        }

        /// Gives the page the apps that own the folders the map couldn't read once it's ready for them, and again
        /// whenever they change.
        private func sendOwners() {
            guard ready, let web else { return }
            web.callAsyncJavaScript("window.pithReceiveOwners?.(owners)", arguments: ["owners": Self.json(owners) ?? NSNull()], in: nil, in: .page) { result in
                if case .failure(let error) = result { NSLog("Pith: the disk map didn’t take the owners of the folders it couldn’t read: \(error.localizedDescription)") }
            }
        }

        /// Gives the page the icons' base and rule once it's ready for them, a reload's included, and again whenever
        /// either changes. Maps come without them.
        private func sendIcons() {
            guard ready, let web else { return }
            web.callAsyncJavaScript("window.pithReceiveIconBase?.(iconBase, iconRule)",
                                    arguments: ["iconBase": iconBase as Any? ?? NSNull(), "iconRule": iconRuleJSON as Any? ?? NSNull()], in: nil, in: .page) { result in
                if case .failure(let error) = result { NSLog("Pith: the disk map didn’t take its icons’ new base: \(error.localizedDescription)") }
            }
        }
        /// Gives the page macOS's double-click interval once it's ready for it, and again when it changes.
        private func sendDoubleClickInterval() {
            guard ready, let web, let doubleClickInterval else { return }
            web.callAsyncJavaScript("window.pithReceiveDoubleClickInterval?.(seconds)", arguments: ["seconds": doubleClickInterval], in: nil, in: .page) { result in
                if case .failure(let error) = result { NSLog("Pith: the disk map didn’t take macOS’s double-click interval: \(error.localizedDescription)") }
            }
        }
        /// Gives the page Differentiate Without Color once it's ready for it, and again when it changes.
        private func sendDifferentiateWithoutColor() {
            guard ready, let web, let differentiatesWithoutColor else { return }
            web.callAsyncJavaScript("window.pithReceiveDifferentiateWithoutColor?.(on)", arguments: ["on": differentiatesWithoutColor], in: nil, in: .page) { result in
                if case .failure(let error) = result { NSLog("Pith: the disk map didn’t take Differentiate Without Color: \(error.localizedDescription)") }
            }
        }
        /// Tells the page whether a scan is running once it's ready, and again when that changes.
        private func sendScanning() {
            guard ready, let web, let scanning else { return }
            web.callAsyncJavaScript("window.pithReceiveScanning?.(on)", arguments: ["on": scanning], in: nil, in: .page) { result in
                if case .failure(let error) = result { NSLog("Pith: the disk map didn’t take whether a scan is running: \(error.localizedDescription)") }
            }
        }
        /// Gives the page the items selected once it's ready, and again whenever they change.
        private func sendSelection() {
            guard ready, let web, let selection, selection != sentSelection else { return }
            sentSelection = selection
            web.callAsyncJavaScript("window.pithReceiveSelection?.(paths)", arguments: ["paths": selection], in: nil, in: .page) { result in
                if case .failure(let error) = result { NSLog("Pith: the disk map didn’t take the selection: \(error.localizedDescription)") }
            }
        }
        /// Gives the page the click hints the person has learned, from Pith's settings, once it's ready for them: a new
        /// window's page shows none it has learned.
        private func sendLearnedHints() {
            guard ready, let web else { return }
            web.callAsyncJavaScript("window.pithReceiveLearnedHints?.(names)", arguments: ["names": model.mapHints.learned], in: nil, in: .page) { result in
                if case .failure(let error) = result { NSLog("Pith: the disk map didn’t take the hints it has learned: \(error.localizedDescription)") }
            }
        }
        /// Gives the page the volume's used space when it changed without a map, or nothing for a map of a folder.
        private func sendNotMeasured() {
            guard ready, let web, notMeasured != sentNotMeasured else { return }
            sentNotMeasured = notMeasured
            web.callAsyncJavaScript("window.pithReceiveNotMeasured?.(root, bytes, used)", arguments: Self.arguments(notMeasured), in: nil, in: .page) { result in
                if case .failure(let error) = result { NSLog("Pith: the disk map didn’t take its volume’s used space: \(error.localizedDescription)") }
            }
        }
        /// The volume's used space as the page's `pithReceiveNotMeasured` takes it: nulls for none.
        private static func arguments(_ usedSpace: DiskModel.NotMeasured?) -> [String: Any] {
            ["root": usedSpace?.root as Any? ?? NSNull(), "bytes": usedSpace?.bytes as Any? ?? NSNull(), "used": usedSpace?.used as Any? ?? NSNull()]
        }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
            decisionHandler(BridgePolicy.allows(url: navigationAction.request.url, mainFrame: navigationAction.targetFrame?.isMainFrame == true) ? .allow : .cancel)
        }
        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { ready = false }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            model.problem = DiskProblem(message: "Pith couldn’t load the disk map: \(error.localizedDescription)")
        }
        /// macOS can end WebKit's page process, under memory pressure for one, which leaves the view blank. The
        /// reloaded page announces itself and gets the scan again.
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { ready = false; webView.reload() }
    }
}

/// An NSMenu whose items run closures, for the map's context menu.
@MainActor final class DiskItemMenu: NSObject {
    let menu = NSMenu()
    private var actions: [() -> Void] = []

    @discardableResult func add(_ title: String, enabled: Bool = true, action: @escaping () -> Void) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: enabled ? #selector(run(_:)) : nil, keyEquivalent: "")
        item.target = self
        item.tag = actions.count
        item.isEnabled = enabled
        actions.append(action)
        menu.addItem(item)
        return item
    }

    func separator() { menu.addItem(.separator()) }

    @objc private func run(_ sender: NSMenuItem) { actions[sender.tag]() }
}
