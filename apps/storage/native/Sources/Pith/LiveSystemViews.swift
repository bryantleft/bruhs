import PithCore
import SwiftUI

// Fast readings live in their own views. Updating them must not rebuild charts, history or the process list.
struct LiveSystemFigure: View {
    let model: ActivityModel
    let metric: ChartMetric

    var body: some View {
        let value = model.paused ? nil : metric == .cpu ? model.currentCPU : model.currentMemory.map { Double($0.used) }
        if let value {
            LabeledFigure(label: "Now", value: metric == .cpu ? percent(value, glance: true) : memorySize(UInt64(value)), amount: value, duration: ReadingMotion.live)
        } else {
            Text(model.paused ? "Paused" : "No readings yet").font(BruhsType.note).foregroundStyle(BruhsColor.textTertiary)
        }
    }
}

struct PanelCPUReadout: View {
    let model: ActivityModel

    var body: some View {
        let live = model.paused ? nil : model.currentCPU
        Group {
            if let live {
                FlowText(percent(live, glance: true), face: BruhsType.readoutFace, color: BruhsNSColor.text, duration: ReadingMotion.live)
            } else {
                Text(verbatim: "0%").font(BruhsType.readout).hidden()
                    .overlay(alignment: .leadingLastTextBaseline) {
                        Text(model.paused ? "Paused" : "Unavailable").font(BruhsType.label).foregroundStyle(BruhsColor.textSecondary).fixedSize()
                    }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("CPU")
        .accessibilityValue(model.paused ? "paused" : live.map { percent($0, glance: true).replacingOccurrences(of: "%", with: " percent") } ?? "unavailable")
    }
}

struct PanelCPUTiers: View {
    let model: ActivityModel

    var body: some View {
        let tiers = model.currentTiers
        if !tiers.isEmpty {
            let available = !model.paused && tiers.contains { $0.busy != nil }
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                ForEach(tiers, id: \.name) { tier in
                    LabeledFigure(label: tier.name, value: tier.busy.map { percent($0, glance: true) } ?? "", amount: tier.busy, duration: ReadingMotion.live)
                        .help("\(tier.cores) \(tier.name.lowercased()) cores")
                }
            }
            .opacity(available ? 1 : 0)
            .accessibilityHidden(!available)
            .overlay(alignment: .leading) {
                if !available && !model.paused {
                    Text("Core readings unavailable").font(BruhsType.note).foregroundStyle(BruhsColor.textTertiary)
                }
            }
            .padding(.top, 6)
            .accessibilityElement(children: .combine)
        }
    }
}

/// The glance shows one amount and a capacity gauge; secondary accounting stays under Details.
struct PanelMemoryFigures: View {
    let model: ActivityModel
    let detailsExpanded: Bool
    let toggleDetails: () -> Void

    var body: some View {
        let memory = model.currentMemory
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                if model.paused {
                    Button("Resume Monitoring") { model.start() }
                        .buttonStyle(.bruhsSoft)
                        .onKeyPress(.return) { model.start(); return .handled }
                } else if let memory {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        FlowText(memorySize(memory.used), face: BruhsType.dataFace, color: BruhsNSColor.text, duration: ReadingMotion.live)
                        Text("of \(memorySize(memory.physical))").font(BruhsType.note).foregroundStyle(BruhsColor.textTertiary)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Memory used")
                    .accessibilityValue("\(memorySize(memory.used)) of \(memorySize(memory.physical))")
                    .help("Memory in use. Memory pressure indicates whether macOS needs more room.")
                } else {
                    Text("Unavailable").font(BruhsType.note).foregroundStyle(BruhsColor.textSecondary)
                }
                Spacer(minLength: 0)
                Button(action: toggleDetails) {
                    HStack(spacing: 4) {
                        Text("Details")
                        Image(systemName: detailsExpanded ? "chevron.up" : "chevron.down")
                    }
                    .font(BruhsType.note)
                    .foregroundStyle(BruhsColor.textTertiary)
                    .padding(.vertical, 4)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .onKeyPress(.return) { toggleDetails(); return .handled }
                .accessibilityIdentifier("memory-details")
                .accessibilityLabel("Memory details")
                .accessibilityValue(detailsExpanded ? "Expanded" : "Collapsed")
                .accessibilityHint(detailsExpanded ? "Hides additional memory details" : "Shows swap, compression and recent memory pressure")
                .help("Swap, compression and recent memory pressure")
            }
            CapacityBar(used: memory.map { Double($0.used) / Double(max(1, $0.physical)) } ?? 0)
                .opacity(memory == nil ? 0 : model.paused ? 0.5 : 1)
        }
    }
}

struct PanelMemoryDetails: View {
    let model: ActivityModel

    var body: some View {
        let memory = model.currentMemory
        VStack(spacing: 6) {
            HStack {
                Text("Swap")
                Spacer()
                Text(memory?.swapUsed.map(memorySize) ?? "Unavailable").font(BruhsType.dataSmall)
            }
            .accessibilityElement(children: .combine)
            .help("Memory macOS moved to disk. Swap can remain allocated after memory pressure returns to normal.")
            HStack {
                Text("Compressed")
                Spacer()
                Text(memory.map { memorySize($0.compressed) } ?? "Unavailable").font(BruhsType.dataSmall)
            }
            .accessibilityElement(children: .combine)
            .help("Memory compressed to make room in RAM. It is already included in used memory.")
        }
        .font(BruhsType.note)
        .foregroundStyle(BruhsColor.textSecondary)
        .opacity(model.paused ? 0.5 : 1)
    }
}
