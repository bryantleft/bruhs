import Foundation

/// A key that drew as the generic document in an appearance, or drew nothing at all, the generic document's own key among
/// them when it drew nothing to compare with (`IconStore.genericDrawings`).
public struct GenericDrawing: Equatable, Sendable, CustomStringConvertible {
    public let key: IconKey
    public let appearance: IconAppearance
    public let drewNothing: Bool

    /// The generic document's key: a file with no extension's type.
    public static let genericDocument = IconKey.type("")

    public var description: String {
        let name = key == Self.genericDocument ? "the generic document" : key.string
        return "\(name) in \(appearance.rawValue)\(drewNothing ? ", drawing nothing" : "")"
    }
}

extension IconStore {
    /// Which of `keys` draw as the generic document, or draw nothing, at `size` in each appearance, light then dark: each
    /// is compared pixel for pixel with the generic document, a file with no extension's type, drawn by this store at
    /// the same size in the same appearance. macOS draws a type it has no icon for, or a special folder's type it doesn't
    /// declare, as that blank page, which says nothing of what a place or a file is. Where the generic document itself
    /// draws nothing, there's nothing to compare with, so it's named first, and only keys that draw nothing are named
    /// with it.
    public func genericDrawings(of keys: [IconKey], size: IconSize) async -> [GenericDrawing] {
        var found: [GenericDrawing] = []
        for appearance in IconAppearance.allCases {
            let blank = await pixels(GenericDrawing.genericDocument, size: size, appearance: appearance)
            if blank == nil { found.append(GenericDrawing(key: GenericDrawing.genericDocument, appearance: appearance, drewNothing: true)) }
            for key in keys {
                let drawn = await pixels(key, size: size, appearance: appearance)
                if drawn == nil || (blank != nil && drawn == blank) { found.append(GenericDrawing(key: key, appearance: appearance, drewNothing: drawn == nil)) }
            }
        }
        return found
    }

    /// `key`'s drawing's pixels, as this store drew them, or nil when there's none.
    private func pixels(_ key: IconKey, size: IconSize, appearance: IconAppearance) async -> Data? {
        await icon(for: IconRequest(key, size: size, appearance: appearance))?.image.dataProvider?.data as Data?
    }
}
