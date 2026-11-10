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
///
/// Increase Contrast isn't part of it, since macOS draws the same artwork with it: on macOS 26.3, a plain folder, the
/// Documents folder's type, Finder, the pdf, png and zip types, Safari, the full Trash and the Applications folder's
/// type, drawn at 16 pt at 1x and 2x, 32 pt and 128 pt at 2x, matched pixel for pixel in `.accessibilityHighContrastAqua`
/// and `.aqua`, and in `.accessibilityHighContrastDarkAqua` and `.darkAqua`, while light and dark differed by up to 42,063
/// of 65,536 pixels and a folder and Documents' by 812 of 4,096. The comparison drew in those appearances, with the Mac's
/// own Increase Contrast setting off. `SystemIconTests` draws the sample again in each.
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

/// A drawn icon, in the two forms Pith shows: a bitmap for native views, and PNG bytes for the disk map's page, which
/// only the page's icon route asks for (`IconStore.png(for:)`). Encoding a drawing as PNG took 0.08 to 0.15 ms an icon
/// on the development Mac (median, 16 to 64 px; 0.5 ms at most), and its PNG, 0.8 to 6.7 KB, can outweigh a small
/// bitmap, so an icon only native views show is never encoded: the first caller that asks encodes it once, and every
/// later one gets that PNG.
public final class RenderedIcon: @unchecked Sendable {
    public let image: CGImage
    public let size: IconSize
    private let lock = NSLock()
    /// The PNG once it's been encoded, or nil inside when it couldn't be; nil until then.
    private var encoded: Data??

    init(image: CGImage, size: IconSize) {
        self.image = image
        self.size = size
    }

    /// The icon at its point size, for AppKit.
    public var nsImage: NSImage { NSImage(cgImage: image, size: NSSize(width: size.points, height: size.points)) }

    /// The PNG, if it's been encoded.
    var png: Data? {
        lock.lock(); defer { lock.unlock() }
        return encoded ?? nil
    }

    /// The PNG, encoded with `encode` the first time and kept, and whether this call is the one that encoded it. A call
    /// made while another encodes waits for that encoding.
    func encodePNG(with encode: (CGImage) -> Data?) -> (png: Data?, isNew: Bool) {
        lock.lock(); defer { lock.unlock() }
        if let encoded { return (encoded, false) }
        let png = encode(image)
        encoded = .some(png)
        return (png, true)
    }

    /// The memory it keeps: its bitmap, and its PNG once encoded.
    var bytes: Int { bitmapBytes + (png?.count ?? 0) }

    var bitmapBytes: Int { image.bytesPerRow * image.height }

    /// `image` as PNG bytes, as the disk map's page loads an icon.
    public static func png(of image: CGImage) -> Data? {
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data as CFMutableData, UTType.png.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(destination, image, nil)
        return CGImageDestinationFinalize(destination) ? data as Data : nil
    }
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
/// drawn waits for that drawing. The disk map's page gets its icons as PNG, encoded on the same queue the first time it
/// asks for each (`png(for:)`); native views never need one.
public final class IconStore: @unchecked Sendable {
    /// Half the Mac's cores, from four to eight: the map's icons come quickly without crowding out everything else.
    public static let defaultConcurrency = min(8, max(4, ProcessInfo.processInfo.activeProcessorCount / 2))

    /// A kept drawing, linked to the drawings used just before and after it, so a use or an eviction costs the same
    /// however many are kept, with the bytes the budget counts for it: its bitmap, and its PNG once encoded.
    private struct Kept {
        let icon: RenderedIcon
        var counted: Int
        var older: IconRequest?
        var newer: IconRequest?
    }

    private let renderer: any IconRenderer
    private let encoder: @Sendable (CGImage) -> Data?
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

    /// A store drawing with `renderer`, a few at a time, within `budget` bytes, encoding the page's PNGs with `encoder`.
    public init(renderer: any IconRenderer, concurrency: Int = IconStore.defaultConcurrency, budget: Int = 16 << 20,
                encoder: @escaping @Sendable (CGImage) -> Data? = RenderedIcon.png(of:)) {
        self.renderer = renderer
        self.encoder = encoder
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

    /// The icon's PNG if it's drawn and encoded already, from any thread, without waiting or encoding. Showing it counts
    /// as a use.
    public func cachedPNG(for request: IconRequest) -> Data? {
        cachedIcon(for: request)?.png
    }

    /// The icon's PNG, for the disk map's page: drawn first unless it's kept, then encoded the first time the page asks,
    /// on the store's queue, never on this thread, and kept with the drawing, counting in the budget from then on. Nil
    /// when there's no such icon, or its PNG couldn't be made.
    public func png(for request: IconRequest) async -> Data? {
        guard let icon = await icon(for: request) else { return nil }
        if let png = icon.png { return png }
        return await withCheckedContinuation { continuation in
            queue.addOperation { [self] in continuation.resume(returning: encode(icon, for: request)) }
        }
    }

    /// Encodes `icon`'s PNG, drawn for `request`, once, and counts it while the store keeps that drawing.
    private func encode(_ icon: RenderedIcon, for request: IconRequest) -> Data? {
        let (png, isNew) = icon.encodePNG(with: encoder)
        guard isNew, let png else { return png }
        lock.lock()
        if cache[request]?.icon === icon {
            cache[request]?.counted += png.count
            bytes += png.count
            keepWithinBudget()
        }
        lock.unlock()
        return png
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
        let icon = Self.withoutDownloads { renderer.render(request) }.map { RenderedIcon(image: $0, size: request.size) }
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
            append(kept.icon, counted: kept.counted, for: request)
        }
        return kept.icon
    }

    /// Keeps `icon` as the most recently used, letting the least recently used drawings go once the kept ones pass the
    /// budget. Called with the lock held.
    private func keep(_ icon: RenderedIcon, for request: IconRequest) {
        if let earlier = cache[request] { unlink(earlier); bytes -= earlier.counted }
        let counted = icon.bytes
        append(icon, counted: counted, for: request)
        bytes += counted
        keepWithinBudget()
    }

    /// Lets the least recently used drawings go until the kept ones are within the budget, but for the last one. Called
    /// with the lock held.
    private func keepWithinBudget() {
        while bytes > budget, cache.count > 1, let oldest = leastRecent, let gone = cache.removeValue(forKey: oldest) {
            unlink(gone)
            bytes -= gone.counted
        }
    }

    /// Takes `kept` out of the order of use, joining its neighbours. Its own entry is left for the caller to replace or
    /// remove. Called with the lock held.
    private func unlink(_ kept: Kept) {
        if let older = kept.older { cache[older]?.newer = kept.newer } else { leastRecent = kept.newer }
        if let newer = kept.newer { cache[newer]?.older = kept.older } else { mostRecent = kept.older }
    }

    /// Keeps `icon`, counted as `counted` bytes, at the most recent end of the order of use. Called with the lock held.
    private func append(_ icon: RenderedIcon, counted: Int, for request: IconRequest) {
        cache[request] = Kept(icon: icon, counted: counted, older: mostRecent, newer: nil)
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
