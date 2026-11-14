import Charts
import PithCore
import SwiftUI

/// CPU or memory across hours or days of kept history, and the table's time control for them: hover reads a bucket
/// and who used the most in it, dragging across a stretch ranks every app by it.
struct ActivityHistoryChart: View {
    let model: ActivityModel
    let state: ActivityState
    @State private var cursor: Date?
    @State private var keyboardAnchor: Date?
    @FocusState private var focused: Bool

    private var metric: ChartMetric { state.chartMetric }
    private var span: HistorySpan { state.span }

    /// Apps that opened inside the chart's span while history was kept.
    private func launches(domain: ClosedRange<Double>) -> [LaunchMarker] {
        model.longHistory.launches
            .filter { domain.contains($0.date.timeIntervalSince1970) }
            .suffix(LaunchMarker.limit)
            .map { LaunchMarker(launch: $0, x: $0.date.timeIntervalSince1970) }
    }

    private func value(_ bucket: HistoryBucket) -> Double? {
        switch metric {
        case .cpu: bucket.cpu
        case .memory: bucket.memoryUsed.flatMap { used in bucket.memoryPhysical.map { $0 > 0 ? Double(used) / Double($0) * 100 : 0 } }
        }
    }

    var body: some View {
        let now = model.snapshot?.date ?? Date()
        let buckets = model.longHistory.buckets(span, now: now)
        let domain = now.addingTimeInterval(-span.seconds).timeIntervalSince1970...now.timeIntervalSince1970
        let step = span == .sevenDays ? LongHistory.coarse : LongHistory.fine
        let points = MiniTrend.points(buckets.map { (time: $0.start.timeIntervalSince1970 + $0.duration / 2, value: value($0)) }, maxGap: step * 2.5)
        VStack(alignment: .leading, spacing: 10) {
            ActivityChartHeader(state: state, keepsHistory: model.keepsHistory) {
                readout(buckets)
            }
            chart(points, buckets: buckets, domain: domain)
                .frame(height: 150)
                .focusable(interactions: .activate)
                .focused($focused)
                .onKeyPress(keys: [.leftArrow, .rightArrow]) { press in
                    moveCursor(press, domain: domain)
                    return .handled
                }
                .onChange(of: focused) { _, focused in
                    if !focused { cursor = nil; keyboardAnchor = nil }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(metric.title) over the last \(span.title)")
                .accessibilityValue(spokenSummary(buckets) + LaunchMarker.spoken(launches(domain: domain)))
                .accessibilityChartDescriptor(CPUChartDescriptor(points: points, now: domain.upperBound, metric: metric, span: span))
                .accessibilityAction(named: "Rank apps by the last hour") { rank(from: max(domain.lowerBound, domain.upperBound - 3600), to: domain.upperBound) }
                .accessibilityAction(named: "Rank apps by the full visible history") { rank(from: domain.lowerBound, to: domain.upperBound) }
            HStack {
                if buckets.isEmpty {
                    Text("History builds while Pith runs.")
                        .font(BruhsType.note).foregroundStyle(BruhsColor.textTertiary)
                }
                Spacer(minLength: 12)
                Text("Drag to rank apps")
                    .font(BruhsType.note)
                    .foregroundStyle(BruhsColor.textTertiary)
                    .help("Drag across a time range to rank apps by their activity in that range.")
                    .accessibilityHidden(true)
            }
        }
        .onChange(of: span) { cursor = nil; keyboardAnchor = nil }
    }

    @ViewBuilder private func readout(_ buckets: [HistoryBucket]) -> some View {
        let selected = buckets.filter { bucket in state.longRange.map { $0.overlaps(bucket.start...bucket.end) } ?? true }
        let shown = selected.compactMap(value)
        if let cursor {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(verbatim: when(cursor)).font(BruhsType.caption).foregroundStyle(BruhsColor.textTertiary)
                if let reading = buckets.first(where: { $0.start <= cursor && cursor < $0.end }).flatMap(value) {
                    Text(verbatim: figure(reading)).font(BruhsType.caption).foregroundStyle(BruhsColor.text)
                } else { Text("No reading").font(BruhsType.note).foregroundStyle(BruhsColor.textTertiary) }
            }
        } else if let highestAverage = shown.max() {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                let average = shown.reduce(0, +) / Double(shown.count)
                LabeledFigure(label: "Avg", value: figure(average), amount: average)
                // CPU buckets retain actual sample peaks. Memory retains averages only, so label that distinction.
                if metric == .cpu, let peak = selected.compactMap(\.cpuPeak).max() {
                    LabeledFigure(label: "Peak", value: figure(peak), amount: peak)
                } else if metric == .memory {
                    LabeledFigure(label: "Peak avg", value: figure(highestAverage), amount: highestAverage)
                }
            }
        }
    }

    private func figure(_ value: Double) -> String {
        switch metric {
        case .cpu: percent(value, glance: true)
        case .memory: memorySize(UInt64(value / 100 * Double(model.snapshot?.memory?.physical ?? ProcessInfo.processInfo.physicalMemory)))
        }
    }

    private func spokenSummary(_ buckets: [HistoryBucket]) -> String {
        let say = { (number: Double) in figure(number).replacingOccurrences(of: "%", with: " percent") }
        if let cursor {
            let reading = buckets.first(where: { $0.start <= cursor && cursor < $0.end }).flatMap(value)
            return "\(when(cursor)): \(reading.map { say($0) + " bucket average" } ?? "no reading")."
        }
        let selected = buckets.filter { bucket in state.longRange.map { $0.overlaps(bucket.start...bucket.end) } ?? true }
        let values = selected.compactMap(value)
        guard let highestAverage = values.max() else { return "No kept history yet." }
        let average = values.reduce(0, +) / Double(values.count)
        let peak = metric == .cpu ? selected.compactMap(\.cpuPeak).max().map { " Sample peak \(say($0))." } ?? "" : " Highest bucket average \(say(highestAverage))."
        return "Average \(say(average)).\(peak)"
    }

    /// A bucket's time: the clock within a day, the weekday and clock across days.
    private func when(_ date: Date) -> String {
        span == .sevenDays ? date.formatted(.dateTime.weekday(.abbreviated).hour().minute()) : PanelSummary.clock(date)
    }

    private func chart(_ points: [MiniTrend.Point], buckets: [HistoryBucket], domain: ClosedRange<Double>) -> some View {
        let range = state.longRange.map { $0.lowerBound.timeIntervalSince1970...$0.upperBound.timeIntervalSince1970 }
        let ticks = span == .sevenDays
            ? stride(from: Calendar.current.startOfDay(for: Date(timeIntervalSince1970: domain.lowerBound)).addingTimeInterval(86400).timeIntervalSince1970, through: domain.upperBound, by: 86400).map { $0 }
            : stride(from: (domain.lowerBound / 3600).rounded(.up) * 3600, through: domain.upperBound - 600, by: 3600).map { $0 }
        return Chart {
            ForEach(range.map { [$0] } ?? [], id: \.self) { range in
                RectangleMark(xStart: .value("Start", range.lowerBound), xEnd: .value("End", range.upperBound))
                    .foregroundStyle(BruhsColor.selection)
            }
            ForEach(points) { point in
                AreaMark(x: .value("Time", point.time), yStart: .value("Zero", 0), yEnd: .value("Value", point.value), series: .value("Segment", point.segment))
                    .foregroundStyle(metric == .cpu ? BruhsColor.chartFill : ActivityPalette.memoryFill)
                LineMark(x: .value("Time", point.time), y: .value("Value", point.value), series: .value("Segment", point.segment))
                    .foregroundStyle(metric == .cpu ? BruhsColor.accent : ActivityPalette.memory)
                    .lineStyle(StrokeStyle(lineWidth: 1.5, lineJoin: .round))
            }
            LaunchMarks(markers: launches(domain: domain))
            ForEach(cursor.map { [$0.timeIntervalSince1970] } ?? [], id: \.self) { time in
                RuleMark(x: .value("Time", time)).foregroundStyle(BruhsColor.textTertiary).lineStyle(StrokeStyle(lineWidth: 1))
            }
        }
        .chartXScale(domain: domain)
        .chartYScale(domain: 0...100)
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
            AxisMarks(values: ticks) { value in
                AxisValueLabel(verticalSpacing: 14) {
                    let date = Date(timeIntervalSince1970: value.as(Double.self) ?? 0)
                    Text(span == .sevenDays ? date.formatted(.dateTime.weekday(.abbreviated)) : PanelSummary.clock(date))
                        .font(BruhsType.caption).foregroundStyle(BruhsColor.textTertiary)
                }
            }
        }
        .chartOverlay { proxy in
            GeometryReader { geometry in
                if let anchor = proxy.plotFrame {
                    let plot = geometry[anchor]
                    interaction(proxy)
                        .frame(width: plot.width, height: plot.height)
                        .position(x: plot.midX, y: plot.midY)
                    LaunchLabels(markers: launches(domain: domain), proxy: proxy, plot: plot)
                    PanelPressureBand(runs: runs(buckets), window: domain)
                        .frame(width: plot.width)
                        .position(x: plot.midX, y: plot.maxY + 6)
                    if let cursor, let x = proxy.position(forX: cursor.timeIntervalSince1970),
                       let bucket = buckets.first(where: { $0.start <= cursor && cursor < $0.end }) {
                        let busiest = top(bucket)
                        if !busiest.isEmpty {
                            BucketApps(apps: busiest, figure: { metric == .cpu ? percent($0) : memorySize(UInt64($0)) }, executable: { model.longHistory.identities[$0]?.executable ?? "" })
                                .fixedSize()
                                .position(x: plot.minX + x + (x > plot.width * 0.6 ? -100 : 100), y: plot.minY + 36)
                                .allowsHitTesting(false)
                                .accessibilityHidden(true)
                        }
                    }
                }
            }
        }
    }

    /// The bucket's three busiest apps by the charted metric, with their names from the kept identities.
    private func top(_ bucket: HistoryBucket) -> [(name: String, id: String, value: Double)] {
        bucket.apps.compactMap { app -> (String, String, Double)? in
            guard let name = model.longHistory.identities[app.id]?.name, let value = metric == .cpu ? app.cpu : app.memory.map({ Double($0) }), value > 0 else { return nil }
            return (name, app.id, value)
        }
        .sorted { $0.2 > $1.2 }
        .prefix(3)
        .map { (name: $0.0, id: $0.1, value: $0.2) }
    }

    /// Each bucket's worst pressure, merged into runs for the lane under the chart.
    private func runs(_ buckets: [HistoryBucket]) -> [PanelSummary.PressureRun] {
        var runs: [PanelSummary.PressureRun] = []
        for bucket in buckets where bucket.pressure != .unknown {
            let start = bucket.start.timeIntervalSince1970, end = bucket.end.timeIntervalSince1970
            if let last = runs.last, last.pressure == bucket.pressure, start - last.end <= bucket.duration {
                runs[runs.count - 1] = PanelSummary.PressureRun(start: last.start, end: end, pressure: bucket.pressure)
            } else {
                runs.append(PanelSummary.PressureRun(start: start, end: end, pressure: bucket.pressure))
            }
        }
        return runs
    }

    private func interaction(_ proxy: ChartProxy) -> some View {
        Rectangle()
            .fill(.clear)
            .contentShape(Rectangle())
            .onContinuousHover { phase in
                switch phase {
                case .active(let location): cursor = proxy.value(atX: location.x, as: Double.self).map { Date(timeIntervalSince1970: $0) }
                case .ended: if !focused { cursor = nil }
                }
            }
            .gesture(DragGesture(minimumDistance: 3).onChanged { drag in
                guard let start = proxy.value(atX: drag.startLocation.x, as: Double.self), let end = proxy.value(atX: drag.location.x, as: Double.self) else { return }
                cursor = Date(timeIntervalSince1970: end)
                rank(from: start, to: end)
            })
            .onTapGesture { state.backToLive() }
            .accessibilityHidden(true)
    }

    private var bucketDuration: TimeInterval { span == .sevenDays ? LongHistory.coarse : LongHistory.fine }

    private func rank(from: TimeInterval, to: TimeInterval) {
        guard abs(to - from) >= bucketDuration else { return }
        state.rank(from: Date(timeIntervalSince1970: from), to: Date(timeIntervalSince1970: to))
    }

    private func moveCursor(_ press: KeyPress, domain: ClosedRange<Double>) {
        let step = press.modifiers.contains(.option) ? (span == .sevenDays ? 86400.0 : 3600.0) : bucketDuration
        let from = cursor?.timeIntervalSince1970 ?? domain.upperBound
        let to = min(domain.upperBound, max(domain.lowerBound, from + (press.key == .leftArrow ? -step : step)))
        if press.modifiers.contains(.shift) {
            let anchor = keyboardAnchor?.timeIntervalSince1970 ?? from
            keyboardAnchor = Date(timeIntervalSince1970: anchor)
            rank(from: anchor, to: to)
        } else { keyboardAnchor = nil }
        cursor = Date(timeIntervalSince1970: to)
    }
}

/// Controls and readings stay visible beside the inspector, including with Bigger Text.
struct ActivityChartHeader<Readout: View>: View {
    let state: ActivityState
    let keepsHistory: Bool
    @ViewBuilder let readout: () -> Readout

    var body: some View {
        ChartRowLayout(horizontalSpacing: 28, spreads: true) {
            ChartControls(state: state, keepsHistory: keepsHistory)
            figures
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var figures: some View {
        readout().lineLimit(1).fixedSize().accessibilityHidden(true)
    }
}

/// The chart's metric and span, shared by the live and kept-history charts.
struct ChartControls: View {
    @Bindable var state: ActivityState
    let keepsHistory: Bool

    var body: some View {
        ChartRowLayout { metric; span }
    }

    private var metric: some View {
        Picker("Chart", selection: $state.chartMetric) {
            ForEach(ChartMetric.allCases) { Text($0.title).tag($0) }
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .fixedSize()
        .help("Chart CPU or memory. Dragging across the chart ranks apps by what it shows.")
    }

    private var span: some View {
        Picker("Span", selection: $state.span) {
            ForEach(HistorySpan.allCases, id: \.self) { Text($0.title).tag($0) }
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .fixedSize()
        .disabled(!keepsHistory)
        .help(keepsHistory ? "How far back the chart looks" : "Turn on Keep a week of history in Pith Settings to look back hours and days.")
    }
}

/// Who used the most in a bucket of kept history, beside the pointer.
private struct BucketApps: View {
    let apps: [(name: String, id: String, value: Double)]
    let figure: (Double) -> String
    let executable: (String) -> String

    var body: some View {
        Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: 8, verticalSpacing: 3) {
            ForEach(apps, id: \.id) { entry in
                GridRow {
                    AppIconView(executable: executable(entry.id), size: 12)
                    Text(entry.name).font(BruhsType.bodySmall).foregroundStyle(BruhsColor.text).lineLimit(1).frame(maxWidth: 150, alignment: .leading)
                    Text(verbatim: figure(entry.value)).font(BruhsType.dataSmall).foregroundStyle(BruhsColor.textSecondary).gridColumnAlignment(.trailing)
                }
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(BruhsColor.surface, in: RoundedRectangle(cornerRadius: BruhsRadius.grape, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: BruhsRadius.grape, style: .continuous).strokeBorder(BruhsColor.hairline, lineWidth: 1))
    }
}
