import AppKit
import PithCore

/// The smoke test's check that the icons Pith shows by type are macOS's own art, never the generic document.
extension AppDelegate {
    /// Every known place this Mac has, and the types macOS declares itself that most files on a disk are, draw as more
    /// than the generic document: macOS draws a type it has no icon for, or a special folder's type it doesn't declare,
    /// as the blank page any unknown file gets, which says nothing of what a place or a file is. Each is drawn by the
    /// app's icon store, as the map's page and the native views draw it, at 16 pt at 2x in light and in dark, and compared
    /// pixel for pixel with the generic document drawn at the same size in the same appearance
    /// (`IconStore.genericDrawings`). One that draws as it, or draws nothing, is named. CI's macOS 15 job runs it too,
    /// where the Swift tests don't run.
    func checkNoGenericIcons() async -> [String: Bool] {
        let places = Icons.places
        let keys = (places.places + [places.emptyTrash].compactMap { $0 }).map { IconKey.place($0.id) } + Self.commonTypes.map(IconKey.type)
        let generic = await Icons.store.genericDrawings(of: keys, size: IconSize(points: 16, scale: 2))
        print("generic icons: \(keys.count) keys, \(keys.count - Self.commonTypes.count) places and \(Self.commonTypes.count) types, drawn in light and "
              + "dark; \(generic.isEmpty ? "none draws as the generic document" : "the generic document for \(generic.map(\.description).joined(separator: "; "))")")
        return ["places_and_types_have_their_own_icons": generic.isEmpty]
    }

    /// Types macOS declares itself, which most files on a disk are: documents, pictures, films, music, archives, disk
    /// images and text.
    static let commonTypes = ["pdf", "png", "jpeg", "mov", "mp3", "zip", "dmg", "txt"]

    /// How closely `window`'s bottom left corner, where the bar under the map leads with the selection's icon, shows
    /// each of `drawings`, as the window's pixels are composited now (`cacheDisplay`): for each, the least mean difference,
    /// out of 255 a channel, over the pixels its drawing covers whole, at the place it matches best. Only those pixels are
    /// compared, so the bar's own colour, which follows the appearance too, counts for nothing. Each drawing is put in the
    /// window's colour space first, as macOS does to show it. Nil when the window can't be read.
    static func cornerShows(_ drawings: [CGImage], in window: NSWindow) -> [Double]? {
        guard let content = window.contentView, let picture = content.bitmapImageRepForCachingDisplay(in: content.bounds) else { return nil }
        content.cacheDisplay(in: content.bounds, to: picture)
        guard let shot = picture.cgImage, let space = shot.colorSpace ?? CGColorSpace(name: CGColorSpace.sRGB),
              let screen = Self.rgba(shot, in: space) else { return nil }
        let scale = Double(shot.width) / Double(content.bounds.width)
        // The bar is 52 pt high at least; its icon comes after its padding, well inside the first 200 pt.
        let columns = 0..<min(screen.width, Int(200 * scale)), rows = max(0, screen.height - Int(80 * scale))..<screen.height
        return drawings.map { drawing in
            guard let icon = Self.rgba(drawing, in: space) else { return .infinity }
            // The pixels it covers whole, each as its offset in the drawing.
            var covered: [(x: Int, y: Int)] = []
            for y in 0..<icon.height {
                for x in 0..<icon.width where icon.bytes[(y * icon.width + x) * 4 + 3] == 255 { covered.append((x, y)) }
            }
            guard !covered.isEmpty else { return .infinity }
            let channels = Double(covered.count * 3)
            var best = Double.infinity
            for top in rows where top + icon.height <= screen.height {
                for left in columns where left + icon.width <= screen.width {
                    let limit = best * channels
                    var sum = 0
                    for pixel in covered {
                        let at = ((top + pixel.y) * screen.width + left + pixel.x) * 4, own = (pixel.y * icon.width + pixel.x) * 4
                        for channel in 0..<3 { sum += abs(Int(screen.bytes[at + channel]) - Int(icon.bytes[own + channel])) }
                        if Double(sum) >= limit { break }
                    }
                    best = min(best, Double(sum) / channels)
                }
            }
            return best
        }
    }

    /// `image`'s pixels, premultiplied RGBA, its top row first, in the colour space `space`.
    private static func rgba(_ image: CGImage, in space: CGColorSpace) -> (width: Int, height: Int, bytes: [UInt8])? {
        var bytes = [UInt8](repeating: 0, count: image.width * image.height * 4)
        let drawn = bytes.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(data: buffer.baseAddress, width: image.width, height: image.height, bitsPerComponent: 8, bytesPerRow: image.width * 4,
                                          space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
            return true
        }
        return drawn ? (image.width, image.height, bytes) : nil
    }
}
