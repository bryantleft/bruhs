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
                if let item = model.selectedItem, let path = model.selected {
                    DiskSelectionBar(model: model, item: item, path: path, isSelection: true, plan: model.selectedPlan) {
                        model.requestTrash(path, undoManager: undoManager)
                    }
                } else {
                    let folder = model.openFolder.flatMap { result.item(at: $0) } ?? result.root
                    DiskSelectionBar(model: model, item: folder, path: folder.path, isSelection: false, plan: nil) {}
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
        .alert(model.confirming.map { "Move “\($0.name)” to the Trash?" } ?? "", isPresented: Binding(get: { model.confirming != nil }, set: { if !$0 { model.confirming = nil } })) {
            Button("Cancel", role: .cancel) { model.confirming = nil }
            Button("Move to Trash", role: .destructive) {
                if let plan = model.confirming { model.trash(plan, undoManager: undoManager) }
                model.confirming = nil
            }
        } message: {
            Text(model.confirming.map(confirmation) ?? "")
        }
    }

    private func confirmation(_ plan: TrashPlan) -> String {
        let effects = plan.consequences.map { consequence -> String in
            switch consequence {
            case .iCloud: "It syncs with iCloud Drive, so the Trash removes it from your other devices too."
            case .cloudStorage(let provider): "It syncs with \(provider), so the Trash removes it there and from your other devices too."
            case .photosLibrary: "It’s a Photos library: its photos and edits go to the Trash with it."
            }
        }
        return (effects + ["You can put it back from the Trash until you empty it."]).joined(separator: " ")
    }
}

/// Where the map is, as one path from the disk down, with a caption on what the map holds and Cancel while a scan runs.
private struct DiskControlBar: View {
    let model: DiskModel
    @State private var showsAccounting = false

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
                    if let accounting = model.accounting, !model.isScanning {
                        Button("Where the space is") { showsAccounting.toggle() }
                            .buttonStyle(.link)
                            .font(BruhsType.note)
                            .foregroundStyle(BruhsColor.accent)
                            .popover(isPresented: $showsAccounting, arrowEdge: .bottom) { DiskAccountingView(accounting: accounting, result: model.result) }
                            .help("What the disk’s used space holds, including what the scan couldn’t measure")
                    }
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

/// Where a whole volume's used space went. Each line is a measured figure, or says plainly that it wasn't measured.
private struct DiskAccountingView: View {
    let accounting: DiskAccounting
    let result: DiskResult?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            row("Used on this disk", bytes(accounting.used), note: nil, strong: true)
            Rectangle().fill(BruhsColor.hairline).frame(height: 1)
            row("On the map", bytes(accounting.scanned), note: "What the scan found, other volumes on this disk included.")
            if accounting.hiddenVolumes > 0 {
                row("Hidden volumes", bytes(accounting.hiddenVolumes), note: "Volumes macOS keeps unmounted, such as Recovery.")
            }
            if let notMeasured = accounting.notMeasured, notMeasured > 0 {
                row("Not measured", bytes(notMeasured), note: notMeasuredNote)
            }
            if accounting.overcounted > 0 {
                row("Counted twice", bytes(accounting.overcounted), note: "Clones changed since they were made still share some blocks, and the map counts those at every copy.")
            }
            if let clones = result?.summary.clones, clones.bytes > 0 {
                row("Clones counted once", bytes(clones.bytes), note: "\(clones.files.formatted()) \(clones.files == 1 ? "file is a clone" : "files are clones") of another file, sharing all its blocks. The map counts that space at the copy made first.")
            }
            if let purgeable = accounting.purgeable, purgeable > 0 {
                row("Purgeable", bytes(purgeable), note: "Caches and snapshots macOS can remove when it needs room. They count as used until it does.")
            }
            if let cloud = result?.summary.cloudOnly, cloud.files > 0 {
                row("Only in iCloud", bytes(cloud.bytes), note: "\(cloud.files.formatted()) \(cloud.files == 1 ? "file isn’t" : "files aren’t") downloaded, so \(cloud.files == 1 ? "it takes" : "they take") almost no space here.")
            }
        }
        .padding(16)
        .frame(width: 340, alignment: .leading)
        .background(BruhsColor.canvas)
    }

    private var notMeasuredNote: String {
        var causes: [String] = []
        if accounting.unreadableFolders > 0 {
            causes.append("\(accounting.unreadableFolders.formatted()) \(accounting.unreadableFolders == 1 ? "folder" : "folders") Pith couldn’t read")
        }
        if let snapshots = accounting.snapshots, snapshots > 0 {
            causes.append("\(snapshots) local \(snapshots == 1 ? "snapshot" : "snapshots")")
        }
        causes.append("the file system’s own records")
        let list = causes.count > 1 ? causes.dropLast().joined(separator: ", ") + " and " + causes[causes.count - 1] : causes[0]
        return "Space the scan couldn’t see: \(list). macOS doesn’t say how much each takes."
    }

    private func row(_ label: String, _ value: String, note: String?, strong: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline) {
                Text(label).font(strong ? BruhsType.label : BruhsType.body).foregroundStyle(BruhsColor.text)
                Spacer(minLength: 12)
                Text(verbatim: value).font(BruhsType.data).foregroundStyle(strong ? BruhsColor.text : BruhsColor.textSecondary)
            }
            if let note {
                Text(note).font(BruhsType.note).foregroundStyle(BruhsColor.textTertiary).fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Problems, the last move to the Trash, and folders the scan couldn't read, each with its one action.
private struct DiskNotices: View {
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
        if let item = model.trashed {
            DiskNotice(symbol: "trash", tint: BruhsColor.textSecondary,
                       message: "Moved \(item.name) to the Trash. Its \(bytes(item.size)) comes back when you empty the Trash.") {
                Button("Undo") { model.undoTrash() }
                    .buttonStyle(.bruhsGhost)
                    .help("Put it back where it was (⌘Z)")
                Button { model.dismissTrashNote() } label: { Image(systemName: "xmark") }
                    .buttonStyle(.bruhsGhost)
                    .help("Dismiss")
                    .accessibilityLabel("Dismiss")
            }
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

/// The folders a scan couldn't read, with why, so the user can see what Full Disk Access would change.
private struct UnreadableList: View {
    let model: DiskModel
    let folders: [DiskUnreadableFolder]
    let total: UInt64

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Folders the scan couldn’t read").font(BruhsType.label).foregroundStyle(BruhsColor.text)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 4) {
                    ForEach(folders, id: \.path) { folder in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
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
                            Button("Reveal in Finder") { model.reveal(folder.path) }
                            Button("Copy Path") { model.copyPath(folder.path) }
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
                        Image(nsImage: NSWorkspace.shared.icon(forFile: volume.url.path))
                            .resizable()
                            .frame(width: 32, height: 32)
                            .accessibilityHidden(true)
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

/// The selected item, led by its icon and path, or the open folder's figures while nothing is selected, since the path
/// bar names the open folder; and what can be done with it.
private struct DiskSelectionBar: View {
    let model: DiskModel
    let item: DiskNode
    let path: String
    /// False while it describes the open folder, which Move to Trash never targets from here.
    let isSelection: Bool
    let plan: Result<TrashPlan, DiskFailure>?
    let trash: () -> Void

    private var refusal: String? {
        if case .failure(let failure)? = plan { return failure.message }
        return nil
    }
    private var asks: Bool {
        if case .success(let plan)? = plan { return !plan.consequences.isEmpty }
        return false
    }

    private var pathText: some View {
        Text(path)
            .font(BruhsType.dataSmall)
            .foregroundStyle(BruhsColor.text)
            .lineLimit(1)
            .truncationMode(.middle)
            .textSelection(.enabled)
            .help(path)
    }

    private func figures(files: Bool, clones: Bool) -> some View {
        HStack(spacing: 10) {
            LabeledFigure(label: "Size", value: bytes(item.size))
            if files, item.kind == .dir { LabeledFigure(label: "Files", value: monaspaced(item.fileCount.formatted())) }
            if clones, let shared = item.clones, shared >= 1_000_000 {
                LabeledFigure(label: "Clones", value: bytes(shared))
                    .help("It also holds \(bytes(shared)) of APFS clones. Each shares its blocks with another copy, which the map counts instead, so the size leaves them out.")
            }
            // Clones, hard links and snapshots outside it keep the blocks they share, so deleting it can free less.
            if isSelection, let frees = model.selectedFrees, frees.bytes + 1_000_000 < item.size {
                LabeledFigure(label: "Frees now", value: bytes(frees.bytes))
                    .help(Self.freesHelp(frees))
            }
        }
        .fixedSize()
    }

    /// Why deleting it frees less than its size, in sentences.
    static func freesHelp(_ frees: DiskFrees) -> String {
        var sentences = ["Deleting it frees \(bytes(frees.bytes)) now. Moving it to the Trash frees that once you empty the Trash."]
        if frees.shared > 0 {
            sentences.append("\(bytes(frees.shared)) of it is shared with clones or hard links outside it, which keep those blocks.")
        }
        if frees.snapshots > 0 {
            sentences.append("\(bytes(frees.snapshots)) stays in local snapshots until macOS deletes them.")
        }
        if frees.unreadable > 0 {
            sentences.append("Pith couldn’t read \(frees.unreadable.formatted()) \(frees.unreadable == 1 ? "folder" : "folders") inside, so they aren’t counted.")
        }
        return sentences.joined(separator: " ")
    }

    var body: some View {
        HStack(spacing: 12) {
            if isSelection {
                HStack(spacing: 6) {
                    SystemIconView(key: model.iconKey(for: item))
                    // A short path shows whole; a long one truncates in its middle at a third of a narrow window, so the
                    // figures keep their room.
                    ViewThatFits(in: .horizontal) {
                        pathText.fixedSize()
                        pathText.frame(maxWidth: 260, alignment: .leading)
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
            if model.liveView == nil, item.kind == .dir, model.changes.touches(path), !model.isScanning {
                Button("Scan Again") { model.rescan(path) }
                    .buttonStyle(.bruhsGhost)
                    .fixedSize()
                    .disabled(model.isTrashing)
                    .help("Something in it changed since the scan. Scan it again to update its size.")
            }
            Button("Quick Look") { model.showQuickLook?([URL(fileURLWithPath: path)]) }
                .buttonStyle(.bruhsGhost)
                .fixedSize()
                .help("Preview it (Space)")
            Button("Reveal in Finder") { model.reveal(path) }
                .buttonStyle(.bruhsGhost)
                .fixedSize()
            if isSelection {
                Button(asks ? "Move to Trash…" : "Move to Trash", action: trash)
                    .buttonStyle(.bruhsSoftDanger)
                    .fixedSize()
                    .disabled(refusal != nil || model.isScanning || model.isTrashing)
                    .help(refusal ?? "Move it to the Trash (⌘⌫). You can undo this.")
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
        context.coordinator.send(revision: model.revision)
    }
    static func dismantleNSView(_ view: WKWebView, coordinator: Coordinator) {
        view.stopLoading(); view.navigationDelegate = nil
        view.configuration.userContentController.removeScriptMessageHandler(forName: "pith")
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
                let encoder = JSONEncoder()
                encoder.outputFormatting = .sortedKeys
                iconRuleJSON = iconRule.flatMap { try? encoder.encode($0) }.map { String(decoding: $0, as: UTF8.self) }
                sendIcons()
            }
        }
        /// The rule as JSON, encoded once for each rule and in one spelling for it: the page tries the icons it was
        /// refused again when the text changes.
        private var iconRuleJSON: String?
        init(model: DiskModel) { self.model = model }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard BridgePolicy.allows(url: message.frameInfo.request.url, mainFrame: message.frameInfo.isMainFrame),
                  let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
            let path = body["path"] as? String
            switch action {
            case "ready":
                // Every page load starts empty, a reload or a restart after a crash included, so it gets the icons' base
                // and rule and then the scan again, and the native selection and history it no longer has are dropped.
                ready = true; revision = nil; model.select(nil); model.mapStartsOver(); sendIcons(); send(revision: model.revision)
            case "select": model.select(path)
            case "location":
                if let path {
                    model.pageMoved(to: path, wanting: body["wanted"] as? String, canGoBack: body["canGoBack"] as? Bool == true,
                                    canGoForward: body["canGoForward"] as? Bool == true)
                }
            case "quickLook": model.quickLook(path)
            case "trash": if let path { model.requestTrash(path, undoManager: web?.window?.undoManager) }
            case "menu": showMenu(for: path)
            default: break
            }
        }

        /// The item's actions at the pointer, as Finder offers them. WebKit's own menu would offer Reload, which empties the map.
        private func showMenu(for path: String?) {
            guard let web, let window = web.window, let result = model.result else { return }
            let target = path.flatMap { result.item(at: $0) }
            let folder = target?.kind == .dir ? target?.path : nil
            let menu = DiskItemMenu()
            if let target {
                menu.add("Quick Look") { [model] in model.quickLook(target.path) }
                menu.add("Reveal in Finder") { [model] in model.reveal(target.path) }
                menu.add("Copy Path") { [model] in model.copyPath(target.path) }
            }
            let rescan = folder ?? model.openFolder ?? result.root.path
            if model.liveView != nil {
                // The live map follows changes itself; this is for when something looks off.
                menu.add(rescan == result.root.path ? "Check Again" : "Check This Folder Again", enabled: model.live?.state.isMapped == true) { [model] in model.checkAgain(rescan) }
            } else {
                menu.add(rescan == result.root.path ? "Scan Again" : "Scan This Folder Again", enabled: !model.isScanning) { [model] in model.rescan(rescan) }
            }
            if let target {
                menu.separator()
                let plan = model.trashPlan(target.path)
                let asks = (try? plan.get())?.consequences.isEmpty == false
                menu.add(asks ? "Move to Trash…" : "Move to Trash", enabled: (try? plan.get()) != nil && !model.isScanning) { [model, weak window] in
                    model.requestTrash(target.path, undoManager: window?.undoManager)
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
                // The icons' base and rule aren't in it: the page has them since it was ready, and gets them again when
                // they change.
                web.callAsyncJavaScript("window.pithReceive(payload); window.pithReceiveGrowth?.(growth)",
                                        arguments: ["payload": payload as Any? ?? NSNull(), "growth": growth as Any? ?? NSNull()],
                                        in: nil, in: .page) { [weak self] result in
                    if case .failure(let error) = result { self?.model.problem = DiskProblem(message: "Pith couldn’t draw the disk map: \(error.localizedDescription)") }
                }
            } catch { model.problem = DiskProblem(message: "Pith couldn’t prepare the disk map: \(error.localizedDescription)") }
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
