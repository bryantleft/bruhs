import Foundation

/// System CPU across a time range, from the samples that had a reading.
public struct CPUSummary: Equatable, Sendable {
    public let average: Double
    public let peak: Double
}

/// One app's usage across a time range.
///
/// CPU and disk rates are averaged over every sample in the range, so time the app wasn't
/// running counts as idle and a short burst ranks below sustained work. Samples where the
/// app couldn't be read are left out rather than counted as zero. Memory is the average
/// footprint while the app was running.
public struct AppUsage: Equatable, Sendable {
    public let cpu: Double?
    public let peakCPU: Double?
    public let memory: UInt64?
    /// Footprint in bytes averaged like CPU, counting samples the app wasn't running as zero. Unlike `memory`,
    /// these add up across apps to their average combined footprint, even when the apps ran at different times.
    public let memoryAcrossRange: Double?
    public let read: Double?
    public let written: Double?
    /// Distinct processes that belonged to the app at any sample in the range.
    public let processes: Int
}

extension CPUSummary {
    /// Average and peak of the readings inside `range`; nil when there are none, which means unknown, not zero.
    public init?(_ points: [ActivityPoint], in range: ClosedRange<Double>) {
        let values = points.filter { range.contains($0.uptime) }.compactMap(\.cpu)
        guard let peak = values.max() else { return nil }
        self.init(average: values.reduce(0, +) / Double(values.count), peak: peak)
    }
}

extension SessionHistory {
    public func systemCPU(in range: ClosedRange<Double>) -> CPUSummary? { CPUSummary(system, in: range) }

    /// Usage for every app that was running at some sample inside `range`, keyed by app id.
    public func appUsage(in range: ClosedRange<Double>) -> [String: AppUsage] {
        let samples = sampleCount(in: range)
        return apps.compactMapValues { Self.usage($0, in: range, samples: samples) }
    }

    /// One app's usage inside `range`; nil if it wasn't running at any sample there.
    public func usage(of id: String, in range: ClosedRange<Double>) -> AppUsage? {
        apps[id].flatMap { Self.usage($0, in: range, samples: sampleCount(in: range)) }
    }

    /// App points are recorded with every system sample, so these are the range's samples.
    private func sampleCount(in range: ClosedRange<Double>) -> Int {
        system.lazy.filter { range.contains($0.uptime) }.count
    }

    private static func usage(_ timeline: AppTimeline, in range: ClosedRange<Double>, samples: Int) -> AppUsage? {
        let points = timeline.points.filter { range.contains($0.uptime) }
        guard !points.isEmpty, samples > 0 else { return nil }
        // Mean over the samples where the value is known; samples the app was absent from count as zero.
        func average(_ value: (AppPoint) -> Double?) -> Double? {
            let known = points.compactMap(value)
            guard !known.isEmpty else { return nil }
            return known.reduce(0, +) / Double(samples - (points.count - known.count))
        }
        let footprints = points.compactMap(\.memory)
        return AppUsage(
            cpu: average(\.cpu),
            peakCPU: points.compactMap(\.cpu).max(),
            memory: footprints.isEmpty ? nil : footprints.reduce(0, +) / UInt64(footprints.count),
            memoryAcrossRange: average { point in point.memory.map { Double($0) } },
            read: average(\.read),
            written: average(\.written),
            processes: Set(points.flatMap(\.members)).count)
    }

    /// The wall-clock time of an uptime, measured from the latest sample.
    public func date(at uptime: Double) -> Date? {
        system.last.map { $0.date.addingTimeInterval(uptime - $0.uptime) }
    }
}

public enum TimeAxis {
    /// Uptimes of wall-clock minutes that are multiples of `stepMinutes`, inside the `span`
    /// seconds ending at `now`. Ticks within `clearance` seconds of now are dropped so they
    /// can't collide with a "now" label.
    public static func ticks(endingAt now: Double, date: Date, span: Double, stepMinutes: Int, clearance: Double) -> [Double] {
        let step = Double(stepMinutes * 60)
        let end = date.timeIntervalSince1970
        var tick = (ceil((end - span) / step) * step)
        var result: [Double] = []
        while tick <= end - clearance {
            result.append(now - (end - tick))
            tick += step
        }
        return result
    }
}
