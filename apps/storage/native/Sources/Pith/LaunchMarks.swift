import Charts
import PithCore
import SwiftUI

/// An app opening, placed on a chart's own time axis.
struct LaunchMarker: Identifiable {
    let launch: AppLaunch
    /// Where on the chart's x axis it falls.
    let x: Double
    var id: String { launch.id }

    /// At most this many per chart, the latest: more would cover the line they're there to explain.
    static let limit = 6

    /// "Xcode opened at 2:14 PM", for the charts' spoken summaries.
    static func spoken(_ markers: [LaunchMarker]) -> String {
        guard !markers.isEmpty else { return "" }
        let opened = markers.map { "\($0.launch.name) at \(PanelSummary.clock($0.launch.date))" }
        return " Opened: \(opened.joined(separator: ", "))."
    }
}

/// Thin dashed lines where apps opened, each named beside its top, so a rise lines up with what started it.
struct LaunchMarks: ChartContent {
    let markers: [LaunchMarker]

    var body: some ChartContent {
        ForEach(markers) { marker in
            RuleMark(x: .value("Opened", marker.x))
                .foregroundStyle(BruhsColor.textTertiary.opacity(0.6))
                .lineStyle(StrokeStyle(lineWidth: 1, dash: [2, 3]))
                .annotation(position: .trailing, alignment: .top, spacing: 3, overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) {
                    Text(marker.launch.name)
                        .font(BruhsType.caption)
                        .foregroundStyle(BruhsColor.textTertiary)
                        .lineLimit(1)
                }
        }
    }
}
