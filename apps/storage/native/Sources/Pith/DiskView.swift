import SwiftUI
import WebKit
import UniformTypeIdentifiers
import PithCore

struct DiskView: View {
    let model: DiskModel
    let webCreated: (WKWebView) -> Void
    @State private var confirmation: String?

    var body: some View {
        VStack(spacing: 0) {
            DiskControlBar(model: model)
            if let error = model.error {
                DiskNotice(symbol: "exclamationmark.triangle.fill", tint: BruhsColor.statusCritical, message: error)
            }
            if model.unreadableFolders > 0 {
                DiskNotice(symbol: "lock.fill", tint: BruhsColor.statusWarning,
                           message: "\(model.unreadableFolders.formatted()) \(model.unreadableFolders == 1 ? "folder" : "folders") couldn’t be read, so this map leaves them out.") {
                    Button("Full Disk Access…") { openDiskAccess() }
                        .buttonStyle(.bruhsGhost)
                        .help("Grant Pith access in System Settings, then scan again.")
                }
            }
            Rectangle().fill(BruhsColor.hairline).frame(height: 1)
            ZStack {
                // The map has nothing to show until the scan ends; the bar above reports progress.
                DiskWebView(model: model, created: webCreated)
                    .opacity(model.isScanning ? 0 : 1)
                    .accessibilityHidden(model.isScanning)
                if model.isScanning {
                    Text("The map appears when the scan finishes.")
                        .font(BruhsType.body)
                        .foregroundStyle(BruhsColor.textSecondary)
                }
            }
            if let path = model.selected {
                DiskSelectionBar(path: path, size: model.selectedSize, canTrash: !model.isScanning && !model.isTrashing) {
                    confirmation = path
                }
            }
        }
        .frame(minWidth: 860, minHeight: 560)
        .alert("Move this item to Trash?", isPresented: Binding(get: { confirmation != nil }, set: { if !$0 { confirmation = nil } })) {
            Button("Cancel", role: .cancel) { confirmation = nil }
            Button("Move to Trash", role: .destructive) { if let path = confirmation { model.trash(path) }; confirmation = nil }
        } message: { Text("\(confirmation ?? "")\n\nYou can use Put Back in Finder’s Trash to restore it.") }
    }
}

/// What is scanned and how much it holds, with the scan actions. Choose Folder is the one primary.
private struct DiskControlBar: View {
    let model: DiskModel

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                if let scope = model.scope {
                    Text(scope)
                        .font(BruhsType.data)
                        .foregroundStyle(BruhsColor.text)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .textSelection(.enabled)
                        .help(scope)
                } else {
                    Text("No scan yet")
                        .font(BruhsType.body)
                        .foregroundStyle(BruhsColor.textSecondary)
                }
                if let caption = model.caption {
                    Text(caption)
                        .font(BruhsType.caption)
                        .foregroundStyle(BruhsColor.textSecondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 12)
            if model.isScanning {
                ProgressView()
                    .controlSize(.small)
                    .accessibilityLabel("Scanning")
                Button("Cancel") { model.cancel() }
                    .buttonStyle(.bruhsGhost)
            } else {
                Button("Scan Startup Disk") { model.scan(URL(fileURLWithPath: "/")) }
                    .buttonStyle(.bruhsGhost)
                    .disabled(model.isTrashing)
                    .help("Scan everything on the startup disk.")
                Button("Choose Folder…") { model.chooseFolder() }
                    .buttonStyle(.bruhsSoft)
                    .disabled(model.isTrashing)
                    .help("Choose a folder to scan.")
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(minHeight: 52)
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

/// The selected item and what can be done with it.
private struct DiskSelectionBar: View {
    let path: String
    let size: UInt64?
    let canTrash: Bool
    let trash: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Text(path)
                .font(BruhsType.caption)
                .foregroundStyle(BruhsColor.text)
                .lineLimit(1)
                .truncationMode(.middle)
                .textSelection(.enabled)
                .help(path)
            if let size {
                Text(bytes(size))
                    .font(BruhsType.caption)
                    .foregroundStyle(BruhsColor.textSecondary)
                    .fixedSize()
            }
            Spacer(minLength: 12)
            Button("Reveal in Finder") { NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)]) }
                .buttonStyle(.bruhsGhost)
            Button("Move to Trash…", action: trash)
                .buttonStyle(.bruhsSoftDanger)
                .disabled(!canTrash)
                .help("Move it to the Trash. Finder’s Put Back restores it.")
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
    let created: (WKWebView) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(model: model) }
    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.setURLSchemeHandler(BundledAssets(), forURLScheme: "pith")
        config.userContentController.add(context.coordinator, name: "pith")
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
        created(view)
        if let url = URL(string: "pith://app/index.html") { view.load(URLRequest(url: url)) }
        return view
    }
    func updateNSView(_ nsView: WKWebView, context: Context) { context.coordinator.send(revision: model.revision) }
    static func dismantleNSView(_ view: WKWebView, coordinator: Coordinator) {
        view.stopLoading(); view.navigationDelegate = nil
        view.configuration.userContentController.removeScriptMessageHandler(forName: "pith")
        coordinator.web = nil
    }

    @MainActor final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        let model: DiskModel
        weak var web: WKWebView?
        var ready = false
        var revision: UUID?
        init(model: DiskModel) { self.model = model }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard BridgePolicy.allows(url: message.frameInfo.request.url, mainFrame: message.frameInfo.isMainFrame),
                  let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
            switch action {
            case "ready":
                // Every page load starts empty, a reload or a restart after a crash included, so it gets the scan
                // again, and the native selection it no longer shows is dropped.
                ready = true; revision = nil; model.select(nil); send(revision: model.revision)
            case "select": model.select(body["path"] as? String)
            default: break
            }
        }
        func send(revision: UUID) {
            guard ready, revision != self.revision, let web else { return }
            self.revision = revision
            do {
                let payload = try model.result.map { String(decoding: try JSONEncoder().encode($0), as: UTF8.self) }
                web.callAsyncJavaScript("window.pithReceive(payload)", arguments: ["payload": payload as Any? ?? NSNull()], in: nil, in: .page) { [weak self] result in
                    if case .failure(let error) = result { self?.model.error = "Could not display the disk map: \(error.localizedDescription)" }
                }
            } catch { model.error = "Could not encode the disk map: \(error.localizedDescription)" }
        }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
            decisionHandler(BridgePolicy.allows(url: navigationAction.request.url, mainFrame: navigationAction.targetFrame?.isMainFrame == true) ? .allow : .cancel)
        }
        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { ready = false }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { model.error = "Could not load the bundled disk view: \(error.localizedDescription)" }
        /// macOS can end WebKit's page process, under memory pressure for one, which leaves the view blank. The
        /// reloaded page announces itself and gets the scan again.
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { ready = false; webView.reload() }
    }
}

@MainActor final class BundledAssets: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url, url.host == "app", url.scheme == "pith",
              let resources = Bundle.main.resourceURL else {
            urlSchemeTask.didFailWithError(DiskFailure("Invalid bundled resource request.")); return
        }
        let root = resources.appendingPathComponent("web").standardizedFileURL.resolvingSymlinksInPath()
        let target = root.appendingPathComponent(url.path).standardizedFileURL.resolvingSymlinksInPath()
        guard target.pathComponents.starts(with: root.pathComponents), target.path != root.path else {
            urlSchemeTask.didFailWithError(DiskFailure("Resource path is outside the app bundle.")); return
        }
        do {
            let data = try Data(contentsOf: target)
            let mime = switch target.pathExtension { case "js": "text/javascript"; case "css": "text/css"; case "html": "text/html"; default: UTType(filenameExtension: target.pathExtension)?.preferredMIMEType ?? "application/octet-stream" }
            urlSchemeTask.didReceive(URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: "utf-8"))
            urlSchemeTask.didReceive(data); urlSchemeTask.didFinish()
        } catch { urlSchemeTask.didFailWithError(error) }
    }
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}
