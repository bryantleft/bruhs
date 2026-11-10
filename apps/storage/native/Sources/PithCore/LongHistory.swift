import Foundation

/// How far back the Activity chart looks.
public enum HistorySpan: String, CaseIterable, Sendable, Codable {
    /// The live session window, every sample.
    case tenMinutes
    case sixHours
    case sevenDays

    public var seconds: TimeInterval {
        switch self {
        case .tenMinutes: SessionHistory.retention
        case .sixHours: 6 * 3600
        case .sevenDays: 7 * 86400
        }
    }

    public var title: String {
        switch self {
        case .tenMinutes: "10 min"
        case .sixHours: "6 hours"
        case .sevenDays: "7 days"
        }
    }
}

/// One app's share of a history bucket.
public struct BucketApp: Codable, Sendable, Equatable {
    public let id: String
    /// Average CPU across the bucket, counting time it wasn't running as idle.
    public let cpu: Double?
    /// Average footprint while it ran.
    public let memory: UInt64?
    public let power: Double?
    /// Bytes it wrote to disk during the bucket. Nil in buckets kept before Pith counted writes.
    public let written: UInt64?
}

/// An app that wrote to disk while a folder grew, as Disk names it: its name, what it wrote, and its .app bundle, whose
/// icon shows beside it, or nil for a process that has none.
public struct DiskWriter: Sendable, Equatable {
    public let name: String
    public let bytes: UInt64
    public let bundle: String?

    public init(name: String, bytes: UInt64, bundle: String? = nil) {
        self.name = name; self.bytes = bytes; self.bundle = bundle
    }
}

/// What an app was, kept once for every bucket that mentions it.
public struct BucketIdentity: Codable, Sendable, Equatable {
    public let name: String
    public let executable: String
    public let kind: String
}

/// A stretch of history summarized: the Mac's averages and worst states, and the apps that used the most in it.
public struct HistoryBucket: Codable, Sendable, Equatable {
    public let start: Date
    public let duration: TimeInterval
    public let cpu: Double?
    public let cpuPeak: Double?
    public let memoryUsed: UInt64?
    public let memoryPhysical: UInt64?
    public let swapPeak: UInt64?
    public let pressure: MemoryPressure
    public let thermal: ThermalPressure
    public let apps: [BucketApp]
    public var end: Date { start.addingTimeInterval(duration) }
}

/// A week of activity in tiers, as Netdata keeps its database: 30-second buckets for six hours and 5-minute buckets
/// for seven days, about 3,000 points per series. Each bucket keeps only the apps that used the most CPU or memory
/// or wrote the most in it, so the file stays near a megabyte however many processes run.
public struct LongHistory: Codable, Sendable {
    public static let fine: TimeInterval = 30
    public static let coarse: TimeInterval = 300
    /// The busiest apps by CPU and by memory a bucket keeps, so either ranking still names who used the most.
    public static let appsPerBucket = 6

    public private(set) var halfMinute: [HistoryBucket] = []
    public private(set) var fiveMinute: [HistoryBucket] = []
    public private(set) var identities: [String: BucketIdentity] = [:]
    private var fineAccumulator: Accumulator?
    private var coarseAccumulator: Accumulator?
    /// The last sample's uptime: an app's write rate covers the time since it, so rate times that is bytes written.
    private var lastUptime: Double?
    /// The last sample's date: an app whose process began after it opened since.
    private var lastDate: Date?
    /// Apps that opened while history was kept, for the charts' markers. Optional so a file saved before stays readable.
    private var launchLog: [AppLaunch]?

    /// Apps that opened while history was kept, oldest first.
    public var launches: [AppLaunch] { launchLog ?? [] }

    public init() {}

    /// Folds a live sample into the current 30-second bucket, closing buckets as their time passes.
    public mutating func record(_ snapshot: ActivitySnapshot) {
        for app in snapshot.apps where identities[app.id] == nil {
            identities[app.id] = BucketIdentity(name: app.name, executable: app.executable, kind: app.identity.kind.rawValue)
        }
        let start = Self.floor(snapshot.date, to: Self.fine)
        if let pending = fineAccumulator, pending.start != start { close(fine: pending) }
        if fineAccumulator?.start != start { fineAccumulator = Accumulator(start: start, duration: Self.fine) }
        // A first sample has no rate, and a last uptime from before a restart is later than now, so neither counts.
        let elapsed = lastUptime.map { snapshot.uptime - $0 }.flatMap { $0 > 0 ? $0 : nil }
        fineAccumulator?.add(snapshot, elapsed: elapsed)
        lastUptime = snapshot.uptime
        // Only launches seen happen: apps already running when history began aren't news.
        if let lastDate {
            let opened = snapshot.apps.compactMap(AppLaunch.of).filter { $0.date > lastDate && $0.date <= snapshot.date }
            if !opened.isEmpty { launchLog = launches + opened }
        }
        lastDate = snapshot.date
        prune(now: snapshot.date)
    }

    /// Bytes each app wrote to disk between `range`'s ends, most first, from the buckets that overlap it, and when those
    /// buckets begin: later than the range's start when history began after it. Approximate where an app fell out of a
    /// bucket's lists of the busiest. Nil when no bucket overlaps the range.
    public func written(in range: ClosedRange<Date>) -> (apps: [(id: String, bytes: UInt64)], from: Date)? {
        // Five-minute buckets for anything past six hours, which the 30-second ones no longer cover.
        let span: HistorySpan = range.upperBound.timeIntervalSince(range.lowerBound) > HistorySpan.sixHours.seconds ? .sevenDays : .sixHours
        let inside = buckets(span, now: range.upperBound.addingTimeInterval(1)).filter { $0.end > range.lowerBound && $0.start < range.upperBound }
        guard let first = inside.first else { return nil }
        var bytes: [String: UInt64] = [:]
        for bucket in inside {
            for app in bucket.apps { if let written = app.written, written > 0 { bytes[app.id, default: 0] += written } }
        }
        let apps = bytes.map { (id: $0.key, bytes: $0.value) }.sorted { $0.bytes > $1.bytes }
        return (apps, max(range.lowerBound, first.start))
    }

    /// The apps that wrote the most between `range`'s ends, most first and at most `limit` of them, each named as history
    /// knows it and with its .app bundle when it's an app, and when the buckets they come from begin. Nil when no bucket
    /// overlaps the range.
    public func writers(in range: ClosedRange<Date>, limit: Int) -> (writers: [DiskWriter], from: Date)? {
        guard let written = written(in: range) else { return nil }
        let writers = written.apps.prefix(limit).map { app in
            // An app's executable, as history keeps it, is its .app bundle (`AppSample.executable`).
            let identity = identities[app.id]
            return DiskWriter(name: identity?.name ?? app.id, bytes: app.bytes,
                              bundle: identity?.kind == ProcessKind.app.rawValue ? identity?.executable : nil)
        }
        return (Array(writers), written.from)
    }

    /// Buckets inside the span ending at `now`, oldest first: 30-second ones for six hours, 5-minute ones beyond.
    public func buckets(_ span: HistorySpan, now: Date) -> [HistoryBucket] {
        let from = now.addingTimeInterval(-span.seconds)
        switch span {
        case .tenMinutes: return halfMinute.filter { $0.end > from }
        case .sixHours: return halfMinute.filter { $0.end > from }
        case .sevenDays:
            // The 5-minute bucket still filling counts too, so the chart reaches now.
            let open = coarseAccumulator.map { [$0.bucket(keeping: Self.appsPerBucket)] } ?? []
            return (fiveMinute + open).filter { $0.end > from }
        }
    }

    /// Apps' usage across the buckets that overlap `range`: CPU averaged over the range, memory over the buckets the
    /// app appears in. Approximate where an app fell out of a bucket's busiest list, which counts it as idle there.
    public func usage(in range: ClosedRange<Date>, span: HistorySpan) -> [String: (cpu: Double?, memory: UInt64?, power: Double?)] {
        let inside = buckets(span, now: range.upperBound.addingTimeInterval(1)).filter { $0.end > range.lowerBound && $0.start < range.upperBound }
        guard !inside.isEmpty else { return [:] }
        var cpu: [String: Double] = [:], power: [String: Double] = [:], memory: [String: (sum: Double, count: Int)] = [:]
        for bucket in inside {
            for app in bucket.apps {
                if let value = app.cpu { cpu[app.id, default: 0] += value }
                if let value = app.power { power[app.id, default: 0] += value }
                if let value = app.memory { memory[app.id, default: (0, 0)].sum += Double(value); memory[app.id, default: (0, 0)].count += 1 }
            }
        }
        let ids = Set(cpu.keys).union(memory.keys).union(power.keys)
        let count = Double(inside.count)
        return Dictionary(uniqueKeysWithValues: ids.map { id in
            (id, (cpu[id].map { $0 / count }, memory[id].map { UInt64($0.sum / Double($0.count)) }, power[id].map { $0 / count }))
        })
    }

    public mutating func clear() { self = LongHistory() }

    private mutating func close(fine pending: Accumulator) {
        let bucket = pending.bucket(keeping: Self.appsPerBucket)
        halfMinute.append(bucket)
        let start = Self.floor(bucket.start, to: Self.coarse)
        if let coarse = coarseAccumulator, coarse.start != start { fiveMinute.append(coarse.bucket(keeping: Self.appsPerBucket)) }
        if coarseAccumulator?.start != start { coarseAccumulator = Accumulator(start: start, duration: Self.coarse) }
        coarseAccumulator?.add(bucket)
        fineAccumulator = nil
    }

    private mutating func prune(now: Date) {
        halfMinute.removeAll { $0.end < now.addingTimeInterval(-HistorySpan.sixHours.seconds) }
        fiveMinute.removeAll { $0.end < now.addingTimeInterval(-HistorySpan.sevenDays.seconds) }
        if let first = launchLog?.first, first.date < now.addingTimeInterval(-HistorySpan.sevenDays.seconds) {
            launchLog = launches.filter { $0.date >= now.addingTimeInterval(-HistorySpan.sevenDays.seconds) }
        }
        let kept = Set(halfMinute.flatMap(\.apps).map(\.id) + fiveMinute.flatMap(\.apps).map(\.id))
        if identities.count > kept.count * 2 + 64 { identities = identities.filter { kept.contains($0.key) } }
    }

    static func floor(_ date: Date, to step: TimeInterval) -> Date {
        Date(timeIntervalSince1970: (date.timeIntervalSince1970 / step).rounded(.down) * step)
    }

    /// Sums samples, or finer buckets, until its bucket closes.
    struct Accumulator: Codable, Sendable {
        let start: Date
        let duration: TimeInterval
        var samples = 0
        var cpuSum = 0.0, cpuCount = 0, cpuPeak: Double?
        var memorySum = 0.0, memoryCount = 0, physical: UInt64?
        var swapPeak: UInt64?
        var pressure = MemoryPressure.unknown
        var thermal = ThermalPressure.nominal
        var appCPU: [String: Double] = [:]
        var appPower: [String: Double] = [:]
        var appMemory: [String: Double] = [:]
        var appMemoryCount: [String: Int] = [:]
        /// Bytes written; optional so a bucket saved before Pith counted writes still loads.
        var appWritten: [String: Double]?

        init(start: Date, duration: TimeInterval) { self.start = start; self.duration = duration }

        mutating func add(_ snapshot: ActivitySnapshot, elapsed: Double? = nil) {
            samples += 1
            note(cpu: snapshot.cpu, peak: snapshot.cpu, memory: snapshot.memory?.used, physical: snapshot.memory?.physical,
                 swap: snapshot.memory?.swapUsed, pressure: snapshot.pressure, thermal: snapshot.thermal)
            var written = appWritten ?? [:]
            for app in snapshot.apps {
                if let cpu = app.cpu { appCPU[app.id, default: 0] += cpu }
                if let power = app.power { appPower[app.id, default: 0] += power }
                if let memory = app.memory { appMemory[app.id, default: 0] += Double(memory); appMemoryCount[app.id, default: 0] += 1 }
                if let rate = app.written, let elapsed { written[app.id, default: 0] += rate * elapsed }
            }
            appWritten = written
        }

        /// A finer bucket counts as one sample; its apps' averages add up as samples' readings do.
        mutating func add(_ bucket: HistoryBucket) {
            samples += 1
            note(cpu: bucket.cpu, peak: bucket.cpuPeak, memory: bucket.memoryUsed, physical: bucket.memoryPhysical, swap: bucket.swapPeak, pressure: bucket.pressure, thermal: bucket.thermal)
            var written = appWritten ?? [:]
            for app in bucket.apps {
                if let cpu = app.cpu { appCPU[app.id, default: 0] += cpu }
                if let power = app.power { appPower[app.id, default: 0] += power }
                if let memory = app.memory { appMemory[app.id, default: 0] += Double(memory); appMemoryCount[app.id, default: 0] += 1 }
                if let bytes = app.written { written[app.id, default: 0] += Double(bytes) }
            }
            appWritten = written
        }

        private mutating func note(cpu: Double?, peak: Double?, memory: UInt64?, physical: UInt64?, swap: UInt64?, pressure: MemoryPressure, thermal: ThermalPressure) {
            if let cpu { cpuSum += cpu; cpuCount += 1 }
            if let peak { cpuPeak = max(cpuPeak ?? 0, peak) }
            if let memory { memorySum += Double(memory); memoryCount += 1 }
            if let physical { self.physical = physical }
            if let swap { swapPeak = max(swapPeak ?? 0, swap) }
            if pressure.rawValue > self.pressure.rawValue { self.pressure = pressure }
            if thermal > self.thermal { self.thermal = thermal }
        }

        func bucket(keeping limit: Int) -> HistoryBucket {
            let count = Double(max(1, samples))
            let byCPU = appCPU.sorted { $0.value > $1.value }.prefix(limit).map(\.key)
            let byMemory = appMemory.map { ($0.key, $0.value / Double(appMemoryCount[$0.key] ?? 1)) }.sorted { $0.1 > $1.1 }.prefix(limit).map(\.0)
            let written = appWritten ?? [:]
            let byWrites = written.filter { $0.value >= 1 }.sorted { $0.value > $1.value }.prefix(limit).map(\.key)
            let kept = Array(Set(byCPU + byMemory + byWrites)).sorted()
            let apps = kept.map { id in
                BucketApp(id: id, cpu: appCPU[id].map { $0 / count }, memory: appMemory[id].map { UInt64($0 / Double(appMemoryCount[id] ?? 1)) }, power: appPower[id].map { $0 / count },
                          written: written[id].map { UInt64($0.rounded()) })
            }
            return HistoryBucket(start: start, duration: duration, cpu: cpuCount > 0 ? cpuSum / Double(cpuCount) : nil, cpuPeak: cpuPeak,
                                 memoryUsed: memoryCount > 0 ? UInt64(memorySum / Double(memoryCount)) : nil, memoryPhysical: physical, swapPeak: swapPeak,
                                 pressure: pressure, thermal: thermal, apps: apps)
        }
    }
}
