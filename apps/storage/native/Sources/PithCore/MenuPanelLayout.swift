import Foundation
import CoreGraphics

public enum MenuPanelLayout {
    /// The panel's content at 340 pt wide (312 pt inside 14 pt padding) with the bundled Monaspace measures
    /// up to 604.5 pt tall in every state: collecting, live, elevated pressure, paused and unavailable, with the CPU
    /// tiers, memory figures and the System row. Measured offscreen on 2026-11-07 at the default text size; bigger
    /// text scrolls. StatusItemController.panelContentFits turns false if the content outgrows this.
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
