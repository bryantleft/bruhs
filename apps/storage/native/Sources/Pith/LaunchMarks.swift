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

/// Thin dashed lines where apps opened, so a rise lines up with what started it. `LaunchLabels` names them.
struct LaunchMarks: ChartContent {
    let markers: [LaunchMarker]

    var body: some ChartContent {
        ForEach(markers) { marker in
            RuleMark(x: .value("Opened", marker.x))
                .foregroundStyle(BruhsColor.textTertiary.opacity(0.6))
                .lineStyle(StrokeStyle(lineWidth: 1, dash: [2, 3]))
        }
    }
}

/// The names of the apps that opened, along the top of the plot beside their lines. Placed together rather than
/// each beside its own line, so apps that opened within moments share a label rather than covering each other.
/// VoiceOver hears every name in the chart's summary.
struct LaunchLabels: View {
    let markers: [LaunchMarker]
    let proxy: ChartProxy
    let plot: CGRect

    var body: some View {
        let marks = markers.compactMap { marker in proxy.position(forX: marker.x).map { MarkLabels.Mark(x: $0, name: marker.launch.name) } }
        let labels = MarkLabels.place(marks, width: plot.width) { ($0 as NSString).size(withAttributes: [.font: BruhsType.captionFace]).width }
        ZStack(alignment: .topLeading) {
            ForEach(Array(labels.enumerated()), id: \.offset) { _, label in
                Text(label.text)
                    .font(BruhsType.caption)
                    .foregroundStyle(BruhsColor.textTertiary)
                    .lineLimit(1)
                    .fixedSize()
                    .offset(x: label.x)
            }
        }
        .frame(width: plot.width, height: plot.height, alignment: .topLeading)
        .position(x: plot.midX, y: plot.midY)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
