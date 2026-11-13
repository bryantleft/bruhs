import Foundation
import PithSystem

/// A lightweight reading for the menu bar and the system CPU and memory charts.
public struct SystemTotals: Sendable {
    public let date: Date
    public let uptime: Double
    public let cpu: Double?
    public let pressure: MemoryPressure
    public let memory: MemoryUse?
    /// CPU tiers, lowest capability first, as macOS numbers the cores.
    public let tiers: [CoreTier]

    public init(date: Date, uptime: Double, cpu: Double?, pressure: MemoryPressure, memory: MemoryUse?, tiers: [CoreTier]) {
        self.date = date; self.uptime = uptime; self.cpu = cpu; self.pressure = pressure; self.memory = memory; self.tiers = tiers
    }
}

/// Samples only the Mac's CPU and memory. Its baselines are independent of the slower app/process sampler.
public actor SystemTotalsSampler {
    private var previousCPU: (busy: UInt64, total: UInt64)?
    private var previousCores: [(busy: UInt64, total: UInt64)] = []
    private let tierLayout = SystemSampler.readTierLayout()

    public init() {}

    public func reset() {
        previousCPU = nil
        previousCores = []
    }

    public func sample() -> SystemTotals {
        let capture = pith_read_totals()
        let uptime = SampleClock.now
        let date = Date()
        let cpu = capture.cpu_valid != 0 ? previousCPU.flatMap {
            MetricMath.cpu(busy: capture.busy_ticks, total: capture.total_ticks, previousBusy: $0.busy, previousTotal: $0.total)
        } : nil
        let cores = capture.coreTicks
        let tiers = SystemSampler.tiers(tierLayout, current: cores, previous: previousCores)
        previousCPU = capture.cpu_valid != 0 ? (capture.busy_ticks, capture.total_ticks) : nil
        previousCores = cores
        return SystemTotals(date: date, uptime: uptime, cpu: cpu, pressure: MemoryPressure(rawValue: Int(capture.pressure)) ?? .unknown,
                            memory: capture.memoryUse, tiers: tiers)
    }
}

/// Stateless decoding shared by the full sampler and the fast totals sampler; neither shares counter baselines.
extension pith_capture {
    var coreTicks: [(busy: UInt64, total: UInt64)] {
        guard cpu_valid != 0 else { return [] }
        return withUnsafeBytes(of: cpu_busy) { busy in
            withUnsafeBytes(of: cpu_total) { total in
                (0..<min(max(0, Int(cpu_count)), Int(PITH_MAX_CPUS))).map {
                    (busy.load(fromByteOffset: $0 * 8, as: UInt64.self), total.load(fromByteOffset: $0 * 8, as: UInt64.self))
                }
            }
        }
    }

    var memoryUse: MemoryUse? {
        guard memory_valid != 0 else { return nil }
        return MemoryUse(pages: (active, inactive, speculative, wired, compressed, purgeable, external),
                         pageSize: page_size, physical: physical,
                         swapUsed: swap_valid != 0 ? swap_used : nil, swapTotal: swap_valid != 0 ? swap_total : nil)
    }
}
