import AppKit
import ImageIO
import UniformTypeIdentifiers

/// What an icon shows, and where macOS's icon for it comes from, so asking for one never makes Pith open an item:
/// `type/<extension>` is a file's type, from its extension alone; `item/<absolute path>` is a real item's own icon,
/// as Finder shows it; `place/<id>` is a known place's (`KnownPlaces`); `folder` is a plain folder; and `group` stands
/// for several items, as the map's smaller items do.
///
/// `string` is how a key travels in a URL's path. Its payload is percent-encoded, everything but ASCII letters, digits
/// and `-._~`, an item path's slashes included, so a key stays whole: WebKit can't resolve a `..` out of it on the way.
/// Read a key from a URL's percent-encoded path, since `URL.path` decodes it.
///
/// Keys compare and hash as their strings do, by canonical equivalence, so a path spelled composed (NFC) and decomposed
/// (NFD) is one key, and the store keeps one drawing for it. That's right for the disks Pith maps: APFS and HFS+ don't
/// let two names in a folder differ only by normalization, so both spellings name one item. `string` keeps the key's own
/// spelling, so an icon's URL spells the item as whoever made the key did, the scanner's spelling for the map's items.
public enum IconKey: Hashable, Sendable {
    case type(String)
    case item(String)
    case place(String)
    case folder
    case group

    /// The key as one string. Only a key whose item path is absolute and canonical, and whose place has an id, reads
    /// back with `init(string:)`.
    public var string: String {
        switch self {
        case .type(let pathExtension): "type/" + Self.escape(pathExtension)
        case .item(let path): "item/" + Self.escape(path)
        case .place(let id): "place/" + Self.escape(id)
        case .folder: "folder"
        case .group: "group"
        }
    }

    /// The key `string` spells, or nil for anything else: an unknown kind, an item path that isn't absolute or that
    /// has an empty, `.` or `..` component, a type or place with a slash, a NUL, or any other spelling of a key, such
    /// as a lowercase or needless escape. Each key has one spelling, so it reads back exactly as it was written.
    public init?(string: String) {
        switch string {
        case "folder": self = .folder; return
        case "group": self = .group; return
        default: break
        }
        guard let slash = string.firstIndex(of: "/"), let payload = string[string.index(after: slash)...].removingPercentEncoding,
              !payload.contains("\0") else { return nil }
        let key: IconKey
        switch string[..<slash] {
        case "type" where !payload.contains("/"): key = .type(payload)
        case "place" where !payload.isEmpty && !payload.contains("/"): key = .place(payload)
        case "item" where Self.isCanonical(payload): key = .item(payload)
        default: return nil
        }
        guard key.string == string else { return nil }
        self = key
    }

    private static let unreserved = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")

    private static func escape(_ text: String) -> String { text.addingPercentEncoding(withAllowedCharacters: unreserved) ?? "" }

    /// An absolute path in its one spelling: no empty, `.` or `..` components, and no slash at the end but the root's.
    private static func isCanonical(_ path: String) -> Bool {
        guard path.hasPrefix("/") else { return false }
        return path == "/" || path.dropFirst().split(separator: "/", omittingEmptySubsequences: false).allSatisfy { !$0.isEmpty && $0 != "." && $0 != ".." }
    }
}

/// Light or dark. macOS picks an icon's artwork for the appearance it's drawn in, so each appearance is drawn and
/// kept apart. Its name is how an icon's URL says which.
public enum IconAppearance: String, Hashable, Sendable, CaseIterable {
    case light, dark

    /// The light or dark half of `appearance`, Increase Contrast's included.
    public init(_ appearance: NSAppearance) {
        self = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? .dark : .light
    }

    var name: NSAppearance.Name { self == .dark ? .darkAqua : .aqua }
}

/// A square icon's size: its side in pixels, and how many pixels make a point. macOS draws other artwork for 16 pt at
/// 2x than for 32 pt at 1x, though both are 32 pixels, so the scale is part of the size.
public struct IconSize: Hashable, Sendable {
    public let pixels: Int
    public let scale: Int

    /// At most 1,024 pixels, so nothing can ask Pith for a huge drawing, and 1x to 3x.
    public init(pixels: Int, scale: Int) {
        self.pixels = min(1024, max(1, pixels))
        self.scale = min(3, max(1, scale))
    }

    public init(points: CGFloat, scale: CGFloat) {
        // Clamped before they become integers, which a NaN or an infinity can't.
        let pixels = (points * scale).rounded(), perPoint = scale.rounded()
        self.init(pixels: pixels.isFinite ? Int(min(1024, max(1, pixels))) : 1, scale: perPoint.isFinite ? Int(min(3, max(1, perPoint))) : 1)
    }

    public var points: CGFloat { CGFloat(pixels) / CGFloat(scale) }
}

/// One icon to draw: what, how big and in which appearance. The store keeps each drawing by its request.
public struct IconRequest: Hashable, Sendable {
    public let key: IconKey
    public let size: IconSize
    public let appearance: IconAppearance

    public init(_ key: IconKey, size: IconSize, appearance: IconAppearance) {
        self.key = key
        self.size = size
        self.appearance = appearance
    }
}

/// A drawn icon, in the two forms Pith shows: a bitmap for native views and PNG bytes for the disk map's page.
public struct RenderedIcon: Sendable {
    public let image: CGImage
    public let png: Data
    public let size: IconSize

    init?(image: CGImage, size: IconSize) {
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data as CFMutableData, UTType.png.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else { return nil }
        self.image = image
        png = data as Data
        self.size = size
    }

    /// The icon at its point size, for AppKit.
    public var nsImage: NSImage { NSImage(cgImage: image, size: NSSize(width: size.points, height: size.points)) }

    /// The memory it keeps: its bitmap and its PNG.
    var bytes: Int { image.bytesPerRow * image.height + png.count }
}

/// Draws the icons a store asks for. The store calls it off the main thread only, a few at a time, with iCloud
/// downloads off for the thread. Tests give a store one of their own.
public protocol IconRenderer: Sendable {
    /// The icon `request` asks for, drawn into a bitmap of its size, or nil when there's none, as for a place the
    /// table doesn't have.
    func render(_ request: IconRequest) -> CGImage?
}

/// Pith's icons, drawn once and kept. The first drawing of an icon at a size costs 6 to 35 ms, so the store never
/// draws on its caller's thread: it draws on a queue of its own, a few at a time, and keeps each drawing by key,
/// appearance and size, letting the least recently used go once it holds too many. Asking for an icon while it's being
/// drawn waits for that drawing.
public final class IconStore: @unchecked Sendable {
    /// Half the Mac's cores, from four to eight: the map's icons come quickly without crowding out everything else.
    public static let defaultConcurrency = min(8, max(4, ProcessInfo.processInfo.activeProcessorCount / 2))

    /// A kept drawing, linked to the drawings used just before and after it, so a use or an eviction costs the same
    /// however many are kept.
    private struct Kept {
        let icon: RenderedIcon
        var older: IconRequest?
        var newer: IconRequest?
    }

    private let renderer: any IconRenderer
    private let queue = OperationQueue()
    /// How many bytes of drawings the store keeps. Past it the least recently used go first.
    private let budget: Int
    private let lock = NSLock()
    private var cache: [IconRequest: Kept] = [:]
    /// The ends of the order the kept drawings were last used in.
    private var leastRecent: IconRequest?
    private var mostRecent: IconRequest?
    private var bytes = 0
    /// Who's waiting for each icon being drawn.
    private var waiting: [IconRequest: [@Sendable (RenderedIcon?) -> Void]] = [:]

    public init(renderer: any IconRenderer, concurrency: Int = IconStore.defaultConcurrency, budget: Int = 16 << 20) {
        self.renderer = renderer
        self.budget = budget
        queue.name = "app.bruhs.pith.icons"
        queue.maxConcurrentOperationCount = max(1, concurrency)
        queue.qualityOfService = .utility
    }

    /// The icon if it's drawn already, from any thread, without waiting. Showing it counts as a use.
    public func cachedIcon(for request: IconRequest) -> RenderedIcon? {
        lock.lock(); defer { lock.unlock() }
        return use(request)
    }

    /// The icon, drawn first unless it's kept. Nil when there's no such icon.
    public func icon(for request: IconRequest) async -> RenderedIcon? {
        if let kept = cachedIcon(for: request) { return kept }
        return await withCheckedContinuation { continuation in
            icon(for: request) { continuation.resume(returning: $0) }
        }
    }

    /// Calls `completion` with the icon: at once, on this thread, when it's kept; otherwise on the store's queue once
    /// it's drawn there. This thread never draws.
    public func icon(for request: IconRequest, completion: @escaping @Sendable (RenderedIcon?) -> Void) {
        lock.lock()
        if let kept = use(request) { lock.unlock(); completion(kept); return }
        let drawing = waiting[request] != nil
        waiting[request, default: []].append(completion)
        lock.unlock()
        guard !drawing else { return }
        queue.addOperation { [self] in draw(request) }
    }

    private func draw(_ request: IconRequest) {
        let icon = Self.withoutDownloads { renderer.render(request) }.flatMap { RenderedIcon(image: $0, size: request.size) }
        lock.lock()
        if let icon { keep(icon, for: request) }
        let waiters = waiting.removeValue(forKey: request) ?? []
        lock.unlock()
        for waiter in waiters { waiter(icon) }
    }

    /// Runs `body` with this thread's iCloud downloads off, as the scanner turns them off for its process: looking an
    /// icon up must never download a file. The thread's own setting comes back after, since the queue's threads go on
    /// to run other work.
    static func withoutDownloads<T>(_ body: () -> T) -> T {
        let earlier = getiopolicy_np(IOPOL_TYPE_VFS_MATERIALIZE_DATALESS_FILES, IOPOL_SCOPE_THREAD)
        setiopolicy_np(IOPOL_TYPE_VFS_MATERIALIZE_DATALESS_FILES, IOPOL_SCOPE_THREAD, IOPOL_MATERIALIZE_DATALESS_FILES_OFF)
        defer { if earlier >= 0 { setiopolicy_np(IOPOL_TYPE_VFS_MATERIALIZE_DATALESS_FILES, IOPOL_SCOPE_THREAD, earlier) } }
        return body()
    }

    /// The kept drawing for `request`, now the most recently used. Called with the lock held.
    private func use(_ request: IconRequest) -> RenderedIcon? {
        guard let kept = cache[request] else { return nil }
        if request != mostRecent {
            unlink(kept)
            append(kept.icon, for: request)
        }
        return kept.icon
    }

    /// Keeps `icon` as the most recently used, letting the least recently used drawings go once the kept ones pass the
    /// budget. Called with the lock held.
    private func keep(_ icon: RenderedIcon, for request: IconRequest) {
        if let earlier = cache[request] { unlink(earlier); bytes -= earlier.icon.bytes }
        append(icon, for: request)
        bytes += icon.bytes
        while bytes > budget, cache.count > 1, let oldest = leastRecent, let gone = cache.removeValue(forKey: oldest) {
            unlink(gone)
            bytes -= gone.icon.bytes
        }
    }

    /// Takes `kept` out of the order of use, joining its neighbours. Its own entry is left for the caller to replace or
    /// remove. Called with the lock held.
    private func unlink(_ kept: Kept) {
        if let older = kept.older { cache[older]?.newer = kept.newer } else { leastRecent = kept.newer }
        if let newer = kept.newer { cache[newer]?.older = kept.older } else { mostRecent = kept.older }
    }

    /// Keeps `icon` at the most recent end of the order of use. Called with the lock held.
    private func append(_ icon: RenderedIcon, for request: IconRequest) {
        cache[request] = Kept(icon: icon, older: mostRecent, newer: nil)
        if let mostRecent { cache[mostRecent]?.newer = request } else { leastRecent = request }
        mostRecent = request
    }
}

/// macOS's own icons, as NSWorkspace draws them for Finder: Pith ships none of Apple's art. A file's icon comes from
/// its type, never from opening it, and a place's from its special folder's type or the app it belongs to.
public struct SystemIconRenderer: IconRenderer {
    public let places: KnownPlaces
    /// The colour of a symbol standing in where macOS has no icon, as for iCloud Drive without its app.
    public let symbolColor: NSColor

    public init(places: KnownPlaces, symbolColor: NSColor = .secondaryLabelColor) {
        self.places = places
        self.symbolColor = symbolColor
    }

    public func render(_ request: IconRequest) -> CGImage? {
        guard let image = Self.image(for: request.key, places: places) else { return nil }
        return Self.draw(image, size: request.size, appearance: request.appearance, tint: image.isTemplate ? symbolColor : nil)
    }

    /// macOS's icon for `key`, not drawn yet. NSWorkspace's image picks its light or dark artwork as it's drawn, so a
    /// native view can show it as it is. A place key needs `places`.
    public static func image(for key: IconKey, places: KnownPlaces? = nil) -> NSImage? {
        let workspace = NSWorkspace.shared
        switch key {
        case .type(let pathExtension):
            // An extension no app claims gets a dynamic type, which draws the generic document.
            return workspace.icon(for: UTType(filenameExtension: pathExtension, conformingTo: .data) ?? .data)
        case .item(let path):
            return workspace.icon(forFile: path)
        case .folder:
            return workspace.icon(for: .folder)
        case .group:
            // A copy: the named image is shared, and drawings run on several threads at once.
            return NSImage(named: NSImage.multipleDocumentsName)?.copy() as? NSImage
        case .place(let id):
            // A place's app is drawn by its bundle's path only while Pith may look it up there (`KnownPlaces.mayShowApp`).
            guard let places, let place = places.place(id: id) else { return nil }
            switch places.drawnIcon(of: place) {
            case .type(let identifier): return workspace.icon(for: UTType(identifier) ?? .folder)
            case .app(_, let path): return workspace.icon(forFile: path)
            case .symbol(let name): return NSImage(systemSymbolName: name, accessibilityDescription: nil) ?? workspace.icon(for: .folder)
            }
        }
    }

    /// Draws `image` into a bitmap of `size` in `appearance`, which is when macOS picks its light or dark artwork. A
    /// symbol is fitted inside the square and filled with `tint`.
    static func draw(_ image: NSImage, size: IconSize, appearance: IconAppearance, tint: NSColor?) -> CGImage? {
        guard let space = CGColorSpace(name: CGColorSpace.displayP3),
              let context = CGContext(data: nil, width: size.pixels, height: size.pixels, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        context.scaleBy(x: CGFloat(size.scale), y: CGFloat(size.scale))
        let square = NSRect(x: 0, y: 0, width: size.points, height: size.points)
        var target = square
        if tint != nil, image.size.width > 0, image.size.height > 0 {
            let inset = square.insetBy(dx: size.points / 8, dy: size.points / 8)
            let fit = min(inset.width / image.size.width, inset.height / image.size.height)
            target = NSRect(x: inset.midX - image.size.width * fit / 2, y: inset.midY - image.size.height * fit / 2,
                            width: image.size.width * fit, height: image.size.height * fit)
        }
        let graphics = NSGraphicsContext(cgContext: context, flipped: false)
        graphics.imageInterpolation = .high
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = graphics
        NSAppearance(named: appearance.name)?.performAsCurrentDrawingAppearance {
            image.draw(in: target, from: .zero, operation: .sourceOver, fraction: 1)
            if let tint {
                tint.setFill()
                square.fill(using: .sourceAtop)
            }
        }
        NSGraphicsContext.restoreGraphicsState()
        return context.makeImage()
    }
}
