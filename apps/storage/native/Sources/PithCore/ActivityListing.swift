import Foundation

public enum ActivityColumn: String, Sendable, CaseIterable {
    case name, cpu, memory, power, read, written
}

public struct ActivitySort: Equatable, Sendable {
    public var column: ActivityColumn
    public var ascending: Bool
    public init(column: ActivityColumn, ascending: Bool) { self.column = column; self.ascending = ascending }
    public static let cpuDescending = ActivitySort(column: .cpu, ascending: false)
}

/// The Activity table's contents, either live (the latest sample) or for a time range.
///
/// Apps and command-line tools come first; macOS's own processes are gathered into one
/// System group whose totals cover the processes Pith can read, alongside a count of the
/// ones macOS protects.
public struct ActivityListing: Sendable {
    public struct Values: Equatable, Sendable {
        public var cpu: Double?
        public var memory: UInt64?
        public var read: Double?
        public var written: Double?
        /// Watts, an estimate from the energy macOS counts per process.
        public var power: Double?
        /// The busiest process's CPU in cores, live only.
        public var cores: Double?
        public init(cpu: Double?, memory: UInt64?, read: Double?, written: Double?, power: Double? = nil, cores: Double? = nil) {
            self.cpu = cpu; self.memory = memory; self.read = read; self.written = written; self.power = power; self.cores = cores
        }
    }

    public struct App: Identifiable, Sendable {
        public let id: String
        public let identity: ProcessIdentity
        public let executable: String
        public let members: [ProcessKey]
        public let isRunning: Bool
        public let restricted: Bool
        public let processCount: Int
        public let values: Values
        /// The app's processes, merged by name, when it has more than one. Live only:
        /// history keeps app totals, not per-process samples.
        public let helpers: [Helper]
    }

    public struct Helper: Identifiable, Sendable {
        public let name: String
        public let pids: [Int32]
        public let values: Values
        public var count: Int { pids.count }
        public var id: String { name }
    }

    public struct System: Sendable {
        public let processCount: Int
        /// Processes macOS won't let Pith read without administrator access.
        public let protectedCount: Int
        public let values: Values
        public let apps: [App]
    }

    public let apps: [App]
    public let system: System?

    /// - Parameters:
    ///   - latest: the newest sample, for live process detail and the hidden-process count.
    ///   - range: rank by usage across this uptime range instead of the latest sample.
    ///   - includeExited: also list apps that have quit, live only; a range lists whatever ran in it.
    public init(history: SessionHistory, latest: ActivitySnapshot?, range: ClosedRange<Double>?, search: String, includeExited: Bool, sort: ActivitySort) {
        let filters = ActivityQuery(search)
        let query = filters.text
        let processes = Dictionary((latest?.processes ?? []).map { ($0.key, $0) }, uniquingKeysWith: { first, _ in first })
        let usage = range.map(history.appUsage(in:))
        var apps: [App] = []
        var system: [App] = []
        var systemMemoryAcrossRange: [Double] = []
        for timeline in history.apps.values {
            let sample = timeline.latest
            guard Self.matches(sample, query, processes: processes) else { continue }
            func row(_ values: Values, processCount: Int, helpers: [Helper] = []) -> App {
                App(id: timeline.id, identity: sample.identity, executable: sample.executable, members: sample.members, isRunning: timeline.isRunning,
                    restricted: sample.restricted, processCount: processCount, values: values, helpers: helpers)
            }
            let app: App
            if let usage {
                guard let used = usage[timeline.id] else { continue }
                app = row(Values(cpu: used.cpu, memory: used.memory, read: used.read, written: used.written, power: used.power), processCount: used.processes)
                if sample.identity.kind == .system, let memory = used.memoryAcrossRange { systemMemoryAcrossRange.append(memory) }
            } else if timeline.isRunning {
                app = row(Values(cpu: sample.cpu, memory: sample.memory, read: sample.read, written: sample.written, power: sample.power, cores: sample.cores),
                    processCount: sample.members.count, helpers: sample.members.count > 1 ? Self.helpers(sample.members, processes, sort) : [])
            } else if includeExited {
                // An app that has quit uses nothing now; its history is in the inspector and in ranked ranges.
                app = row(Values(cpu: 0, memory: 0, read: 0, written: 0, power: 0), processCount: sample.members.count)
            } else { continue }
            guard filters.passes(kind: sample.identity.kind, executable: sample.executable, values: app.values) else { continue }
            if sample.identity.kind == .system { system.append(app) } else { apps.append(app) }
        }
        self.apps = apps.sorted { Self.ordered($0, $1, sort) }
        let hidden = filters.isEmpty ? latest?.unavailableProcesses ?? 0 : 0
        if system.isEmpty && hidden == 0 {
            self.system = nil
        } else {
            func total<T: AdditiveArithmetic>(_ value: (Values) -> T?) -> T? {
                let known = system.compactMap { value($0.values) }
                return known.isEmpty ? nil : known.reduce(.zero, +)
            }
            // A ranged row's memory is its footprint while it ran. Summing those would count daemons that ran one
            // after another as if they ran together, so the range total uses footprints averaged across the range.
            let memory = usage == nil ? total(\.memory) : systemMemoryAcrossRange.isEmpty ? nil : UInt64(systemMemoryAcrossRange.reduce(0, +).rounded())
            self.system = System(
                processCount: system.reduce(hidden) { $0 + $1.processCount },
                protectedCount: system.filter(\.restricted).reduce(hidden) { $0 + $1.processCount },
                values: Values(cpu: total(\.cpu), memory: memory, read: total(\.read), written: total(\.written), power: total(\.power)),
                apps: system.sorted { Self.ordered($0, $1, sort) })
        }
    }

    /// Apps ranked across a stretch of kept history: each bucket's busiest apps, averaged. There's no process detail
    /// for the past, so rows have no helpers, and apps that fell out of a bucket's busiest list count as idle there.
    public init(longHistory: LongHistory, range: ClosedRange<Date>, span: HistorySpan, latest: ActivitySnapshot?, search: String, sort: ActivitySort) {
        let filters = ActivityQuery(search)
        let query = filters.text
        let running = Dictionary((latest?.apps ?? []).map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        var apps: [App] = [], system: [App] = []
        for (id, used) in longHistory.usage(in: range, span: span) {
            guard let known = longHistory.identities[id] else { continue }
            let kind = ProcessKind(rawValue: known.kind) ?? .commandLineTool
            let derived = ProcessIdentity(path: known.executable, processName: known.name, bundleName: known.name)
            let identity = ProcessIdentity(kind: kind, displayName: known.name, secondaryText: derived.secondaryText, description: derived.description)
            if !query.isEmpty, ![identity.displayName, identity.secondaryText].compactMap({ $0 }).contains(where: { $0.localizedCaseInsensitiveContains(query) }) { continue }
            let live = running[id]
            let row = App(id: id, identity: identity, executable: known.executable, members: live?.members ?? [], isRunning: live != nil, restricted: false,
                          processCount: live?.members.count ?? 0, values: Values(cpu: used.cpu, memory: used.memory, read: nil, written: nil, power: used.power), helpers: [])
            guard filters.passes(kind: kind, executable: known.executable, values: row.values) else { continue }
            if kind == .system { system.append(row) } else { apps.append(row) }
        }
        self.apps = apps.sorted { Self.ordered($0, $1, sort) }
        if system.isEmpty {
            self.system = nil
        } else {
            let cpu = system.compactMap(\.values.cpu), power = system.compactMap(\.values.power)
            self.system = System(processCount: system.count, protectedCount: 0,
                                 values: Values(cpu: cpu.isEmpty ? nil : cpu.reduce(0, +), memory: nil, read: nil, written: nil, power: power.isEmpty ? nil : power.reduce(0, +)),
                                 apps: system.sorted { Self.ordered($0, $1, sort) })
        }
    }

    /// Name, tool version or description, a member's PID, or a running helper's name, such as "Renderer".
    private static func matches(_ sample: AppSample, _ query: String, processes: [ProcessKey: ProcessSample]) -> Bool {
        guard !query.isEmpty else { return true }
        // The generic "macOS system process" line would match every system process, so only curated text counts.
        let text = [sample.identity.displayName, sample.identity.secondaryText].compactMap { $0 }
        return text.contains { $0.localizedCaseInsensitiveContains(query) }
            || sample.members.contains { String($0.pid).contains(query) }
            || sample.members.contains { processes[$0]?.displayName.localizedCaseInsensitiveContains(query) == true }
    }

    private static func helpers(_ members: [ProcessKey], _ processes: [ProcessKey: ProcessSample], _ sort: ActivitySort) -> [Helper] {
        let named = Dictionary(grouping: members.compactMap { processes[$0] }, by: \.displayName)
        let helpers = named.map { name, samples in
            func sum(_ value: (ProcessSample) -> Double?) -> Double? {
                let known = samples.compactMap(value)
                return known.count == samples.count ? known.reduce(0, +) : nil
            }
            let footprints = samples.compactMap(\.memory)
            return Helper(name: name, pids: samples.map(\.key.pid).sorted(),
                values: Values(cpu: sum(\.cpu), memory: footprints.count == samples.count ? footprints.reduce(0, +) : nil,
                    read: sum(\.read), written: sum(\.written), power: sum(\.power), cores: samples.compactMap(\.cores).max()))
        }
        return helpers.sorted { lhs, rhs in
            switch compare(lhs.values, rhs.values, lhs.name, rhs.name, sort) {
            case .orderedAscending: true
            case .orderedDescending: false
            case .orderedSame: lhs.name < rhs.name
            }
        }
    }

    private static func ordered(_ lhs: App, _ rhs: App, _ sort: ActivitySort) -> Bool {
        switch compare(lhs.values, rhs.values, lhs.identity.displayName, rhs.identity.displayName, sort) {
        case .orderedAscending: true
        case .orderedDescending: false
        case .orderedSame: lhs.id < rhs.id
        }
    }

    /// Orders by the sort column with unavailable values last in either direction, then by
    /// name so equal rows keep their places between samples.
    private static func compare(_ lhs: Values, _ rhs: Values, _ lhsName: String, _ rhsName: String, _ sort: ActivitySort) -> ComparisonResult {
        let byName = lhsName.localizedStandardCompare(rhsName)
        let value: (Values) -> Double?
        switch sort.column {
        case .name: return sort.ascending ? byName : byName.reversed
        case .cpu: value = \.cpu
        // Not `map(Double.init)`: for a UInt64 that can resolve to `Double(bitPattern:)`.
        case .memory: value = { values in values.memory.map { Double($0) } }
        case .power: value = \.power
        case .read: value = \.read
        case .written: value = \.written
        }
        switch (value(lhs), value(rhs)) {
        case let (l?, r?) where l != r: return (l < r) == sort.ascending ? .orderedAscending : .orderedDescending
        case (_?, nil): return .orderedAscending
        case (nil, _?): return .orderedDescending
        default: return byName
        }
    }
}

private extension ComparisonResult {
    var reversed: ComparisonResult {
        switch self {
        case .orderedAscending: .orderedDescending
        case .orderedDescending: .orderedAscending
        case .orderedSame: .orderedSame
        }
    }
}
