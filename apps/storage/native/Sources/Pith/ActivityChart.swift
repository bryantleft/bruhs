import Charts
import PithCore
import SwiftUI

/// System CPU across the session window, and the table's time control: hover reads a moment,
/// dragging across a stretch ranks every app by it. With the keyboard, the arrow keys move the
/// cursor (Option for whole minutes) and Shift-arrow selects from where the cursor was.
struct ActivityChart: View {
    let model: ActivityModel
    let state: ActivityState
    /// The ranked range, already clipped to the history that still exists.
    let range: ClosedRange<Double>?
    /// The moment under the pointer or the keyboard cursor, in sample-clock seconds.
    @State private var cursor: Double?
    @State private var keyboardAnchor: Double?
    @FocusState private var focused: Bool

    var body: some View {
        let window = model.window ?? (-SessionHistory.retention)...0
        // Charts don't clip marks outside their domain, so without a latest sample there is nothing to place.
        let points = model.window == nil ? [] : MiniTrend.points(model.history.system.map { (time: $0.uptime, value: $0.cpu) }, maxGap: ActivityModel.maxGap)
        VStack(alignment: .leading, spacing: 10) {
            header(points, window: window)
            chart(points, window: window)
                .frame(height: 150)
                // Keyboard navigation reaches the chart like any other control; a click is for dragging, not focus.
                .focusable(interactions: .activate)
                .focused($focused)
                .onKeyPress(keys: [.leftArrow, .rightArrow]) { press in
                    moveCursor(press, window: window)
                    return .handled
                }
                .onChange(of: focused) { _, isFocused in
                    if !isFocused { setCursor(nil); keyboardAnchor = nil }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("CPU history, share of your Mac")
                .accessibilityValue(spokenSummary(window))
                .accessibilityChartDescriptor(CPUChartDescriptor(points: points, now: window.upperBound))
                .accessibilityAction(named: "Rank apps by the last minute") { rankRecent(60, window: window) }
                .accessibilityAction(named: "Rank apps by the last 5 minutes") { rankRecent(300, window: window) }
            footer(window: window)
        }
    }

    // MARK: Header

    private func header(_ points: [MiniTrend.Point], window: ClosedRange<Double>) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text("CPU").font(BruhsType.label).foregroundStyle(BruhsColor.text)
            Text("share of your Mac").font(BruhsType.body).foregroundStyle(BruhsColor.textSecondary)
            Spacer(minLength: 12)
            readout(points, window: window)
                .lineLimit(1)
                .accessibilityHidden(true)
        }
    }

    /// The hovered moment while there is one, then the ranked range's average and peak, otherwise now and the
    /// window's average and peak.
    @ViewBuilder private func readout(_ points: [MiniTrend.Point], window: ClosedRange<Double>) -> some View {
        if let cursor {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(verbatim: model.history.date(at: cursor).map(clockWithSeconds) ?? "")
                    .font(BruhsType.caption).foregroundStyle(BruhsColor.textTertiary)
                if let sample = nearest(points, to: cursor) {
                    Text(verbatim: percent(sample.value)).font(BruhsType.caption).foregroundStyle(BruhsColor.text)
                } else {
                    Text("No reading").font(BruhsType.note).foregroundStyle(BruhsColor.textTertiary)
                }
            }
        } else if let summary = model.history.systemCPU(in: range ?? window) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                if range == nil, let now = model.snapshot?.cpu { LabeledFigure(label: "Now", value: percent(now, glance: true)) }
                LabeledFigure(label: "Avg", value: percent(summary.average, glance: true))
                LabeledFigure(label: "Peak", value: percent(summary.peak, glance: true))
            }
        } else {
            Text("No readings yet").font(BruhsType.note).foregroundStyle(BruhsColor.textTertiary)
        }
    }

    // MARK: Chart

    private func chart(_ points: [MiniTrend.Point], window: ClosedRange<Double>) -> some View {
        let marked = cursor.flatMap { nearest(points, to: $0) }
        let ticks = model.snapshot.map {
            TimeAxis.ticks(endingAt: $0.uptime, date: $0.date, span: SessionHistory.retention, stepMinutes: 2, clearance: 50)
        } ?? []
        // Conditionals inside a Chart builder need macOS 27's conformances, so optional marks are 0- or 1-element ForEach.
        return Chart {
            ForEach(range.map { [$0] } ?? [], id: \.self) { range in
                RectangleMark(xStart: .value("Start", range.lowerBound), xEnd: .value("End", range.upperBound))
                    .foregroundStyle(BruhsColor.selection)
            }
            ForEach(points) { point in
                AreaMark(x: .value("Time", point.time), yStart: .value("Zero", 0), yEnd: .value("CPU", point.value), series: .value("Segment", point.segment))
                    .foregroundStyle(BruhsColor.chartFill)
                LineMark(x: .value("Time", point.time), y: .value("CPU", point.value), series: .value("Segment", point.segment))
                    .foregroundStyle(BruhsColor.accent)
                    .lineStyle(StrokeStyle(lineWidth: 1.5, lineJoin: .round))
            }
            ForEach(cursor.map { [$0] } ?? [], id: \.self) { time in
                RuleMark(x: .value("Time", time))
                    .foregroundStyle(BruhsColor.textTertiary)
                    .lineStyle(StrokeStyle(lineWidth: 1))
            }
            ForEach(marked.map { [$0] } ?? []) { point in
                PointMark(x: .value("Time", point.time), y: .value("CPU", point.value))
                    .foregroundStyle(BruhsColor.accent)
                    .symbolSize(28)
            }
        }
        .chartXScale(domain: window)
        .chartYScale(domain: 0...100)
        // Samples arrive every 2 s; live data jumps rather than animates.
        .transaction { $0.animation = nil }
        .chartYAxis {
            AxisMarks(position: .leading, values: [0, 50, 100]) { value in
                AxisGridLine(stroke: StrokeStyle(lineWidth: 1)).foregroundStyle(BruhsColor.hairline)
                AxisValueLabel {
                    let percent = value.as(Double.self) ?? 0
                    Text(percent == 0 ? "0" : "\(Int(percent))%").font(BruhsType.caption).foregroundStyle(BruhsColor.textTertiary)
                }
            }
        }
        .chartXAxis {
            // Labels sit 14 pt under the plot to leave room for the memory-pressure band.
            AxisMarks(values: ticks) { value in
                AxisValueLabel(verticalSpacing: 14) {
                    Text(value.as(Double.self).flatMap(model.history.date(at:)).map { PanelSummary.clock($0) } ?? "")
                        .font(BruhsType.caption).foregroundStyle(BruhsColor.textTertiary)
                }
            }
            AxisMarks(values: [window.upperBound]) { _ in
                AxisValueLabel(anchor: .topTrailing, verticalSpacing: 14) {
                    Text("now").font(BruhsType.caption).foregroundStyle(BruhsColor.textTertiary)
                }
            }
        }
        .chartOverlay { proxy in
            GeometryReader { geometry in
                if let anchor = proxy.plotFrame {
                    let plot = geometry[anchor]
                    interaction(proxy, window: window)
                        .frame(width: plot.width, height: plot.height)
                        .position(x: plot.midX, y: plot.midY)
                    PanelPressureBand(runs: PanelSummary.pressureRuns(model.history.system, window: window, interval: ActivityModel.interval, maxGap: ActivityModel.maxGap), window: window)
                        .frame(width: plot.width)
                        .position(x: plot.midX, y: plot.maxY + 6)
                    // Until ten minutes have passed, the left of the chart is time Pith wasn't running.
                    if let first = model.history.system.first, let empty = proxy.position(forX: first.uptime), empty > 160 {
                        Text("Collecting since \(PanelSummary.clock(first.date))")
                            .font(BruhsType.caption)
                            .foregroundStyle(BruhsColor.textTertiary)
                            .position(x: plot.minX + empty / 2, y: plot.midY)
                            .accessibilityHidden(true)
                    }
                }
            }
        }
    }

    /// Pointer input over the plot area. Hover moves the cursor; a drag ranks the range it covers;
    /// a click without a drag goes back to live.
    private func interaction(_ proxy: ChartProxy, window: ClosedRange<Double>) -> some View {
        Rectangle()
            .fill(.clear)
            .contentShape(Rectangle())
            .onContinuousHover { phase in
                switch phase {
                case .active(let location): setCursor(proxy.value(atX: location.x, as: Double.self))
                case .ended: if !focused { setCursor(nil) }
                }
            }
            .gesture(DragGesture(minimumDistance: 3).onChanged { drag in
                guard let start = proxy.value(atX: drag.startLocation.x, as: Double.self),
                      let end = proxy.value(atX: drag.location.x, as: Double.self) else { return }
                setCursor(end)
                rank(from: start, to: end, window: window)
            })
            .onTapGesture { state.backToLive() }
            .accessibilityHidden(true)
    }

    // MARK: Footer

    private func footer(window: ClosedRange<Double>) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("Memory pressure").font(BruhsType.body).foregroundStyle(BruhsColor.textSecondary)
                .accessibilityHidden(true)
            StatusChip(pressure: model.snapshot?.pressure ?? .unknown)
            if let note = pressureNote(PanelSummary.pressureStory(model.history.system, window: window, maxGap: ActivityModel.maxGap)) {
                Text(note).font(BruhsType.caption).foregroundStyle(BruhsColor.textSecondary).lineLimit(1)
            }
            Spacer(minLength: 12)
            if range == nil {
                Text("Drag across the chart to rank apps by that time")
                    .font(BruhsType.note)
                    .foregroundStyle(BruhsColor.textTertiary)
                    .lineLimit(1)
                    .accessibilityHidden(true)
            }
        }
    }

    /// The most recent stretch of elevated pressure, read after the chip's current state: "Elevated" then
    /// "Since 10:41", or "Normal" then "Last elevated 10:37 to 10:39". Nothing while the whole window was normal.
    private func pressureNote(_ story: PanelSummary.PressureStory) -> String? {
        guard case let .elevated(start, end, worst) = story else { return nil }
        let critical = worst == .critical ? ", reached critical" : ""
        guard let end else { return "Since \(PanelSummary.clock(start))\(critical)" }
        let (from, to) = (PanelSummary.clock(start), PanelSummary.clock(end))
        return (from == to ? "Last elevated at \(from)" : "Last elevated \(from) to \(to)") + critical
    }

    // MARK: Input

    private func setCursor(_ time: Double?) {
        if time != cursor { cursor = time }
    }

    private func rank(from start: Double, to end: Double, window: ClosedRange<Double>) {
        let lower = max(window.lowerBound, min(start, end)), upper = min(window.upperBound, max(start, end))
        // A range must hold at least one sample interval to have anything to rank.
        if upper - lower >= ActivityModel.interval { state.rank(by: lower...upper) }
    }

    private func rankRecent(_ seconds: Double, window: ClosedRange<Double>) {
        rank(from: window.upperBound - seconds, to: window.upperBound, window: window)
    }

    private func moveCursor(_ press: KeyPress, window: ClosedRange<Double>) {
        let step: Double = press.modifiers.contains(.option) ? 60 : 10
        let from = cursor ?? window.upperBound
        let to = min(window.upperBound, max(window.lowerBound, from + (press.key == .leftArrow ? -step : step)))
        if press.modifiers.contains(.shift) {
            let anchor = keyboardAnchor ?? from
            keyboardAnchor = anchor
            rank(from: anchor, to: to, window: window)
        } else {
            keyboardAnchor = nil
        }
        cursor = to
    }

    private func nearest(_ points: [MiniTrend.Point], to time: Double) -> MiniTrend.Point? {
        guard let point = points.min(by: { abs($0.time - time) < abs($1.time - time) }), abs(point.time - time) <= ActivityModel.interval else { return nil }
        return point
    }

    private func spokenSummary(_ window: ClosedRange<Double>) -> String {
        guard let summary = model.history.systemCPU(in: window) else { return "No readings yet" }
        let now = model.snapshot?.cpu.map { "Now \(Int($0.rounded())) percent. " } ?? ""
        let span = model.historyStart.map { "Since \(PanelSummary.clock($0))" } ?? "Last 10 minutes"
        return "\(now)\(span): average \(Int(summary.average.rounded())) percent, peak \(Int(summary.peak.rounded())) percent."
    }
}

/// The CPU series for Audio Graphs: time as seconds before now, CPU as a percentage.
private struct CPUChartDescriptor: AXChartDescriptorRepresentable {
    let points: [MiniTrend.Point]
    let now: Double

    func makeChartDescriptor() -> AXChartDescriptor {
        let time = AXNumericDataAxisDescriptor(title: "Time", range: -SessionHistory.retention...0, gridlinePositions: []) { seconds in
            seconds > -1 ? "now" : Duration.seconds(-seconds.rounded()).formatted(.units(allowed: [.minutes, .seconds], width: .wide)) + " ago"
        }
        let cpu = AXNumericDataAxisDescriptor(title: "CPU", range: 0...100, gridlinePositions: [0, 50, 100]) { "\(Int($0.rounded())) percent" }
        return AXChartDescriptor(title: "CPU over the last 10 minutes", summary: nil, xAxis: time, yAxis: cpu, series: [series])
    }

    func updateChartDescriptor(_ descriptor: AXChartDescriptor) {
        descriptor.series = [series]
    }

    private var series: AXDataSeriesDescriptor {
        AXDataSeriesDescriptor(name: "CPU, share of your Mac", isContinuous: true, dataPoints: points.map { AXDataPoint(x: $0.time - now, y: $0.value) })
    }
}
