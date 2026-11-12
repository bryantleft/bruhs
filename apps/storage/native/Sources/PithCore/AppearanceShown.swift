import AppKit
import UniformTypeIdentifiers

/// What the smoke test's check of the bar under the map found of one appearance: whether the bar showed the selected
/// folder's icon as the store draws it in that appearance, rather than as it draws it in the other.
public enum AppearanceShown: Equatable, Sendable {
    /// The bar showed the drawing of its appearance, which differs from the other appearance's.
    case shown
    /// The bar showed a drawing that's alike in both appearances, on a macOS that draws a folder's light and dark art
    /// alike (`macOSDrawsFoldersAlike`): the check can't tell here which appearance the bar follows, and says so rather
    /// than failing.
    case notProvenHere
    /// The bar didn't show the drawing, or showed one alike in both appearances where macOS draws a folder's light and
    /// dark art differently, so the store was asked for the wrong drawing, or for none of its own.
    case failed

    /// The verdict for the bar showing the store's drawing for the appearance (`matches`), when that drawing and the other
    /// appearance's are `alike` or not, and macOS itself draws a folder alike in light and dark (`foldersAlike`) or not.
    public static func judge(matches: Bool, alike: Bool, foldersAlike: Bool) -> AppearanceShown {
        guard matches else { return .failed }
        guard alike else { return .shown }
        return foldersAlike ? .notProvenHere : .failed
    }

    /// Whether this macOS draws a plain folder's light and dark art alike, drawn straight from NSWorkspace rather than
    /// through the store, so a store that ignores the appearance can't make it so. This Mac's macOS 26.3 draws them
    /// differently and CI's 26.7.2 alike, and where they're alike no drawing of a folder shows the appearance it followed.
    public static func macOSDrawsFoldersAlike() -> Bool {
        let folder = NSWorkspace.shared.icon(for: .folder)
        func drawn(_ name: NSAppearance.Name) -> Data? {
            guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 32, pixelsHigh: 32, bitsPerSample: 8, samplesPerPixel: 4,
                                                hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
                  let context = NSGraphicsContext(bitmapImageRep: bitmap) else { return nil }
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current = context
            NSAppearance(named: name)?.performAsCurrentDrawingAppearance {
                folder.draw(in: NSRect(x: 0, y: 0, width: 32, height: 32))
            }
            NSGraphicsContext.restoreGraphicsState()
            return bitmap.bitmapData.map { Data(bytes: $0, count: bitmap.bytesPerRow * bitmap.pixelsHigh) }
        }
        return alike(drawn(.aqua), drawn(.darkAqua))
    }

    /// Two drawings of one icon are alike when both painted something and their pixels are the same. A drawing that
    /// failed, or painted nothing, can't show the art is alike, so it counts as unlike and the checks relying on it run.
    static func alike(_ light: Data?, _ dark: Data?) -> Bool {
        guard let light, let dark, light.contains(where: { $0 != 0 }) else { return false }
        return light == dark
    }
}
