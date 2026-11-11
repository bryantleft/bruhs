import Foundation

/// What the smoke test's check of the bar under the map found of one appearance: whether the bar showed the selected
/// folder's icon as the store draws it in that appearance, rather than as it draws it in the other.
public enum AppearanceShown: Equatable, Sendable {
    /// The bar showed the drawing of its appearance, which differs from the other appearance's.
    case shown
    /// The bar showed a drawing that's alike in both appearances, on a macOS whose art for a folder can be alike: the
    /// check can't tell here which appearance the bar follows, and says so rather than failing.
    case notProvenHere
    /// The bar didn't show the drawing, or showed one alike in both appearances on macOS 26 or later, where a folder's
    /// light and dark art differ (`testIconsAreDrawnInTheAppearanceAskedFor`, VERIFICATION.md), so alike there means the
    /// store was asked for the wrong drawing, or for none of its own.
    case failed

    /// The first macOS on which a folder's light and dark art differ, as Pith's tests and runs have found them.
    public static let foldersDifferFrom = 26

    /// The verdict for the bar showing the store's drawing for the appearance (`matches`), when that drawing and the other
    /// appearance's are `alike` or not, on macOS `macOSMajor`.
    public static func judge(matches: Bool, alike: Bool, macOSMajor: Int) -> AppearanceShown {
        guard matches else { return .failed }
        guard alike else { return .shown }
        return macOSMajor >= foldersDifferFrom ? .failed : .notProvenHere
    }
}
