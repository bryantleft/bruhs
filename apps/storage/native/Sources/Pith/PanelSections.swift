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
                HStack(alignment: .firstTextBaseline) {
                    Text("CPU").font(BruhsType.label).foregroundStyle(BruhsColor.text)
                    Spacer()
                    Text(cpu.since.map { "since \(PanelSummary.clock($0))" } ?? "last \(windowMinutes) min")
                        .font(BruhsType.caption).foregroundStyle(BruhsColor.textTertiary)
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
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text("Memory pressure").font(BruhsType.label).foregroundStyle(BruhsColor.text)
                    .accessibilityHidden(true)
                Spacer()
                StatusChip(pressure: model.snapshot?.pressure ?? .unknown)
            }
            PanelPressureBand(runs: PanelSummary.pressureRuns(points, window: window, interval: ActivityModel.interval, maxGap: ActivityModel.maxGap),
                              window: window)
                .padding(.top, 8)
            Text(caption(story, spoken: false)).font(BruhsType.caption).foregroundStyle(BruhsColor.textSecondary).lineLimit(1)
                .accessibilityLabel(caption(story, spoken: true))
                .padding(.top, 5)
        }
    }

    private func caption(_ story: PanelSummary.PressureStory, spoken: Bool) -> String {
        switch story {
        case .unavailable:
            return "No readings from macOS"
        case .normal(since: let since?):
            return "Normal since \(PanelSummary.clock(since))"
        case .normal(since: nil):
            return "Normal for the last \(windowMinutes) \(spoken ? "minutes" : "min")"
        case let .elevated(start, end, worst):
            let critical = worst == .critical ? ", reached critical" : ""
            guard let end else { return "Elevated since \(PanelSummary.clock(start))\(critical)" }
            let (from, to) = (PanelSummary.clock(start), PanelSummary.clock(end))
            if from == to { return "Elevated at \(from)\(critical)" }
            return spoken ? "Elevated from \(from) to \(to)\(critical)" : "Elevated \(from) to \(to)\(critical)"
        }
    }
}

/// Memory pressure across the session window: hairline where normal, the status colour where elevated, nothing
/// where macOS gave no reading. A 1 pt gap separates runs, so a change of state isn't only a change of colour.
struct PanelPressureBand: View {
    let runs: [PanelSummary.PressureRun]
    let window: ClosedRange<Double>

    var body: some View {
        Canvas { context, size in
            let scale = size.width / (window.upperBound - window.lowerBound)
            for run in runs {
                let start = (run.start - window.lowerBound) * scale
                let end = (run.end - window.lowerBound) * scale
                let rect = CGRect(x: start + 0.5, y: 0, width: max(1, end - start - 1), height: size.height)
                context.fill(Capsule(style: .continuous).path(in: rect), with: .color(run.pressure == .normal ? BruhsColor.hairline : run.pressure.tint))
            }
        }
        .frame(height: 4)
        .accessibilityHidden(true)
    }
}

struct PanelAppsSection: View {
    /// The busiest four, then one "Other" row.
    static let rows = 4
    static let rowHeight: CGFloat = 28
    let model: ActivityModel
    let open: (_ appID: String?) -> Void
    /// The rows' order while the pointer is over them, so a sample can't move a row under a click.
    @State private var held: [String]?

    var body: some View {
        let apps = PanelSummary.apps(model.snapshot?.apps ?? [], ownPID: ProcessInfo.processInfo.processIdentifier, limit: Self.rows, holding: held)
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Busiest Apps").accessibilityAddTraits(.isHeader)
                Spacer()
                Text("CPU").accessibilityHidden(true)
            }
            .font(BruhsType.sectionTitle)
            .foregroundStyle(BruhsColor.textTertiary)
            VStack(spacing: 0) {
                ForEach(apps.top) { app in PanelAppRow(app: app, details: PanelSummary.details(app, among: apps.top)) { open(app.id) } }
                if apps.otherCount > 0 { PanelOtherAppsRow(count: apps.otherCount, cpu: apps.otherCPU) }
            }
            .frame(maxWidth: .infinity, alignment: .top)
            .frame(height: Self.rowHeight * CGFloat(Self.rows + 1), alignment: .top)
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
    let open: () -> Void

    private var fullName: String { ([app.name] + details).joined(separator: ", ") }

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
                if let cpu = app.cpu {
                    Text(verbatim: percent(cpu)).font(BruhsType.data).foregroundStyle(BruhsColor.textSecondary)
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
        .accessibilityLabel("\(fullName), \(spokenPercent(app.cpu)) CPU, opens in Activity")
    }
}

struct PanelOtherAppsRow: View {
    let count: Int
    let cpu: Double?

    var body: some View {
        HStack(spacing: 8) {
            Spacer().frame(width: 16)
            Text("Other \(count) \(count == 1 ? "app" : "apps")").font(BruhsType.body).lineLimit(1)
            Spacer(minLength: 8)
            if let cpu { Text(verbatim: percent(cpu)).font(BruhsType.data) }
        }
        .foregroundStyle(BruhsColor.textTertiary)
        .frame(height: PanelAppsSection.rowHeight)
        .help("Combined CPU of the other apps Pith can measure. Activity lists protected processes.")
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Other \(count) \(count == 1 ? "app" : "apps"), \(spokenPercent(cpu)) CPU combined")
    }
}

struct PanelDiskSection: View {
    let model: ActivityModel
    let open: () -> Void

    private var name: String { model.volumeName ?? "Startup disk" }
    private var free: String? { model.availableDisk.map { "\(bytes(UInt64(max(0, $0)))) free" } }
    private var capacity: String? { model.totalDisk.map { "of \(bytes(UInt64(max(0, $0))))" } }
    private var used: Double? {
        guard let available = model.availableDisk, let total = model.totalDisk, total > 0 else { return nil }
        return 1 - Double(available) / Double(total)
    }

    var body: some View {
        Button(action: open) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline) {
                    Text(name).font(BruhsType.label).foregroundStyle(BruhsColor.text).lineLimit(1)
                    Spacer(minLength: 8)
                    // Without a reading the line below says capacity is unavailable.
                    if let free { Text(free).font(BruhsType.data).foregroundStyle(BruhsColor.text) }
                }
                // Without a reading the bar keeps its space but draws nothing, rather than an empty disk.
                CapacityBar(used: used ?? 0).opacity(used == nil ? 0 : 1).padding(.top, 8)
                Text(capacity ?? "Capacity unavailable")
                    .font(BruhsType.caption).foregroundStyle(BruhsColor.textTertiary)
                    .padding(.top, 4)
            }
            .padding(6)
            .contentShape(Rectangle())
        }
        .buttonStyle(PanelRowStyle())
        .padding(-6)
        .activatesOnReturn(open)
        .accessibilityLabel("\(name), \(free ?? "free space unavailable")\(capacity.map { " \($0)" } ?? ""), opens Disk")
    }
}

struct PanelFooter: View {
    let actions: PanelActions

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
                .font(BruhsType.caption).foregroundStyle(BruhsColor.textSecondary).lineLimit(1)
                // The symbol overlays the indent, so this line is exactly as tall as the footnote it replaces.
                .padding(.leading, 16)
                .overlay(alignment: .leading) {
                    Image(systemName: "exclamationmark.triangle").font(BruhsType.caption).foregroundStyle(BruhsColor.statusWarning)
                }
                .help(error)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Warning: \(error)")
        } else {
            let own = PanelSummary.own(model.snapshot?.apps ?? [], pid: ProcessInfo.processInfo.processIdentifier)
            Text(ownUse(cpu: own?.cpu.map { percent($0) }, memory: own?.memory.map(bytes)))
                .font(BruhsType.caption).foregroundStyle(BruhsColor.textTertiary).lineLimit(1)
                .accessibilityLabel(ownUse(cpu: own?.cpu.map { spokenPercent($0) }, memory: own?.memory.map { "\(bytes($0)) of memory" }))
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
