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

/// Used memory comes first. Compression, then swap, give way at larger text sizes.
struct PanelMemoryFigures: View {
    let model: ActivityModel

    var body: some View {
        let memory = model.paused ? nil : model.currentMemory
        let used = LabeledFigure(label: "Used", value: memory.map { memorySize($0.used) } ?? "", amount: memory.map { Double($0.used) }, duration: ReadingMotion.live)
            .help(memory.map { "\(memorySize($0.used)) of \(memorySize($0.physical)) in use" } ?? "")
        let swap = LabeledFigure(label: "Swap", value: memory?.swapUsed.map(memorySize) ?? "", amount: memory?.swapUsed.map(Double.init), duration: ReadingMotion.live)
            .help("Memory macOS moved to the disk. Swapping is what makes a Mac slow when memory runs short.")
        let compressed = LabeledFigure(label: "Compressed", value: memory.map { memorySize($0.compressed) } ?? "", amount: memory.map { Double($0.compressed) }, duration: ReadingMotion.live)
            .help("Memory macOS compressed to make room before it swaps.")
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline, spacing: 10) { used; Spacer(minLength: 0); swap; compressed }
            HStack(alignment: .firstTextBaseline, spacing: 10) { used; Spacer(minLength: 0); swap }
            HStack(alignment: .firstTextBaseline, spacing: 10) { used; Spacer(minLength: 0) }
        }
        .accessibilityElement(children: .combine)
        .opacity(memory == nil ? 0 : 1)
        .accessibilityHidden(memory == nil)
        .overlay(alignment: .leading) {
            if memory == nil {
                Text("Memory readings unavailable").font(BruhsType.note).foregroundStyle(BruhsColor.textSecondary)
            }
        }
    }
}
