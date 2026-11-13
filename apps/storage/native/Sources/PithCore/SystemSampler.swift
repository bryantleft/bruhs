import Foundation
import PithSystem

public actor SystemSampler {
    private var previous: [ProcessKey: RawProcess] = [:]
    private var previousCPU: (busy: UInt64, total: UInt64)?
    /// Each logical CPU's busy and total ticks at the last reading, for the tiers.
    private var previousCores: [(busy: UInt64, total: UInt64)] = []
    private var previousNetwork: (in: UInt64, out: UInt64)?
    private var previousUptime: Double?
    /// The Mac's CPU tiers, lowest capability first, read once: they don't change while it runs.
    private let tierLayout = SystemSampler.readTierLayout()
    /// Info.plist display names by bundle path; nil when the bundle doesn't name itself.
    private var names: [String: String?] = [:]
    /// Enclosing .app bundles and identities by executable path. Both depend only on the path, so they're worked
    /// out when a path first appears rather than for every process every sample; each keeps the paths running now.
    private var bundles: [String: String?] = [:]
    private var identities: [IdentityKey: ProcessIdentity] = [:]
    private struct IdentityKey: Hashable { let path: String; let name: String; let bundleName: String? }
    public init() {}

    /// Whether macOS's private network statistics answered, so apps carry network figures. Started once, on first use.
    public static let countsNetwork: Bool = pith_net_start() == 1
    /// How long a sample waits for fresh network counts. Answers took 5 ms typically and under 8 ms in 40 readings
    /// on an M2 Max; this leaves room for a far busier Mac and stays a quarter of the second between samples while someone
    /// is looking.
    private static let networkWait: Int64 = 250_000_000

    public func reset() {
        previous = [:]; previousCPU = nil; previousCores = []; previousNetwork = nil; previousUptime = nil
    }

    /// `hw.perflevelN`: level 0 is the highest-capability tier. macOS numbers logical CPUs from the lowest tier up
    /// (checked on an M2 Max: background work runs on CPUs 0 to 3, its four efficiency cores), so the layout is reversed.
    static func readTierLayout() -> [(name: String, cores: Int)] {
        func int(_ name: String) -> Int? {
            var value: Int32 = 0
            var size = MemoryLayout<Int32>.size
            return sysctlbyname(name, &value, &size, nil, 0) == 0 ? Int(value) : nil
        }
        func string(_ name: String) -> String? {
            var size = 0
            guard sysctlbyname(name, nil, &size, nil, 0) == 0, size > 0 else { return nil }
            var bytes = [CChar](repeating: 0, count: size)
            guard sysctlbyname(name, &bytes, &size, nil, 0) == 0 else { return nil }
            return String(decoding: bytes.prefix { $0 != 0 }.map { UInt8(bitPattern: $0) }, as: UTF8.self)
        }
        guard let levels = int("hw.nperflevels"), levels > 1 else { return [] }
        let tiers = (0..<levels).compactMap { level -> (String, Int)? in
            guard let cores = int("hw.perflevel\(level).logicalcpu") else { return nil }
            return (string("hw.perflevel\(level).name") ?? "Tier \(level + 1)", cores)
        }
        return tiers.count == levels ? tiers.reversed() : []
    }

    /// Busy share of each tier between two readings of every CPU's ticks.
    static func tiers(_ layout: [(name: String, cores: Int)], current: [(busy: UInt64, total: UInt64)], previous: [(busy: UInt64, total: UInt64)]) -> [CoreTier] {
        guard layout.reduce(0, { $0 + $1.cores }) == current.count else { return [] }
        var start = 0
        return layout.map { tier in
            let range = start..<(start + tier.cores)
            start += tier.cores
            guard previous.count == current.count else { return CoreTier(name: tier.name, cores: tier.cores, busy: nil) }
            let busy = range.reduce(UInt64(0)) { $0 + current[$1].busy.saturatingSubtract(previous[$1].busy) }
            let total = range.reduce(UInt64(0)) { $0 + current[$1].total.saturatingSubtract(previous[$1].total) }
            return CoreTier(name: tier.name, cores: tier.cores, busy: total > 0 ? Double(busy) / Double(total) * 100 : nil)
        }
    }

    public func sample() -> ActivitySnapshot {
        let capture = pith_read()
        defer { pith_free(capture) }
        let uptime = SampleClock.now
        let date = Date()
        // Network bytes come by PID from a separate count, which starts once and may not be available at all.
        var traffic: [Int32: UInt64] = [:]
        if Self.countsNetwork {
            // Room for every process: macOS caps them at kern.maxproc, 8,000 on the Macs Pith was checked on.
            var totals = [pith_net_total](repeating: pith_net_total(), count: 8192)
            let count = Int(pith_net_totals(&totals, Int32(totals.count), Self.networkWait))
            for total in totals.prefix(max(0, count)) { traffic[total.pid] = total.received &+ total.sent }
        }
        var processes: [RawProcess] = []
        if let pointer = capture.processes {
            processes.reserveCapacity(Int(capture.count))
            for p in UnsafeBufferPointer(start: pointer, count: Int(capture.count)) {
                let path = withUnsafeBytes(of: p.path) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
                let name = withUnsafeBytes(of: p.name) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
                processes.append(RawProcess(key: ProcessKey(pid: p.pid, started: p.started_us), parent: p.parent_pid, name: name, path: path,
                    cpu: p.readable != 0 ? p.cpu_ns : nil, memory: p.readable != 0 ? p.footprint : nil,
                    read: p.readable != 0 ? p.read_bytes : nil, written: p.readable != 0 ? p.written_bytes : nil,
                    energy: p.energy_valid != 0 ? p.energy_nj : nil, network: Self.countsNetwork ? traffic[p.pid] ?? 0 : nil))
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
        func coresUsed(_ process: RawProcess) -> Double? { rate(process, \.cpu).map { $0 / 1_000_000_000 } }
        // Nanojoules per second over a reading: watts once divided by 10^9. A first reading or a counter that ran
        // backwards gives no figure rather than a spike.
        func watts(_ process: RawProcess) -> Double? { rate(process, \.energy).map { $0 / 1_000_000_000 } }
        let processSamples = processes.map { process in
            ProcessSample(key: process.key, name: process.name, path: process.path, parent: process.parent, cpu: cpuShare(process),
                memory: process.memory, read: rate(process, \.read), written: rate(process, \.written), power: watts(process), cores: coresUsed(process),
                network: rate(process, \.network))
        }
        let awake = PowerAndGPU.sleepAssertions()
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
                openedBy: parent.flatMap { identities[groupID(owners[$0.key] ?? $0)]?.displayName },
                power: sum(watts), cores: members.compactMap(coresUsed).max(), keepsAwake: members.flatMap { awake[$0.key.pid] ?? [] },
                network: sum { rate($0, \.network) })
        }.sorted { ($0.cpu ?? -1) > ($1.cpu ?? -1) }
        let activeBundles = Set(bundles.values.compactMap { $0 })
        names = names.filter { activeBundles.contains($0.key) }
        let coreTicks = capture.coreTicks
        let tiers = Self.tiers(tierLayout, current: coreTicks, previous: previousCores)
        let memory = capture.memoryUse
        let network: (in: UInt64, out: UInt64)? = capture.network_valid != 0 ? (capture.network_in, capture.network_out) : nil
        let networkRates = network.flatMap { now in previousNetwork.flatMap { old in elapsed.map { elapsed in
            (MetricMath.rate(counter: now.in, previous: old.in, elapsed: elapsed), MetricMath.rate(counter: now.out, previous: old.out, elapsed: elapsed)) } } }
        previous = Dictionary(uniqueKeysWithValues: processes.map { ($0.key, $0) })
        previousCPU = capture.cpu_valid != 0 ? (capture.busy_ticks, capture.total_ticks) : nil
        previousCores = coreTicks
        previousNetwork = network
        previousUptime = uptime
        let info = ProcessInfo.processInfo
        return ActivitySnapshot(date: date, uptime: uptime, cpu: cpu, pressure: MemoryPressure(rawValue: Int(capture.pressure)) ?? .unknown,
            apps: apps, error: capture.error_code == 0 ? nil : "Process list incomplete: \(String(cString: strerror(capture.error_code)))",
            unavailableProcesses: Int(capture.unavailable_processes), processes: processSamples,
            memory: memory, tiers: tiers, thermal: ThermalPressure(info.thermalState), lowPowerMode: info.isLowPowerModeEnabled,
            networkIn: networkRates?.0, networkOut: networkRates?.1, gpu: PowerAndGPU.gpuUtilization(), battery: PowerAndGPU.battery())
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
