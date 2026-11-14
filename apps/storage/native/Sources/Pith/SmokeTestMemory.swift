import AppKit
import Darwin
import PithCore
import SwiftUI

extension AppDelegate {
    /// Fixed-size synthetic history separates retained view state from a growing process list or a disk scan.
    func auditMemory(savingTo report: URL) async {
        setvbuf(stdout, nil, _IOLBF, 0)
        activity.pause()
        activity.keepsHistory = false
        activity.history = SessionHistory()
        for index in 0...600 { activity.history.append(Self.memorySample(index)) }
        activity.snapshot = Self.memorySample(600)
        activity.paused = false
        var next = 601
        var phases: [MemoryPhase] = []
        let surfaces: [String]
        if let index = CommandLine.arguments.firstIndex(of: "--memory-surface"), CommandLine.arguments.indices.contains(index + 1) {
            let surface = CommandLine.arguments[index + 1]
            guard ["chart", "table", "activity", "panel"].contains(surface) else {
                print("Unknown memory diagnostic surface: \(surface)")
                exit(2)
            }
            surfaces = [surface]
        } else {
            surfaces = CommandLine.arguments.contains("--memory-isolate") ? ["chart", "table", "activity", "panel"] : ["activity", "panel"]
        }
        var componentWindow: NSWindow?
        for surface in surfaces {
            if surface == "chart" {
                componentWindow = memoryWindow(ActivityChart(model: activity, state: ActivityState(), range: nil))
            } else if surface == "table" {
                componentWindow = memoryWindow(MemoryTableProbe(model: activity))
            }
            if surface == "activity" { showActivity() }
            else if surface == "panel" { mainWindow?.window.performClose(nil); statusItem?.togglePanel() }
            for _ in 0..<64 { await tick() }
            let before = MemoryReading.capture()
            for _ in 0..<200 { await tick() }
            let middle = MemoryReading.capture()
            for _ in 0..<200 { await tick() }
            let after = MemoryReading.capture()
            let phase = MemoryPhase(surface: surface, before: before, middle: middle, after: after)
            phases.append(phase)
            print("memory \(surface): \(before.bytes) -> \(middle.bytes) -> \(after.bytes) bytes; \(before.blocks) -> \(middle.blocks) -> \(after.blocks) blocks")
            componentWindow?.orderOut(nil)
            componentWindow?.contentViewController = nil
            componentWindow = nil
        }
        activity.pause()
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            try FileManager.default.createDirectory(at: report.deletingLastPathComponent(), withIntermediateDirectories: true)
            try encoder.encode(phases).write(to: report, options: .atomic)
            // The old adaptive header retained 32 MiB per 200 updates on macOS 26.3. This fixed four-app,
            // 601-point fixture permits 8 MiB for platform caches, while rejecting that measured growth.
            let failures = phases.filter { $0.after.bytes > $0.before.bytes + 8 * 1024 * 1024 }
            guard failures.isEmpty else {
                print("Retained UI heap exceeded 8 MiB after warmup: \(failures.map(\.surface).joined(separator: ", "))")
                exit(1)
            }
            NSApp.terminate(nil)
        } catch {
            print("Memory diagnostic could not save \(report.path): \(error.localizedDescription)")
            exit(1)
        }

        func tick() async {
            let sample = Self.memorySample(next)
            next += 1
            activity.snapshot = sample
            activity.history.append(sample)
            statusItem?.update()
            // Twenty updates a second exercise the same view lifetime ten times faster than live totals.
            try? await Task.sleep(for: .milliseconds(50))
        }
    }

    private func memoryWindow<V: View>(_ content: V) -> NSWindow {
        let host = NSHostingController(rootView: content.padding(16).background(BruhsColor.canvas).tint(BruhsColor.accent))
        host.sizingOptions = []
        let window = NSWindow(contentRect: NSRect(x: 40, y: 40, width: 820, height: 560), styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentViewController = host
        window.makeKeyAndOrderFront(nil)
        return window
    }

    private static func memorySample(_ index: Int) -> ActivitySnapshot {
        let apps = (0..<4).map { item in
            AppSample(id: "memory-\(item)", identity: ProcessIdentity(path: "/Applications/Memory \(item).app", processName: "Memory \(item)", bundleName: "Memory \(item)"),
                      executable: "", members: [ProcessKey(pid: Int32(item + 10), started: 1)], cpu: Double((index + item * 20) % 80),
                      memory: 100_000_000, read: 0, written: 0, restricted: false, openedBy: nil)
        }
        let memory = MemoryUse(physical: 16_000_000_000, used: 8_000_000_000 + UInt64(index % 100) * 1_000_000,
                               app: 6_000_000_000, wired: 1_000_000_000, compressed: 1_000_000_000,
                               cached: 2_000_000_000, swapUsed: 0, swapTotal: 0)
        return ActivitySnapshot(date: Date(timeIntervalSince1970: 1_700_000_000 + Double(index)), uptime: Double(index),
                                cpu: Double(index % 80), pressure: .normal, apps: apps, error: nil, memory: memory)
    }
}

private struct MemoryTableProbe: View {
    let model: ActivityModel

    var body: some View {
        let listing = ActivityListing(history: model.history, latest: model.snapshot, range: nil, search: "", includeExited: false, sort: .cpuDescending)
        ActivityTable(listing: listing, opensSystem: false, selection: .constant(nil), expanded: .constant([]), sort: .constant(.cpuDescending))
    }
}

private struct MemoryReading: Codable {
    let bytes: UInt64
    let blocks: UInt64

    static func capture() -> Self {
        var statistics = malloc_statistics_t()
        malloc_zone_statistics(nil, &statistics)
        return Self(bytes: UInt64(statistics.size_in_use), blocks: UInt64(statistics.blocks_in_use))
    }
}

private struct MemoryPhase: Codable {
    let surface: String
    let before: MemoryReading
    let middle: MemoryReading
    let after: MemoryReading
}
