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
    /// Asks to quit the app, which Activity confirms.
    var quit: (QuitRequest) -> Void = { _ in }

    var body: some View {
        if selection == .system, let system = listing.system {
            SystemInspector(system: system, snapshot: model.paused ? nil : model.snapshot)
        } else if let id = selection?.appID, let timeline = model.history.apps[id] {
            AppInspector(model: model, timeline: timeline, range: range, quit: quit)
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
    let quit: (QuitRequest) -> Void
    /// Read when the inspector opens for an app, off the main thread.
    @State private var details: (id: String, arguments: [String]?, signer: String?)?

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
        .task(id: app.id) { await loadDetails() }
    }

    /// The owner process's arguments and who signed the app: too slow for every sample, cheap once per selection.
    private func loadDetails() async {
        let id = app.id, executable = app.executable
        let owner = app.members.min { $0.started < $1.started }
        let found = await Task.detached(priority: .userInitiated) {
            (owner.flatMap { ProcessDetails.arguments($0.pid) }, ProcessDetails.signer(executable))
        }.value
        details = (id, found.0, found.1)
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
        // A share of the Mac's memory, as CPU is a share of the Mac: a steady footprint draws as a steady line at its
        // honest height, rather than a block near the top of a scale fitted to its own peak.
        let ceiling = Double(model.snapshot?.memory?.physical ?? ProcessInfo.processInfo.physicalMemory)
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
            trendHeader("Memory", detail: "share of your Mac's memory") {
                if range == nil {
                    FigureText(figure: ActivityFigure(.memory, now), showsZero: true)
                } else if let memory = usage?.memory {
                    LabeledFigure(label: "Avg", value: memorySize(memory))
                } else {
                    noReadings
                }
            }
            .padding(.top, 6)
            MiniTrend(points: memory, window: window, height: 40, tint: ActivityPalette.memory, fill: ActivityPalette.memoryFill, highlight: range,
                      label: "\(app.name) memory over the last \(minutes) minutes")
                .accessibilityValue(spokenRange(footprints) { memorySize($0) })
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
    private func trendHeader<Figures: View>(_ title: String, detail: String? = nil, @ViewBuilder figures: () -> Figures) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(title).font(BruhsType.bodySmall).foregroundStyle(BruhsColor.textSecondary)
                .help(detail ?? "")
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
            if let details, details.id == app.id {
                if let signer = details.signer {
                    GridRow {
                        factLabel("Signed by")
                        Text(signer).font(BruhsType.bodySmall).foregroundStyle(BruhsColor.text).textSelection(.enabled)
                    }
                }
                if let arguments = details.arguments, !arguments.isEmpty {
                    GridRow {
                        factLabel("Arguments")
                        Text(arguments.joined(separator: " ")).font(BruhsType.dataSmall).foregroundStyle(BruhsColor.text)
                            .lineLimit(4).truncationMode(.middle).textSelection(.enabled)
                            .help(arguments.joined(separator: " "))
                    }
                }
            }
            if timeline.isRunning, !app.keepsAwake.isEmpty {
                GridRow {
                    factLabel("Keeps awake")
                    Text(Array(Set(app.keepsAwake)).sorted().joined(separator: ", ")).font(BruhsType.bodySmall).foregroundStyle(BruhsColor.text)
                        .fixedSize(horizontal: false, vertical: true)
                        .help("It has asked macOS not to sleep, for the reasons it gave.")
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
                Text(range == nil ? "Processes" : "Processes now").font(BruhsType.sectionTitle).foregroundStyle(BruhsColor.textSecondary)
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
        let refusal = ProcessControl.refusal(kind: app.identity.kind, members: app.members, isRunning: timeline.isRunning)
        return HStack(spacing: 8) {
            Button("Reveal in Finder") { NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: app.executable)]) }
                .buttonStyle(.bruhsGhost)
                .disabled(app.executable.isEmpty)
            // Any app or tool the user owns, menu bar apps and command-line tools included; macOS refuses the rest.
            Button("Quit…") { quit(QuitRequest(appID: app.id, name: app.name, kind: app.identity.kind, members: app.members)) }
                .buttonStyle(.bruhsSoftDanger)
                .disabled(refusal != nil)
                .help(refusal ?? "Quit or Force Quit \(app.name)")
        }
    }
}

private struct SystemInspector: View {
    let system: ActivityListing.System
    /// The latest sample, for the CPU no readable app accounts for, the core tiers and memory. Nil while paused.
    let snapshot: ActivitySnapshot?

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
                    ForEach([ActivityColumn.cpu, .memory, .read, .written] + (SystemSampler.countsNetwork ? [.network] : []), id: \.self) { column in
                        let figure = ActivityFigure(column, system.values)
                        GridRow {
                            Text(column.title).font(BruhsType.bodySmall).foregroundStyle(BruhsColor.textSecondary)
                            FigureText(figure: figure, color: BruhsColor.text, showsZero: true)
                        }
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(column.title) \(figure.spoken(protected: false))")
                    }
                }
                if let snapshot { macFacts(snapshot) }
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

    /// The whole Mac: CPU that no readable process accounts for, each tier of cores, and how memory is used.
    private func macFacts(_ snapshot: ActivitySnapshot) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("This Mac").font(BruhsType.sectionTitle).foregroundStyle(BruhsColor.textSecondary).accessibilityAddTraits(.isHeader)
            Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: 10, verticalSpacing: 6) {
                if let unattributed = snapshot.unattributedCPU {
                    factRow("Protected and kernel", percent(unattributed),
                            help: "CPU the Mac used that no process Pith can read accounts for: protected processes and the macOS kernel.")
                }
                ForEach(snapshot.tiers, id: \.name) { tier in
                    if let busy = tier.busy { factRow("\(tier.name) cores", percent(busy), help: "How busy the \(tier.cores) \(tier.name.lowercased()) cores are.") }
                }
                if let gpu = snapshot.gpu { factRow("GPU", percent(gpu), help: "How busy the graphics processor is.") }
                if let received = snapshot.networkIn, let sent = snapshot.networkOut {
                    factRow("Network in", rate(received), help: "Data received per second over every network connection.")
                    factRow("Network out", rate(sent), help: "Data sent per second over every network connection.")
                }
                if let battery = snapshot.battery {
                    factRow("Battery", batteryText(battery), help: "As macOS's battery menu reports it.")
                }
                if let memory = snapshot.memory {
                    factRow("Memory used", "\(memorySize(memory.used)) of \(memorySize(memory.physical))", help: "App memory, wired and compressed memory together.")
                    factRow("App memory", memorySize(memory.app), help: "Memory apps hold.")
                    factRow("Wired", memorySize(memory.wired), help: "Memory macOS keeps in place and can't compress or swap.")
                    factRow("Compressed", memorySize(memory.compressed), help: "Memory macOS compressed to make room before it swaps.")
                    factRow("Cached files", memorySize(memory.cached), help: "Files kept in memory so they open quickly. macOS gives this up when it needs room.")
                    if let swap = memory.swapUsed { factRow("Swap used", memorySize(swap), help: "Memory macOS moved to the disk.") }
                }
            }
        }
    }

    /// "82%, charging", "64%, 3 h 10 min left" or "100%, on power".
    private func batteryText(_ battery: BatteryState) -> String {
        let state = battery.isCharging ? "charging" : battery.onPower ? "on power"
            : battery.minutesLeft.map { Duration.seconds($0 * 60).formatted(.units(allowed: [.hours, .minutes], width: .abbreviated)) + " left" } ?? "on battery"
        return "\(battery.percent)%, \(state)"
    }

    private func factRow(_ label: String, _ value: String, help: String) -> some View {
        GridRow {
            Text(label).font(BruhsType.bodySmall).foregroundStyle(BruhsColor.textSecondary)
            Text(verbatim: value).font(BruhsType.dataSmall).foregroundStyle(BruhsColor.text)
        }
        .help(help)
        .accessibilityElement(children: .combine)
    }

    private var summary: String {
        system.protectedCount > 0 ? "\(processCount(system.processCount)), \(system.protectedCount) protected" : processCount(system.processCount)
    }

    private var busiest: [ActivityListing.App] {
        Array(system.apps.filter { ($0.values.cpu ?? 0) >= 0.05 }.sorted { ($0.values.cpu ?? 0) > ($1.values.cpu ?? 0) }.prefix(5))
    }
}
