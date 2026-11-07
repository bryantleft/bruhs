import Foundation

/// What the menu bar item and its panel show, derived from the latest snapshot and the session history.
/// Windows and gaps are in sample-clock seconds (`ActivityPoint.uptime`); dates are only for display.
public enum PanelSummary {
    // MARK: CPU

    public struct CPU: Equatable, Sendable {
        public let average: Double?
        public let peak: Double?
        /// The first reading's date while the session is younger than the window, so captions can say
        /// "since 10:41" and the part-empty chart reads as history still building.
        public let since: Date?
    }

    public static func cpu(_ points: [ActivityPoint], window: ClosedRange<Double>, maxGap: TimeInterval) -> CPU {
        guard let summary = CPUSummary(points, in: window),
              let first = points.first(where: { window.contains($0.uptime) && $0.cpu != nil })
        else { return CPU(average: nil, peak: nil, since: nil) }
        return CPU(average: summary.average, peak: summary.peak,
                   since: startsLate(first, window: window, maxGap: maxGap) ? first.date : nil)
    }

    // MARK: Memory pressure

    /// One stretch of a single memory-pressure state.
    public struct PressureRun: Equatable, Sendable {
        public let start: Double
        public let end: Double
        public let pressure: MemoryPressure
        public init(start: Double, end: Double, pressure: MemoryPressure) { self.start = start; self.end = end; self.pressure = pressure }
    }

    /// Readings merged into runs for the panel's pressure band. A reading covers the time back to the previous
    /// reading, or one `interval` back after a gap, so the newest state shows at once. Unknown readings and gaps
    /// longer than `maxGap` stay empty: no colour where there is no data.
    public static func pressureRuns(_ points: [ActivityPoint], window: ClosedRange<Double>, interval: TimeInterval, maxGap: TimeInterval) -> [PressureRun] {
        var runs: [PressureRun] = []
        var previous: Double?
        for point in points where window.contains(point.uptime) {
            guard point.pressure != .unknown else { previous = nil; continue }
            let joined = previous.flatMap { point.uptime - $0 <= maxGap ? $0 : nil }
            if joined != nil, let last = runs.last, last.pressure == point.pressure {
                runs[runs.count - 1] = PressureRun(start: last.start, end: point.uptime, pressure: point.pressure)
            } else {
                runs.append(PressureRun(start: joined ?? max(window.lowerBound, point.uptime - interval), end: point.uptime, pressure: point.pressure))
            }
            previous = point.uptime
        }
        return runs
    }

    /// The one line under the pressure band.
    public enum PressureStory: Equatable, Sendable {
        /// macOS reported no pressure level in the window.
        case unavailable
        /// Every reading was normal; `since` is set while the session is younger than the window.
        case normal(since: Date?)
        /// The most recent stretch of warning or critical readings; `end` is nil while it continues.
        case elevated(start: Date, end: Date?, worst: MemoryPressure)
    }

    public static func pressureStory(_ points: [ActivityPoint], window: ClosedRange<Double>, maxGap: TimeInterval) -> PressureStory {
        let known = points.filter { window.contains($0.uptime) && $0.pressure != .unknown }
        guard let first = known.first, let newest = known.last else { return .unavailable }
        guard let end = known.lastIndex(where: \.pressure.isElevated) else {
            return .normal(since: startsLate(first, window: window, maxGap: maxGap) ? first.date : nil)
        }
        var start = end
        while start > 0, known[start - 1].pressure.isElevated, known[start].uptime - known[start - 1].uptime <= maxGap { start -= 1 }
        let worst: MemoryPressure = known[start...end].contains { $0.pressure == .critical } ? .critical : .warning
        let ongoing = end == known.count - 1 && window.upperBound - newest.uptime <= maxGap
        return .elevated(start: known[start].date, end: ongoing ? nil : known[end].date, worst: worst)
    }

    // MARK: Apps

    /// What the panel ranks apps by: CPU, or memory while memory pressure is elevated, so the list names the culprit.
    public enum Ranking: Sendable, Equatable {
        case cpu, memory
        public init(pressure: MemoryPressure) { self = pressure.isElevated ? .memory : .cpu }
    }

    public struct Apps: Sendable {
        /// The busiest apps and tools by `ranking`, most first. macOS's own processes are in `system` instead.
        public let top: [AppSample]
        /// Every other app and tool except Pith, with the CPU and memory of those Pith can measure.
        public let otherCount: Int
        public let otherCPU: Double?
        public let otherMemory: UInt64?
        /// macOS's own processes, summed into one row, as Activity groups them.
        public let systemCount: Int
        public let systemCPU: Double?
        public let systemMemory: UInt64?
        /// Pith's own process group, so the panel can show what monitoring costs.
        public let own: AppSample?
        public let ranking: Ranking
    }

    /// The busiest apps and tools, without Pith itself; the rest of them are summed into one row and macOS's own
    /// processes into another, so the list adds up without daemons posing as apps. `holding` is an earlier order of app
    /// ids, kept while the pointer is over the list so a row doesn't change under a click; apps that quit drop out of it.
    public static func apps(_ apps: [AppSample], ownPID: Int32, limit: Int, holding: [String]? = nil, ranking: Ranking = .cpu) -> Apps {
        let own = own(apps, pid: ownPID)
        let system = apps.filter { $0.identity.kind == .system && $0.id != own?.id }
        let others = apps.filter { $0.identity.kind != .system && $0.id != own?.id }
        let top: [AppSample]
        if let holding {
            let byID = Dictionary(others.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
            top = holding.compactMap { byID[$0] }
        } else {
            let measured = others.filter { ranking == .cpu ? $0.cpu != nil : $0.memory != nil }
            top = Array(measured.sorted { busier($0, $1, by: ranking) }.prefix(limit))
        }
        let shown = Set(top.map(\.id))
        let rest = others.filter { !shown.contains($0.id) }
        func cpu(_ group: [AppSample]) -> Double? {
            let values = group.compactMap(\.cpu)
            return values.isEmpty ? nil : values.reduce(0, +)
        }
        func memory(_ group: [AppSample]) -> UInt64? {
            let values = group.compactMap(\.memory)
            return values.isEmpty ? nil : values.reduce(0, +)
        }
        return Apps(top: top, otherCount: rest.count, otherCPU: cpu(rest), otherMemory: memory(rest),
                    systemCount: system.reduce(0) { $0 + $1.members.count }, systemCPU: cpu(system), systemMemory: memory(system),
                    own: own, ranking: ranking)
    }

    /// How much an app's footprint changed across the window: its latest reading less its first one inside it. Nil
    /// with fewer than two readings, since one reading shows no change.
    public static func memoryGrowth(_ timeline: AppTimeline?, window: ClosedRange<Double>) -> Int64? {
        guard let points = timeline?.points.filter({ window.contains($0.uptime) }).compactMap({ $0.memory }), let first = points.first, let last = points.last, points.count > 1 else { return nil }
        return Int64(bitPattern: last &- first)
    }

    /// The panel's answer while memory pressure is elevated: since when, and which app grew the most, or failing
    /// that which uses the most. Nil while pressure is normal.
    public static func memoryCulprit(_ snapshot: ActivitySnapshot?, history: SessionHistory, window: ClosedRange<Double>, ownPID: Int32) -> (app: AppSample, growth: Int64?)? {
        guard let snapshot, snapshot.pressure.isElevated else { return nil }
        let candidates = snapshot.apps.filter { $0.memory != nil && !$0.members.contains { $0.pid == ownPID } }
        let grown = candidates.compactMap { app in memoryGrowth(history.apps[app.id], window: window).map { (app, $0) } }
        // Growth names a culprit only when it's real: 100 MB in ten minutes is a browser tab, not noise.
        if let biggest = grown.max(by: { $0.1 < $1.1 }), biggest.1 >= 100_000_000 { return (biggest.0, biggest.1) }
        return candidates.max { ($0.memory ?? 0) < ($1.memory ?? 0) }.map { ($0, nil) }
    }

    /// What follows an app's name in the panel. A tool's version tells copies apart, as in Activity, and rows that
    /// would still read the same add their first process ID; macOS runs some daemons several times over.
    /// System descriptions are too long for a glance.
    public static func details(_ app: AppSample, among shown: [AppSample]) -> [String] {
        let version = { (app: AppSample) in app.identity.kind == .commandLineTool ? app.identity.secondaryText : nil }
        let twin = shown.contains { $0.id != app.id && $0.name == app.name && version($0) == version(app) }
        return [version(app), twin ? app.members.first.map { "PID \($0.pid)" } : nil].compactMap { $0 }
    }

    /// The process group that contains `pid`: Pith's own, when given its process identifier.
    public static func own(_ apps: [AppSample], pid: Int32) -> AppSample? {
        apps.first { $0.members.contains { $0.pid == pid } }
    }

    /// More CPU (or memory) first; equal values fall back to the name, then the id, so rows don't swap between samples.
    private static func busier(_ a: AppSample, _ b: AppSample, by ranking: Ranking) -> Bool {
        switch ranking {
        case .cpu: if a.cpu != b.cpu { return (a.cpu ?? -1) > (b.cpu ?? -1) }
        case .memory: if a.memory != b.memory { return (a.memory ?? 0) > (b.memory ?? 0) }
        }
        if a.name != b.name { return a.name < b.name }
        return a.id < b.id
    }

    // MARK: Glance state

    /// True until the sampler has a baseline: its first reading after a start has no rates, so there is nothing
    /// to show yet. An error is shown rather than hidden behind "collecting".
    public static func isCollecting(_ snapshot: ActivitySnapshot?) -> Bool {
        guard let snapshot else { return true }
        return snapshot.error == nil && snapshot.cpu == nil && snapshot.apps.allSatisfy { $0.cpu == nil }
    }

    /// "1:05" or "13:05": the locale's short time without its day period, which ten minutes of history never
    /// needs. The format's own "a" (day period) is dropped; everything else, separators included, stays local.
    public static func clock(_ date: Date, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        let pattern = DateFormatter.dateFormat(fromTemplate: "jmm", options: 0, locale: locale) ?? "HH:mm"
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.dateFormat = pattern.replacingOccurrences(of: "a", with: "").trimmingCharacters(in: .whitespaces)
        return formatter.string(from: date)
    }

    /// The menu bar value in four digit-wide cells, e.g. "\u{2007}17%", or nil without a reading, when the glyph
    /// shows alone rather than a placeholder. Figure spaces are as wide as tabular digits, so the status item keeps
    /// one width as the value ticks.
    public static func menuBarValue(_ percent: String?) -> String? {
        guard let percent else { return nil }
        return String(repeating: "\u{2007}", count: max(0, 4 - percent.count)) + percent
    }

    /// Readings that begin more than `maxGap` after the window opens: the session is younger than the window.
    private static func startsLate(_ first: ActivityPoint, window: ClosedRange<Double>, maxGap: TimeInterval) -> Bool {
        first.uptime - window.lowerBound > maxGap
    }
}
