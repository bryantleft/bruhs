import PithCore
import SwiftUI

/// The glance panel under the menu bar item. The system popover owns the glass, so this is only content:
/// value, chart and parts for CPU and memory, the busiest apps, the startup disk, then actions.
struct MenuPanel: View {
    let model: ActivityModel
    let size: CGSize
    let actions: PanelActions
    /// Reports the content's natural height, so the controller can tell when the panel has to scroll.
    var contentHeight: (CGFloat) -> Void = { _ in }

    var body: some View {
        let collecting = PanelSummary.isCollecting(model.snapshot)
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: 0) {
                    PanelCPUSection(model: model)
                    PanelDivider()
                    PanelMemorySection(model: model)
                    PanelDivider()
                    PanelAppsSection(model: model, open: actions.openActivity)
                    PanelDivider()
                    PanelDiskSection(model: model, open: actions.openDisk)
                }
                // Until the first rates arrive the sections keep their space, so the panel opens at the size it
                // keeps, with the actions already in place.
                .opacity(collecting ? 0 : 1)
                .disabled(collecting)
                .accessibilityHidden(collecting)
                .overlay {
                    if collecting {
                        Text("Collecting activity…").font(BruhsType.body).foregroundStyle(BruhsColor.textSecondary)
                    }
                }
                PanelFooter(actions: actions)
                    .padding(.top, 12)
                PanelStatusLine(model: model)
                    .padding(.top, 10)
                    .opacity(collecting ? 0 : 1)
                    .accessibilityHidden(collecting)
            }
            .padding(14)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight($0) }
        }
        .scrollBounceBehavior(.basedOnSize)
        .frame(width: size.width, height: size.height)
        .background(BruhsColor.canvas)
        .tint(BruhsColor.accent)
    }
}
