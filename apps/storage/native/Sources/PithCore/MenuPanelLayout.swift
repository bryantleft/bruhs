import Foundation
import CoreGraphics

public enum MenuPanelLayout {
    /// A stable viewport at 340 pt wide (312 pt inside padding). The collapsed panel fits at the default text size;
    /// expanded memory details, larger text and short displays can scroll. UIAudit records natural content heights.
    public static let idealSize = CGSize(width: 340, height: 608)

    public static func contentSize(anchor: CGRect, visibleFrame: CGRect) -> CGSize {
        // Reserve space for the popover arrow and window chrome below the menu bar.
        let inset: CGFloat = 16
        return CGSize(
            width: min(idealSize.width, max(1, visibleFrame.width - 2 * inset)),
            height: min(idealSize.height, max(1, anchor.minY - visibleFrame.minY - 2 * inset))
        )
    }
}
