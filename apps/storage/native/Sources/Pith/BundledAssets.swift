import Foundation
import PithCore
import UniformTypeIdentifiers
import WebKit

/// Pith's own scheme, `pith://app/`: the disk map's page and the files beside it, from the app's bundle, and under
/// `icon/` the icons of what the map shows, as `IconPolicy` allows, from the icon store.
@MainActor final class BundledAssets: NSObject, WKURLSchemeHandler {
    /// The icon a URL of the icon route asks for, or nil when the page may not have it, as the map stands when it asks.
    private let icons: (URL) -> IconRequest?
    /// Icon requests waiting for their drawing. WebKit stops a request the page no longer needs and raises an exception
    /// when one is answered after that, so a drawing answers its request only while it's still here.
    private var waiting: Set<ObjectIdentifier> = []
    /// How many icon requests WebKit stopped while their drawing was still to come, and how many of those drawings have
    /// come since and gone unanswered. The smoke test checks that each one comes.
    private(set) var stoppedWhileDrawing = 0
    private(set) var drawnAfterStopping = 0
    /// How many icon requests are waiting for their drawing now. Once none are, every stop WebKit makes of them has come.
    var waitingForDrawings: Int { waiting.count }

    init(icons: @escaping (URL) -> IconRequest?) { self.icons = icons }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url, url.host == "app", url.scheme == "pith",
              let resources = Bundle.main.resourceURL else {
            urlSchemeTask.didFailWithError(DiskFailure("Invalid bundled resource request.")); return
        }
        // Everything under icon/, however it's spelled, is the icon route's to answer, and never a file's.
        if url.path.hasPrefix("/icon/") { serveIcon(url, to: urlSchemeTask); return }
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

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        if waiting.remove(ObjectIdentifier(urlSchemeTask)) != nil { stoppedWhileDrawing += 1 }
    }

    /// Answers with the icon `url` asks for, drawn and encoded as PNG off the main thread unless the store has its PNG,
    /// or with a 404 when the page may not have it or macOS has none.
    private func serveIcon(_ url: URL, to task: any WKURLSchemeTask) {
        guard let request = icons(url) else { Self.answer(task, url: url, png: nil); return }
        if let png = Icons.store.cachedPNG(for: request) { Self.answer(task, url: url, png: png); return }
        let id = ObjectIdentifier(task)
        waiting.insert(id)
        Task {
            let png = await Icons.store.png(for: request)
            // This closure holds the task, so no request WebKit starts meanwhile can share its identifier.
            guard waiting.remove(id) != nil else { drawnAfterStopping += 1; return }
            Self.answer(task, url: url, png: png)
        }
    }

    /// The PNG with its type and length, or a 404 without one. No caching headers: the URL's generation, appearance and
    /// size are what make WebKit load an icon again.
    private static func answer(_ task: any WKURLSchemeTask, url: URL, png: Data?) {
        let headers = png.map { ["Content-Type": "image/png", "Content-Length": String($0.count)] } ?? ["Content-Length": "0"]
        guard let response = HTTPURLResponse(url: url, statusCode: png == nil ? 404 : 200, httpVersion: "HTTP/1.1", headerFields: headers) else {
            task.didFailWithError(DiskFailure("Pith couldn’t answer for an icon.")); return
        }
        task.didReceive(response)
        if let png { task.didReceive(png) }
        task.didFinish()
    }
}
