import Foundation
import PithSystem

public actor SystemSampler {
    private var previous: [ProcessKey: RawProcess] = [:]
    private var previousCPU: (busy: UInt64, total: UInt64)?
    private var previousUptime: Double?
    /// Info.plist display names by bundle path; nil when the bundle doesn't name itself.
    private var names: [String: String?] = [:]
    /// Enclosing .app bundles and identities by executable path. Both depend only on the path, so they're worked
    /// out when a path first appears rather than for every process every sample; each keeps the paths running now.
    private var bundles: [String: String?] = [:]
    private var identities: [IdentityKey: ProcessIdentity] = [:]
    private struct IdentityKey: Hashable { let path: String; let name: String; let bundleName: String? }
    public init() {}

    public func reset() {
        previous = [:]; previousCPU = nil; previousUptime = nil
    }

    public func sample() -> ActivitySnapshot {
        let capture = pith_read()
        defer { pith_free(capture) }
        let uptime = SampleClock.now
        let date = Date()
        var processes: [RawProcess] = []
        if let pointer = capture.processes {
            processes.reserveCapacity(Int(capture.count))
            for p in UnsafeBufferPointer(start: pointer, count: Int(capture.count)) {
                let path = withUnsafeBytes(of: p.path) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
                let name = withUnsafeBytes(of: p.name) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
                processes.append(RawProcess(key: ProcessKey(pid: p.pid, started: p.started_us), parent: p.parent_pid, name: name, path: path,
                    cpu: p.readable != 0 ? p.cpu_ns : nil, memory: p.readable != 0 ? p.footprint : nil,
                    read: p.readable != 0 ? p.read_bytes : nil, written: p.readable != 0 ? p.written_bytes : nil))
            }
        }
        let elapsed = previousUptime.map { uptime - $0 }
        let cpu = capture.cpu_valid != 0 ? previousCPU.flatMap {
            MetricMath.cpu(busy: capture.busy_ticks, total: capture.total_ticks, previousBusy: $0.busy, previousTotal: $0.total)
        } : nil
        let byPID = Dictionary(uniqueKeysWithValues: processes.map { ($0.key.pid, $0) })
        bundles = Dictionary(uniqueKeysWithValues: Set(processes.map(\.path)).map { path in (path, bundles[path] ?? Self.bundlePath(path)) })
        func bundle(_ process: RawProcess) -> String? { bundles[process.path] ?? nil }
        // A helper's owner is its oldest ancestor inside the same .app bundle; anything else owns itself.
        func owner(of process: RawProcess) -> RawProcess {
            guard let home = bundle(process) else { return process }
            var owner = process
            var visited: Set<Int32> = [process.key.pid]
            while let parent = byPID[owner.parent], bundle(parent) == home, visited.insert(parent.key.pid).inserted {
                owner = parent
            }
            return owner
        }
        func groupID(_ owner: RawProcess) -> String { bundle(owner).map { "\($0):\(owner.key.id)" } ?? owner.key.id }
        let owners = Dictionary(uniqueKeysWithValues: processes.map { ($0.key, owner(of: $0)) })
        let grouped = Dictionary(grouping: processes) { groupID(owners[$0.key] ?? $0) }
        var identities: [String: ProcessIdentity] = [:]
        var known: [IdentityKey: ProcessIdentity] = [:]
        for members in grouped.values {
            let owner = owners[members[0].key] ?? members[0]
            let key = IdentityKey(path: owner.path, name: owner.name, bundleName: bundle(owner).flatMap(bundleName))
            let identity = self.identities[key] ?? ProcessIdentity(path: key.path, processName: key.name, bundleName: key.bundleName)
            known[key] = identity
            identities[groupID(owner)] = identity
        }
        self.identities = known
        let cores = Double(ProcessInfo.processInfo.activeProcessorCount)
        func rate(_ process: RawProcess, _ keyPath: KeyPath<RawProcess, UInt64?>) -> Double? {
            guard let elapsed, let current = process[keyPath: keyPath], let old = previous[process.key]?[keyPath: keyPath] else { return nil }
            return MetricMath.rate(counter: current, previous: old, elapsed: elapsed)
        }
        func cpuShare(_ process: RawProcess) -> Double? { rate(process, \.cpu).map { $0 / 1_000_000_000 / cores * 100 } }
        let processSamples = processes.map { process in
            ProcessSample(key: process.key, name: process.name, path: process.path, parent: process.parent, cpu: cpuShare(process),
                memory: process.memory, read: rate(process, \.read), written: rate(process, \.written))
        }
        let apps = grouped.map { id, members -> AppSample in
            let owner = owners[members[0].key] ?? members[0]
            func sum(_ value: (RawProcess) -> Double?) -> Double? {
                let values = members.compactMap(value)
                return values.count == members.count ? values.reduce(0, +) : nil
            }
            // launchd (1) starts nearly everything, so only a real parent says who opened it.
            let parent = owner.parent > 1 ? byPID[owner.parent] : nil
            return AppSample(id: id, identity: identities[id] ?? ProcessIdentity(path: owner.path, processName: owner.name, bundleName: nil),
                executable: bundle(owner) ?? owner.path,
                members: members.map(\.key), cpu: sum(cpuShare),
                memory: sum { $0.memory.map { Double($0) } }.map { UInt64($0) },
                read: sum { rate($0, \.read) }, written: sum { rate($0, \.written) },
                restricted: members.contains { $0.cpu == nil },
                openedBy: parent.flatMap { identities[groupID(owners[$0.key] ?? $0)]?.displayName })
        }.sorted { ($0.cpu ?? -1) > ($1.cpu ?? -1) }
        let activeBundles = Set(bundles.values.compactMap { $0 })
        names = names.filter { activeBundles.contains($0.key) }
        previous = Dictionary(uniqueKeysWithValues: processes.map { ($0.key, $0) })
        previousCPU = capture.cpu_valid != 0 ? (capture.busy_ticks, capture.total_ticks) : nil
        previousUptime = uptime
        return ActivitySnapshot(date: date, uptime: uptime, cpu: cpu, pressure: MemoryPressure(rawValue: Int(capture.pressure)) ?? .unknown,
            apps: apps, error: capture.error_code == 0 ? nil : "Process list incomplete: \(String(cString: strerror(capture.error_code)))",
            unavailableProcesses: Int(capture.unavailable_processes), processes: processSamples)
    }

    private func bundleName(_ bundle: String) -> String? {
        if let cached = names[bundle] { return cached }
        let metadata = Bundle(path: bundle)
        let name = metadata?.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String
            ?? metadata?.object(forInfoDictionaryKey: "CFBundleName") as? String
        names[bundle] = name
        return name
    }

    public static func bundlePath(_ path: String) -> String? {
        guard let range = path.range(of: ".app/Contents/") else { return nil }
        return String(path[..<range.lowerBound]) + ".app"
    }
}

public enum SampleClock {
    private static let secondsPerTick: Double = {
        var timebase = mach_timebase_info_data_t()
        mach_timebase_info(&timebase)
        return Double(timebase.numer) / Double(timebase.denom) / 1_000_000_000
    }()
    // Unlike awake uptime, this advances through sleep, so old history expires.
    public static var now: Double { Double(mach_continuous_time()) * secondsPerTick }
}
