import AppKit
import PithCore
import SwiftUI

/// Details for the selected row: an app's history, processes and actions, or System's totals. Activity shows it only
/// while a row is selected.
struct ActivityInspector: View {
    let model: ActivityModel
    let listing: ActivityListing
    let selection: ActivityRowID?
    /// The ranked range, when the table is showing one.
    let range: ClosedRange<Double>?

    var body: some View {
        if selection == .system, let system = listing.system {
            SystemInspector(system: system)
        } else if let id = selection?.appID, let timeline = model.history.apps[id] {
            AppInspector(model: model, timeline: timeline, range: range)
        }
    }
}

/// "1 process", "7 processes".
func processCount(_ count: Int) -> String { count == 1 ? "1 process" : "\(count) processes" }

/// Data colours for the inspector's trends: memory is blueberry, so it never reads as CPU's persimmon.
enum ActivityPalette {
    static let memory = Color(nsColor: NSColor(name: nil) { appearance in
        appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? BruhsPalette.blueberry400 : BruhsPalette.blueberry700
    })
    static let memoryFill = Color(nsColor: BruhsPalette.blueberry500.withAlphaComponent(0.16))
}

private struct AppInspector: View {
    let model: ActivityModel
    let timeline: AppTimeline
    let range: ClosedRange<Double>?
    @State private var confirmingQuit = false

    private var app: AppSample { timeline.latest }
    /// This app's processes in the latest sample, busiest first; empty once it has quit.
    private var processes: [ProcessSample] {
        guard timeline.isRunning, let snapshot = model.snapshot else { return [] }
        let members = Set(app.members)
        return snapshot.processes.filter { members.contains($0.key) }.sorted { lhs, rhs in
            lhs.cpu != rhs.cpu ? (lhs.cpu ?? -1) > (rhs.cpu ?? -1) : lhs.key.pid < rhs.key.pid
        }
    }

    var body: some View {
        let window = model.window ?? (-SessionHistory.retention)...0
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                identity
                // A process macOS won't let Pith read has no trend to draw; the lock note says why.
                if model.window != nil, timeline.points.contains(where: { $0.cpu != nil || $0.memory != nil }) { trends(window) }
                facts
                if !processes.isEmpty { processList }
                actions
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .bruhsScrollers(inset: 6)
        }
        .alert("Quit \(app.name)?", isPresented: $confirmingQuit) {
            Button("Quit") { _ = runningApp?.terminate() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Pith asks \(app.name) to quit, the same as choosing Quit in the app, so it can still ask you to save your work.")
        }
    }

    // MARK: Sections

    private var identity: some View {
        VStack(alignment: .leading, spacing: 3) {
            AppIconView(executable: app.executable, size: 40)
                .padding(.bottom, 7)
            Text(app.name)
                .font(BruhsType.title)
                .foregroundStyle(BruhsColor.text)
                .textSelection(.enabled)
            HStack(spacing: 6) {
                BruhsBadge(text: app.identity.kind.label)
                // A tool's secondary text is its version; a system process's is what it does, the line below.
                if app.identity.kind == .commandLineTool, let version = app.identity.secondaryText {
                    BruhsBadge(text: version, isData: true)
                }
            }
            .padding(.vertical, 3)
            if app.identity.kind == .system, let description = app.identity.secondaryText {
                Text(description)
                    .font(BruhsType.body)
                    .foregroundStyle(BruhsColor.textTertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(status).font(BruhsType.body).foregroundStyle(BruhsColor.textSecondary)
            if let protected = protectedNote {
                Label(protected, systemImage: "lock")
                    .font(BruhsType.body)
                    .foregroundStyle(BruhsColor.textTertiary)
                    .padding(.top, 4)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var status: String {
        guard timeline.isRunning else {
            return timeline.points.last.map { "Exited at \($0.date.formatted(date: .omitted, time: .shortened))" } ?? "Exited"
        }
        guard let started = app.members.map(\.started).min() else { return "Running" }
        let date = Date(timeIntervalSince1970: Double(started) / 1_000_000)
        let since = Calendar.current.isDateInToday(date) ? date.formatted(date: .omitted, time: .shortened) : date.formatted(date: .abbreviated, time: .shortened)
        return "Running since \(since)"
    }

    /// Footprints are readable whenever macOS lets Pith see a process at all.
    private var protectedNote: String? {
        let hidden = processes.filter { $0.memory == nil }.count
        guard app.restricted, hidden > 0 else { return nil }
        return hidden == processes.count ? "Protected by macOS, so its figures are unavailable" : "\(hidden) of \(processes.count) processes are protected by macOS, so totals are unavailable"
    }

    private func trends(_ window: ClosedRange<Double>) -> some View {
        let usage = range.flatMap { model.history.usage(of: timeline.id, in: $0) }
        let cpu = MiniTrend.points(timeline.points.map { (time: $0.uptime, value: $0.cpu) }, maxGap: ActivityModel.maxGap)
        let footprints = timeline.points.compactMap(\.memory)
        // Memory has no fixed ceiling, so the trend's top is 10% above the window's largest footprint.
        let ceiling = Double(footprints.max() ?? 0) * 1.1
        let memory = MiniTrend.points(timeline.points.map { (time: $0.uptime, value: ceiling > 0 ? $0.memory.map { Double($0) / ceiling * 100 } : nil) }, maxGap: ActivityModel.maxGap)
        // Live figures match the table, where an app that has quit uses nothing.
        let now = timeline.isRunning ? ActivityListing.Values(cpu: app.cpu, memory: app.memory, read: nil, written: nil) : ActivityListing.Values(cpu: 0, memory: 0, read: nil, written: nil)
        let minutes = Int(SessionHistory.retention / 60)
        return VStack(alignment: .leading, spacing: 6) {
            trendHeader("CPU") {
                if range == nil {
                    FigureText(figure: ActivityFigure(.cpu, now), showsZero: true)
                } else if let usage, usage.cpu != nil || usage.peakCPU != nil {
                    if let average = usage.cpu { LabeledFigure(label: "Avg", value: percent(average)) }
                    if let peak = usage.peakCPU { LabeledFigure(label: "Peak", value: percent(peak)) }
                } else {
                    noReadings
                }
            }
            MiniTrend(points: cpu, window: window, height: 40, highlight: range, label: "\(app.name) CPU over the last \(minutes) minutes")
                .accessibilityValue(spokenRange(timeline.points.compactMap(\.cpu)) { "\(Int($0.rounded())) percent" })
            trendHeader("Memory") {
                if range == nil {
                    FigureText(figure: ActivityFigure(.memory, now), showsZero: true)
                } else if let memory = usage?.memory {
                    LabeledFigure(label: "Avg", value: bytes(memory))
                } else {
                    noReadings
                }
            }
            .padding(.top, 6)
            MiniTrend(points: memory, window: window, height: 40, tint: ActivityPalette.memory, fill: ActivityPalette.memoryFill, highlight: range,
                      label: "\(app.name) memory over the last \(minutes) minutes")
                .accessibilityValue(spokenRange(footprints) { bytes($0) })
            // Both trends share the session window; its ends, labelled once, say how far back they go.
            HStack {
                Text("\(minutes) min ago")
                Spacer(minLength: 8)
                Text("now")
            }
            .font(BruhsType.caption)
            .foregroundStyle(BruhsColor.textTertiary)
            .accessibilityHidden(true)
        }
    }

    /// A trend's name with its figures: the latest value while live, or the ranked range's average and peak.
    private func trendHeader<Figures: View>(_ title: String, @ViewBuilder figures: () -> Figures) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(title).font(BruhsType.bodySmall).foregroundStyle(BruhsColor.textSecondary)
            Spacer(minLength: 8)
            figures()
        }
        .lineLimit(1)
        .accessibilityHidden(true)
    }

    private var noReadings: some View {
        Text("No readings in this range").font(BruhsType.note).foregroundStyle(BruhsColor.textTertiary)
    }

    /// "Between 3.1 GB and 3.4 GB": the trend's spread without reading every sample aloud.
    private func spokenRange<T: Comparable>(_ values: [T], _ format: (T) -> String) -> String {
        guard let low = values.min(), let high = values.max() else { return "No readings" }
        let (from, to) = (format(low), format(high))
        return from == to ? "Steady at \(from)" : "Between \(from) and \(to)"
    }

    private var facts: some View {
        Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: 10, verticalSpacing: 6) {
            GridRow {
                factLabel("Path")
                Text(app.executable.isEmpty ? "Hidden by macOS" : app.executable)
                    .font(BruhsType.dataSmall)
                    .foregroundStyle(app.executable.isEmpty ? BruhsColor.textTertiary : BruhsColor.text)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let openedBy = app.openedBy {
                GridRow {
                    factLabel("Opened by")
                    Text(openedBy).font(BruhsType.dataSmall).foregroundStyle(BruhsColor.text).textSelection(.enabled)
                }
            }
        }
    }

    private func factLabel(_ text: String) -> some View {
        Text(text).font(BruhsType.bodySmall).foregroundStyle(BruhsColor.textSecondary).gridColumnAlignment(.leading)
    }

    private var processList: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(range == nil ? "Processes" : "Processes Now").font(BruhsType.sectionTitle).foregroundStyle(BruhsColor.textSecondary)
                if processes.count > 1 { BruhsBadge(text: String(processes.count), isData: true) }
            }
            .accessibilityElement(children: .combine)
            Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: 8, verticalSpacing: 4) {
                ForEach(processes) { process in
                    GridRow {
                        // Verbatim, so PIDs never pick up thousands separators.
                        Text(verbatim: String(process.key.pid)).font(BruhsType.dataSmall).foregroundStyle(BruhsColor.textTertiary)
                        HStack(spacing: 4) {
                            Text(process.displayName).font(BruhsType.bodySmall).foregroundStyle(BruhsColor.text)
                                .lineLimit(1).truncationMode(.middle)
                            if process.memory == nil { ProtectedMark() }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        FigureText(figure: ActivityFigure(.cpu, values(process))).gridColumnAlignment(.trailing)
                        FigureText(figure: ActivityFigure(.memory, values(process))).gridColumnAlignment(.trailing)
                    }
                    .help(process.path)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Process \(process.key.pid), \(process.displayName), CPU \(ActivityFigure(.cpu, values(process)).spoken(protected: process.memory == nil)), memory \(ActivityFigure(.memory, values(process)).spoken(protected: process.memory == nil))")
                }
            }
        }
    }

    private func values(_ process: ProcessSample) -> ActivityListing.Values {
        ActivityListing.Values(cpu: process.cpu, memory: process.memory, read: process.read, written: process.written)
    }

    private var actions: some View {
        HStack(spacing: 8) {
            Button("Reveal in Finder") { NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: app.executable)]) }
                .buttonStyle(.bruhsGhost)
                .disabled(app.executable.isEmpty)
            Button("Quit…") { confirmingQuit = true }
                .buttonStyle(.bruhsSoftDanger)
                .disabled(runningApp == nil)
                .help(quitHelp)
        }
    }

    /// The app's own process, if it's a regular app (one with a Dock icon) that can be asked to quit.
    private var runningApp: NSRunningApplication? {
        guard timeline.isRunning, app.identity.kind != .system else { return nil }
        let pids = Set(app.members.map(\.pid))
        return NSWorkspace.shared.runningApplications.first { pids.contains($0.processIdentifier) && $0.activationPolicy == .regular }
    }

    private var quitHelp: String {
        if app.identity.kind == .system { return "macOS needs its system processes, so Pith doesn't quit them" }
        if !timeline.isRunning { return "\(app.name) has already quit" }
        if runningApp == nil { return "Only apps with a Dock icon can be asked to quit" }
        return "Ask \(app.name) to quit"
    }
}

private struct SystemInspector: View {
    let system: ActivityListing.System

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 3) {
                    Image(systemName: "gearshape.2")
                        .font(.system(size: 26)) // bruhs-native-ignore: sizes the symbol to the 40 pt app icons, not text
                        .foregroundStyle(BruhsColor.textSecondary)
                        .frame(width: 40, height: 40)
                        .padding(.bottom, 7)
                        .accessibilityHidden(true)
                    Text("System").font(BruhsType.title).foregroundStyle(BruhsColor.text)
                    Text(summary).font(BruhsType.body).foregroundStyle(BruhsColor.textSecondary)
                    Text("Processes that are part of macOS").font(BruhsType.body).foregroundStyle(BruhsColor.textTertiary)
                }
                .accessibilityElement(children: .combine)
                if system.protectedCount > 0 {
                    Label("\(processCount(system.protectedCount)) \(system.protectedCount == 1 ? "is" : "are") protected by macOS. Pith can't read their CPU, memory or disk activity without administrator access, so the System totals leave them out.", systemImage: "lock")
                        .font(BruhsType.body)
                        .foregroundStyle(BruhsColor.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: 10, verticalSpacing: 6) {
                    ForEach([ActivityColumn.cpu, .memory, .read, .written], id: \.self) { column in
                        let figure = ActivityFigure(column, system.values)
                        GridRow {
                            Text(column.title).font(BruhsType.bodySmall).foregroundStyle(BruhsColor.textSecondary)
                            FigureText(figure: figure, color: BruhsColor.text, showsZero: true)
                        }
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(column.title) \(figure.spoken(protected: false))")
                    }
                }
                if !busiest.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Busiest").font(BruhsType.sectionTitle).foregroundStyle(BruhsColor.textSecondary)
                        ForEach(busiest) { app in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(app.identity.displayName).font(BruhsType.bodySmall).foregroundStyle(BruhsColor.text).lineLimit(1)
                                    if let description = app.identity.secondaryText {
                                        Text(description).font(BruhsType.note).foregroundStyle(BruhsColor.textTertiary).lineLimit(2)
                                    }
                                }
                                Spacer(minLength: 8)
                                FigureText(figure: ActivityFigure(.cpu, app.values))
                            }
                            .accessibilityElement(children: .combine)
                        }
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .bruhsScrollers(inset: 6)
        }
    }

    private var summary: String {
        system.protectedCount > 0 ? "\(processCount(system.processCount)), \(system.protectedCount) protected" : processCount(system.processCount)
    }

    private var busiest: [ActivityListing.App] {
        Array(system.apps.filter { ($0.values.cpu ?? 0) >= 0.05 }.sorted { ($0.values.cpu ?? 0) > ($1.values.cpu ?? 0) }.prefix(5))
    }
}
