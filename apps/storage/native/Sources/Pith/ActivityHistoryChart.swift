import Charts
import PithCore
import SwiftUI

/// CPU or memory across hours or days of kept history, and the table's time control for them: hover reads a bucket
/// and who used the most in it, dragging across a stretch ranks every app by it.
struct ActivityHistoryChart: View {
    let model: ActivityModel
    let state: ActivityState
    @State private var cursor: Date?

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
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                ChartControls(state: state, keepsHistory: model.keepsHistory)
                Spacer(minLength: 12)
                readout(buckets)
                    .lineLimit(1)
                    .accessibilityHidden(true)
            }
            chart(points, buckets: buckets, domain: domain)
                .frame(height: 150)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(metric.title) over the last \(span.title)")
                .accessibilityValue(points.isEmpty ? "No kept history yet" : "\(points.count) readings." + LaunchMarker.spoken(launches(domain: domain)))
            HStack {
                if buckets.isEmpty {
                    Text("Pith fills this in as it runs. Keep it running to see hours and days here.")
                        .font(BruhsType.note).foregroundStyle(BruhsColor.textTertiary)
                }
                Spacer(minLength: 12)
                Text("Drag across the chart to rank apps by that time")
                    .font(BruhsType.note)
                    .foregroundStyle(BruhsColor.textTertiary)
                    .accessibilityHidden(true)
            }
        }
    }

    @ViewBuilder private func readout(_ buckets: [HistoryBucket]) -> some View {
        let shown = buckets.filter { bucket in state.longRange.map { $0.overlaps(bucket.start...bucket.end) } ?? true }.compactMap(value)
        if let cursor, let bucket = buckets.first(where: { $0.start <= cursor && cursor < $0.end }) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(verbatim: when(bucket.start)).font(BruhsType.caption).foregroundStyle(BruhsColor.textTertiary)
                Text(verbatim: value(bucket).map(figure) ?? "").font(BruhsType.caption).foregroundStyle(BruhsColor.text)
            }
        } else if let peak = shown.max() {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                let average = shown.reduce(0, +) / Double(shown.count)
                LabeledFigure(label: "Avg", value: figure(average), amount: average)
                LabeledFigure(label: "Peak", value: figure(peak), amount: peak)
            }
        }
    }

    private func figure(_ value: Double) -> String {
        switch metric {
        case .cpu: percent(value, glance: true)
        case .memory: memorySize(UInt64(value / 100 * Double(model.snapshot?.memory?.physical ?? ProcessInfo.processInfo.physicalMemory)))
        }
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
                case .ended: cursor = nil
                }
            }
            .gesture(DragGesture(minimumDistance: 3).onChanged { drag in
                guard let start = proxy.value(atX: drag.startLocation.x, as: Double.self), let end = proxy.value(atX: drag.location.x, as: Double.self) else { return }
                cursor = Date(timeIntervalSince1970: end)
                // A stretch must hold at least one bucket to have anything to rank.
                if abs(end - start) >= (span == .sevenDays ? LongHistory.coarse : LongHistory.fine) {
                    state.rank(from: Date(timeIntervalSince1970: start), to: Date(timeIntervalSince1970: end))
                }
            })
            .onTapGesture { state.backToLive() }
            .accessibilityHidden(true)
    }
}

/// The chart's metric and span, shared by the live and kept-history charts.
struct ChartControls: View {
    @Bindable var state: ActivityState
    let keepsHistory: Bool

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Picker("Chart", selection: $state.chartMetric) {
                ForEach(ChartMetric.allCases) { Text($0.title).tag($0) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .fixedSize()
            .help("Chart CPU or memory. Dragging across the chart ranks apps by what it shows.")
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
