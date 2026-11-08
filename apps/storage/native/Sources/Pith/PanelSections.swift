import AppKit
import PithCore
import SwiftUI

// The menu bar panel's sections, top to bottom. Each has the same height in every state (collecting,
// unavailable, error), so the panel keeps one size while it's open.

/// The session window, or a placeholder one before the first sample, while the sections are hidden.
@MainActor private func sessionWindow(_ model: ActivityModel) -> ClosedRange<Double> {
    model.window ?? -SessionHistory.retention...0
}

private let windowMinutes = Int(SessionHistory.retention / 60)

struct PanelCPUSection: View {
    let model: ActivityModel

    var body: some View {
        let window = sessionWindow(model)
        let cpu = PanelSummary.cpu(model.history.system, window: window, maxGap: ActivityModel.maxGap)
        let live = model.paused ? nil : model.snapshot?.cpu
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("CPU").font(BruhsType.label).foregroundStyle(BruhsColor.text)
                    if let snapshot = model.snapshot, !model.paused {
                        if snapshot.thermal.isThrottling { ThermalChip(thermal: snapshot.thermal) }
                        if snapshot.lowPowerMode { LowPowerChip() }
                    }
                    Spacer()
                    Text(cpu.since.map { "since \(PanelSummary.clock($0))" } ?? "last \(windowMinutes) min")
                        .font(BruhsType.note).foregroundStyle(BruhsColor.textTertiary)
                }
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    readout(live)
                    Spacer(minLength: 0)
                    figures(cpu)
                }
            }
            // The chart's label carries the window, average and peak, so this element is just the value.
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("CPU")
            .accessibilityValue(model.paused ? "paused" : spokenPercent(live, glance: true))
            let summary = spoken(cpu)
            MiniTrend(points: MiniTrend.points(model.history.system.map { (time: $0.uptime, value: $0.cpu) }, maxGap: ActivityModel.maxGap),
                      window: window, height: 56, label: summary)
                // One summary instead of an element per sample: the panel is a glance, Activity has the detail.
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(summary)
                .padding(.top, 6)
            // Each tier of cores on its own: Apple's chips mix efficiency, performance and super cores, and an app
            // stuck on one tier reads differently from the whole Mac being busy.
            if let tiers = model.snapshot?.tiers, !tiers.isEmpty {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    ForEach(tiers, id: \.name) { tier in
                        LabeledFigure(label: tier.name, value: model.paused ? "" : tier.busy.map { percent($0, glance: true) } ?? "")
                            .help("\(tier.cores) \(tier.name.lowercased()) cores")
                    }
                }
                .padding(.top, 6)
                .accessibilityElement(children: .combine)
            }
        }
    }

    /// The live value, or a word on the same baseline and at the same height, so the section keeps its size.
    @ViewBuilder private func readout(_ live: Double?) -> some View {
        if let live {
            Text(verbatim: percent(live, glance: true)).font(BruhsType.readout).foregroundStyle(BruhsColor.text).fixedSize()
        } else {
            Text(verbatim: "0%").font(BruhsType.readout).hidden()
                .overlay(alignment: .leadingLastTextBaseline) {
                    Text(model.paused ? "Paused" : "Unavailable").font(BruhsType.label).foregroundStyle(BruhsColor.textSecondary).fixedSize()
                }
        }
    }

    @ViewBuilder private func figures(_ cpu: PanelSummary.CPU) -> some View {
        if let average = cpu.average, let peak = cpu.peak {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                LabeledFigure(label: "Avg", value: percent(average, glance: true))
                LabeledFigure(label: "Peak", value: percent(peak, glance: true))
            }
        } else {
            Text("No readings yet").font(BruhsType.note).foregroundStyle(BruhsColor.textTertiary)
        }
    }

    private func spoken(_ cpu: PanelSummary.CPU) -> String {
        let window = cpu.since.map { "CPU since \(PanelSummary.clock($0))" } ?? "CPU over the last \(windowMinutes) minutes"
        guard let average = cpu.average, let peak = cpu.peak else { return "\(window), no readings yet" }
        return "\(window), average \(spokenPercent(average, glance: true)), peak \(spokenPercent(peak, glance: true))"
    }
}

struct PanelMemorySection: View {
    let model: ActivityModel

    var body: some View {
        let window = sessionWindow(model)
        let points = model.history.system
        let story = PanelSummary.pressureStory(points, window: window, maxGap: ActivityModel.maxGap)
        let culprit = model.paused ? nil : PanelSummary.memoryCulprit(model.snapshot, history: model.history, window: window, ownPID: ProcessInfo.processInfo.processIdentifier)
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text("Memory").font(BruhsType.label).foregroundStyle(BruhsColor.text)
                    .accessibilityHidden(true)
                Spacer()
                StatusChip(pressure: model.snapshot?.pressure ?? .unknown, paused: model.paused)
            }
            PanelPressureBand(runs: PanelSummary.pressureRuns(points, window: window, interval: ActivityModel.interval, maxGap: ActivityModel.maxGap),
                              window: window)
                .padding(.top, 8)
            figures
                .padding(.top, 8)
            Text(caption(story, culprit: culprit, spoken: false)).font(BruhsType.note).foregroundStyle(BruhsColor.textSecondary).lineLimit(1)
                .help(caption(story, culprit: culprit, spoken: false))
                .accessibilityLabel(caption(story, culprit: culprit, spoken: true))
                .padding(.top, 5)
        }
    }

    /// Used memory, then swap and compression, which say how hard macOS is working to make room. At bigger text sizes
    /// compression gives way, then swap: used memory is the one figure the row can't lose.
    private var figures: some View {
        let memory = model.paused ? nil : model.snapshot?.memory
        let used = LabeledFigure(label: "Used", value: memory.map { memorySize($0.used) } ?? "")
            .help(memory.map { "\(memorySize($0.used)) of \(memorySize($0.physical)) in use" } ?? "")
        let swap = LabeledFigure(label: "Swap", value: memory?.swapUsed.map(memorySize) ?? "")
            .help("Memory macOS moved to the disk. Swapping is what makes a Mac slow when memory runs short.")
        let compressed = LabeledFigure(label: "Compressed", value: memory.map { memorySize($0.compressed) } ?? "")
            .help("Memory macOS compressed to make room before it swaps.")
        return ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline, spacing: 10) { used; Spacer(minLength: 0); swap; compressed }
            HStack(alignment: .firstTextBaseline, spacing: 10) { used; Spacer(minLength: 0); swap }
            HStack(alignment: .firstTextBaseline, spacing: 10) { used; Spacer(minLength: 0) }
        }
        .accessibilityElement(children: .combine)
    }

    private func caption(_ story: PanelSummary.PressureStory, culprit: (app: AppSample, growth: Int64?)?, spoken: Bool) -> String {
        switch story {
        case .unavailable:
            return "No readings from macOS"
        case .normal(since: let since?):
            return "Normal since \(PanelSummary.clock(since))"
        case .normal(since: nil):
            return "Normal for the last \(windowMinutes) \(spoken ? "minutes" : "min")"
        case let .elevated(start, end, worst):
            let critical = worst == .critical ? ", reached critical" : ""
            guard let end else {
                // While it lasts, the line names who's behind it, so the glance answers what to quit.
                let who = culprit.map { culprit in culprit.growth.map { " \(culprit.app.name) grew \(memorySize(UInt64(max(0, $0))))." } ?? " \(culprit.app.name) uses the most." } ?? ""
                return "Since \(PanelSummary.clock(start))\(critical).\(who)"
            }
            let (from, to) = (PanelSummary.clock(start), PanelSummary.clock(end))
            if from == to { return "Last elevated at \(from)\(critical)" }
            return "Last elevated from \(from) to \(to)\(critical)"
        }
    }
}

/// Memory pressure across the session window as a lane: the well where pressure was normal, the status colour with a
/// warning mark where it was elevated, nothing where macOS gave no reading. Square ends, so it reads as data rather
/// than as a scroll bar or a progress bar.
struct PanelPressureBand: View {
    let runs: [PanelSummary.PressureRun]
    let window: ClosedRange<Double>
    var height: CGFloat = 8

    var body: some View {
        Canvas { context, size in
            let scale = size.width / (window.upperBound - window.lowerBound)
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(BruhsColor.hairline))
            for run in runs {
                let start = (run.start - window.lowerBound) * scale
                let end = (run.end - window.lowerBound) * scale
                let rect = CGRect(x: start, y: 0, width: max(1, end - start), height: size.height)
                guard run.pressure.isElevated else { continue }
                context.fill(Path(rect), with: .color(run.pressure.tint))
                // A mark in each stretch wide enough to hold it, so elevated reads without colour.
                if rect.width >= size.height + 4, let mark = context.resolveSymbol(id: run.pressure) {
                    context.draw(mark, at: CGPoint(x: rect.minX + size.height / 2 + 2, y: size.height / 2))
                }
            }
        } symbols: {
            ForEach([MemoryPressure.warning, .critical], id: \.self) { pressure in
                Image(systemName: "exclamationmark")
                    .font(.system(size: height - 1, weight: .heavy)) // bruhs-native-ignore: a mark sized to the lane, not text
                    .foregroundStyle(BruhsColor.canvas)
                    .tag(pressure)
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }
}

struct PanelAppsSection: View {
    /// The busiest four, then one "Other" row and one "System" row.
    static let rows = 4
    static let rowHeight: CGFloat = 28
    let model: ActivityModel
    let open: (_ appID: String?) -> Void
    /// The rows' order while the pointer is over them, so a sample can't move a row under a click.
    @State private var held: [String]?

    var body: some View {
        let ranking = PanelSummary.Ranking(pressure: model.paused ? .normal : model.snapshot?.pressure ?? .unknown)
        let apps = PanelSummary.apps(model.snapshot?.apps ?? [], ownPID: ProcessInfo.processInfo.processIdentifier, limit: Self.rows, holding: held, ranking: ranking)
        let window = sessionWindow(model)
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                // Under memory pressure the list follows the warning, so it names who holds the memory.
                Text(ranking == .memory ? "Using the most memory" : "Busiest apps").accessibilityAddTraits(.isHeader)
                Spacer()
                Text(ranking == .memory ? "Memory" : "CPU").accessibilityHidden(true)
            }
            .font(BruhsType.sectionTitle)
            .foregroundStyle(BruhsColor.textTertiary)
            VStack(spacing: 0) {
                ForEach(apps.top) { app in
                    PanelAppRow(app: app, details: PanelSummary.details(app, among: apps.top), ranking: ranking,
                                growth: ranking == .memory ? PanelSummary.memoryGrowth(model.history.apps[app.id], window: window) : nil) { open(app.id) }
                }
                if apps.otherCount > 0 {
                    PanelSummaryRow(title: "Other \(apps.otherCount) \(apps.otherCount == 1 ? "app" : "apps")", ranking: ranking, cpu: apps.otherCPU, memory: apps.otherMemory,
                                    help: "The other apps and tools Pith can measure, together.")
                }
                if apps.systemCount > 0 {
                    PanelSummaryRow(title: "System", detail: processCount(apps.systemCount), ranking: ranking, cpu: apps.systemCPU, memory: apps.systemMemory,
                                    help: "macOS's own processes, together. Activity lists them under System.")
                }
            }
            // Paused readings are kept for reference but shouldn't look live.
            .opacity(model.paused ? 0.5 : 1)
            .frame(maxWidth: .infinity, alignment: .top)
            .frame(height: Self.rowHeight * CGFloat(Self.rows + 2), alignment: .top)
            .overlay {
                if apps.top.isEmpty {
                    Text("App activity unavailable").font(BruhsType.body).foregroundStyle(BruhsColor.textSecondary)
                }
            }
            // Rows bleed 6 pt for their hover fill; hold the order over the bleed too.
            .padding(.horizontal, 6)
            .onHover { inside in held = inside && !apps.top.isEmpty ? apps.top.map(\.id) : nil }
            .padding(.horizontal, -6)
        }
    }
}

struct PanelAppRow: View {
    let app: AppSample
    /// Shown after the name in tertiary text; see PanelSummary.details.
    let details: [String]
    var ranking: PanelSummary.Ranking = .cpu
    /// How much its footprint changed over the window, shown while ranking by memory.
    var growth: Int64?
    let open: () -> Void

    private var fullName: String { ([app.name] + details).joined(separator: ", ") }
    /// "+1.2 GB" once the change is worth a glance; 100 MB is the culprit threshold too.
    private var change: String? {
        guard let growth, abs(growth) >= 100_000_000 else { return nil }
        return (growth > 0 ? "+" : "\u{2212}") + memorySize(UInt64(abs(growth)))
    }
    private var spokenFigure: String {
        switch ranking {
        case .cpu: "\(spokenPercent(app.cpu)) CPU"
        case .memory: app.memory.map { "\(memorySize($0)) of memory" + (change.map { ", \($0) in \(windowMinutes) minutes" } ?? "") } ?? "memory unavailable"
        }
    }

    var body: some View {
        Button(action: open) {
            HStack(spacing: 8) {
                AppIconView(executable: app.executable, size: 16)
                // Each detail is its own label, spaced from the name; the name gives way first.
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(app.name).foregroundStyle(BruhsColor.text)
                    ForEach(details, id: \.self) { detail in
                        Text(detail).foregroundStyle(BruhsColor.textTertiary).fixedSize()
                    }
                }
                .font(BruhsType.body)
                .lineLimit(1)
                Spacer(minLength: 8)
                if ranking == .memory, let change {
                    Text(verbatim: change).font(BruhsType.dataSmall).foregroundStyle(BruhsColor.textTertiary)
                        .help("Its memory changed by \(change) over the last \(windowMinutes) minutes")
                }
                if ranking == .cpu, app.holdsACore {
                    BruhsBadge(text: "Full core").help("One of its processes keeps a whole core busy. On a Mac with many cores that reads as a small share.")
                }
                if let figure = ranking == .cpu ? app.cpu.map({ percent($0) }) : app.memory.map(memorySize) {
                    Text(verbatim: figure).font(BruhsType.data).foregroundStyle(BruhsColor.textSecondary)
                }
            }
            .padding(.horizontal, 6)
            .frame(height: PanelAppsSection.rowHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(PanelRowStyle())
        .padding(.horizontal, -6)
        .activatesOnReturn(open)
        .help(fullName)
        .accessibilityLabel("\(fullName), \(spokenFigure)")
        .accessibilityHint("Opens in Activity")
    }
}

/// A row that sums a group, such as the other apps or macOS's own processes: no icon and no action.
struct PanelSummaryRow: View {
    let title: String
    var detail: String?
    let ranking: PanelSummary.Ranking
    let cpu: Double?
    let memory: UInt64?
    let help: String

    private var figure: String? { ranking == .cpu ? cpu.map { percent($0) } : memory.map(memorySize) }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Spacer().frame(width: 18)
            Text(title).font(BruhsType.body).lineLimit(1)
            if let detail { Text(detail).font(BruhsType.note).foregroundStyle(BruhsColor.textTertiary).lineLimit(1) }
            Spacer(minLength: 8)
            if let figure { Text(verbatim: figure).font(BruhsType.data) }
        }
        .foregroundStyle(BruhsColor.textTertiary)
        .frame(height: PanelAppsSection.rowHeight)
        .help(help)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title)\(detail.map { ", \($0)" } ?? ""), " + (ranking == .cpu ? "\(spokenPercent(cpu)) CPU" : memory.map { "\(memorySize($0)) of memory" } ?? "memory unavailable") + " combined")
    }
}

struct PanelDiskSection: View {
    let model: ActivityModel
    let open: () -> Void

    private var name: String { model.volumeName ?? "Startup disk" }
    private var free: String? { model.availableDisk.map { "\(bytes(UInt64(max(0, $0)))) free" } }
    private var used: Double? {
        guard let available = model.availableDisk, let total = model.totalDisk, total > 0 else { return nil }
        return 1 - Double(available) / Double(total)
    }
    private var isLow: Bool {
        guard let available = model.availableDisk, let total = model.totalDisk else { return false }
        return ActivityModel.isLowOnSpace(free: available, total: total)
    }

    var body: some View {
        Button(action: open) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(name).font(BruhsType.label).foregroundStyle(BruhsColor.text).lineLimit(1)
                    if isLow {
                        Label("Low", systemImage: "exclamationmark.triangle.fill")
                            .font(BruhsType.control)
                            .foregroundStyle(BruhsColor.statusWarning)
                            .help("Little space is left. A nearly full disk slows the Mac and can stop macOS updates.")
                    }
                    Spacer(minLength: 8)
                    // Without a reading the line below says capacity is unavailable.
                    if let free { Text(free).font(BruhsType.data).foregroundStyle(BruhsColor.text) }
                }
                // Without a reading the bar keeps its space but draws nothing, rather than an empty disk.
                CapacityBar(used: used ?? 0).opacity(used == nil ? 0 : 1).padding(.top, 8)
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    if let total = model.totalDisk {
                        LabeledFigure(label: "Capacity", value: bytes(UInt64(max(0, total))))
                    } else {
                        Text("Capacity unavailable").font(BruhsType.note).foregroundStyle(BruhsColor.textTertiary)
                    }
                    Spacer(minLength: 0)
                    // What macOS could free on request, kept apart from free space: purging doesn't always happen.
                    if let purgeable = model.purgeableDisk, purgeable > 0 {
                        LabeledFigure(label: "Purgeable", value: bytes(UInt64(purgeable)))
                            .help("Caches and snapshots macOS can remove when it needs room. They count as used until it does.")
                    }
                }
                .padding(.top, 5)
            }
            .padding(6)
            .contentShape(Rectangle())
        }
        .buttonStyle(PanelRowStyle())
        .padding(-6)
        .activatesOnReturn(open)
        .accessibilityLabel("\(name)\(isLow ? ", low on space" : ""), \(free ?? "free space unavailable")\(model.totalDisk.map { " of \(bytes(UInt64(max(0, $0))))" } ?? "")")
        .accessibilityHint("Opens Disk")
    }
}

struct PanelFooter: View {
    let actions: PanelActions
    let model: ActivityModel

    var body: some View {
        // Both buttons open the main window. "Open" keeps the pair from reading as tabs with one selected.
        HStack(spacing: 6) {
            Button("Open Activity") { actions.openActivity(nil) }
                .buttonStyle(.bruhsSoft)
                .activatesOnReturn { actions.openActivity(nil) }
                .help("Every app and process, with CPU, memory and disk use over the last 10 minutes")
            Button("Open Disk", action: actions.openDisk)
                .buttonStyle(.bruhsGhost)
                .activatesOnReturn(actions.openDisk)
                .help("A map of what takes up space on your disk")
            Spacer()
            // Pith has no Dock icon, and its app menu shows only while one of its windows is in front, so the panel is
            // where Settings and Quit live.
            Menu {
                Button("Settings…", action: actions.openSettings).keyboardShortcut(",")
                // Pausing stops sampling, and with it Pith's own cost, until Resume.
                Button(model.paused ? "Resume Monitoring" : "Pause Monitoring") { if model.paused { model.start() } else { model.pause() } }
                Divider()
                Button("Quit Pith") { NSApp.terminate(nil) }.keyboardShortcut("q")
            } label: {
                Image(systemName: "gearshape")
            }
            .menuStyle(.button)
            .buttonStyle(.borderless)
            .menuIndicator(.hidden)
            .tint(BruhsColor.textSecondary)
            // A button-sized target; the gear lines up with the numbers above.
            .frame(width: 28, height: 24)
            .padding(.trailing, -8)
            .help("Settings and Quit")
            .accessibilityLabel("Settings and Quit")
        }
    }
}

/// The panel's last line: what Pith itself costs, or why the process list is incomplete.
struct PanelStatusLine: View {
    let model: ActivityModel

    var body: some View {
        if let error = model.snapshot?.error {
            Text(error)
                .font(BruhsType.note).foregroundStyle(BruhsColor.textSecondary).lineLimit(1)
                // The symbol overlays the indent, so this line is exactly as tall as the footnote it replaces.
                .padding(.leading, 16)
                .overlay(alignment: .leading) {
                    Image(systemName: "exclamationmark.triangle").font(BruhsType.note).foregroundStyle(BruhsColor.statusWarning)
                }
                .help(error)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Warning: \(error)")
        } else {
            let own = PanelSummary.own(model.snapshot?.apps ?? [], pid: ProcessInfo.processInfo.processIdentifier)
            Text(ownUse(cpu: own?.cpu.map { percent($0) }, memory: own?.memory.map(memorySize)))
                .font(BruhsType.note).foregroundStyle(BruhsColor.textTertiary).lineLimit(1)
                .accessibilityLabel(ownUse(cpu: own?.cpu.map { spokenPercent($0) }, memory: own?.memory.map { "\(memorySize($0)) of memory" }))
        }
    }

    /// "Pith itself uses 0.4% CPU and 48.2 MB", leaving out whichever figure it has no reading for.
    private func ownUse(cpu: String?, memory: String?) -> String {
        switch (cpu, memory) {
        case let (cpu?, memory?): "Pith itself uses \(cpu) CPU and \(memory)"
        case let (cpu?, nil): "Pith itself uses \(cpu) CPU"
        case let (nil, memory?): "Pith itself uses \(memory)"
        case (nil, nil): "No reading of Pith itself yet"
        }
    }
}

struct PanelDivider: View {
    var body: some View {
        Rectangle().fill(BruhsColor.hairline).frame(height: 1).padding(.vertical, 12).accessibilityHidden(true)
    }
}

/// Rows that open a window: no chrome, a subtle fill on hover and press.
struct PanelRowStyle: ButtonStyle {
    @State private var hovering = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(BruhsColor.text.opacity(configuration.isPressed ? 0.1 : hovering ? 0.06 : 0),
                        in: RoundedRectangle(cornerRadius: BruhsRadius.grape, style: .continuous))
            .onHover { hovering = $0 }
    }
}

private extension View {
    /// macOS activates a focused button with Space; the panel also takes Return, as menus do.
    func activatesOnReturn(_ action: @escaping () -> Void) -> some View {
        onKeyPress(.return) { action(); return .handled }
    }
}

/// A percent as VoiceOver should say it, e.g. "9.0 percent".
private func spokenPercent(_ value: Double?, glance: Bool = false) -> String {
    value.map { percent($0, glance: glance).replacingOccurrences(of: "%", with: " percent") } ?? "unavailable"
}
