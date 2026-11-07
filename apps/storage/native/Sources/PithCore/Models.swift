import Foundation

public enum MemoryPressure: Int, Codable, Sendable {
    case unknown = 0, normal = 1, warning = 2, critical = 4
    public var label: String {
        switch self {
        case .unknown: "Unavailable"
        case .normal: "Normal"
        case .warning: "Elevated"
        case .critical: "Critical"
        }
    }
    public var symbol: String {
        switch self {
        case .unknown: "questionmark.circle"
        case .normal: "checkmark.circle"
        case .warning: "exclamationmark.triangle"
        case .critical: "exclamationmark.octagon"
        }
    }
    /// Warning or critical: the states Pith calls out in the menu bar and the panel.
    public var isElevated: Bool {
        switch self {
        case .warning, .critical: true
        case .unknown, .normal: false
        }
    }
}

/// macOS's thermal state, which it reports like memory pressure: no sensor reading, so nothing to calibrate.
public enum ThermalPressure: Int, Codable, Sendable, Comparable {
    case nominal, fair, serious, critical
    public init(_ state: ProcessInfo.ThermalState) {
        switch state {
        case .nominal: self = .nominal
        case .fair: self = .fair
        case .serious: self = .serious
        case .critical: self = .critical
        @unknown default: self = .serious
        }
    }
    public var label: String {
        switch self {
        case .nominal: "Normal"
        case .fair: "Warm"
        case .serious: "Hot"
        case .critical: "Very hot"
        }
    }
    /// Serious and critical: macOS slows the Mac to cool it, so Pith says so.
    public var isThrottling: Bool { self >= .serious }
    public static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }
}

/// Memory as Activity Monitor's Memory pane splits it, in bytes.
public struct MemoryUse: Equatable, Sendable {
    public let physical: UInt64
    /// What apps and the system hold: app memory, wired and compressed.
    public let used: UInt64
    public let app: UInt64
    public let wired: UInt64
    /// Memory macOS compressed to make room, before it has to swap.
    public let compressed: UInt64
    /// Files kept in memory so they open quickly, which macOS gives up when it needs room.
    public let cached: UInt64
    public let swapUsed: UInt64?
    public let swapTotal: UInt64?

    public init(physical: UInt64, used: UInt64, app: UInt64, wired: UInt64, compressed: UInt64, cached: UInt64, swapUsed: UInt64?, swapTotal: UInt64?) {
        self.physical = physical; self.used = used; self.app = app; self.wired = wired; self.compressed = compressed
        self.cached = cached; self.swapUsed = swapUsed; self.swapTotal = swapTotal
    }

    /// From host_statistics64's page counts, as Stats and Activity Monitor count them: used is active, inactive,
    /// speculative, wired and compressed pages, less purgeable and file-backed ones.
    public init(pages: (active: UInt64, inactive: UInt64, speculative: UInt64, wired: UInt64, compressed: UInt64, purgeable: UInt64, external: UInt64),
                pageSize: UInt64, physical: UInt64, swapUsed: UInt64?, swapTotal: UInt64?) {
        let total = pages.active + pages.inactive + pages.speculative + pages.wired + pages.compressed
        let used = total.saturatingSubtract(pages.purgeable + pages.external) * pageSize
        let wired = pages.wired * pageSize, compressed = pages.compressed * pageSize
        self.init(physical: physical, used: min(used, physical), app: used.saturatingSubtract(wired + compressed), wired: wired, compressed: compressed,
                  cached: (pages.external + pages.purgeable) * pageSize, swapUsed: swapUsed, swapTotal: swapTotal)
    }
}

/// One tier of CPU cores, such as Performance or Efficiency, with how busy it is.
public struct CoreTier: Equatable, Sendable {
    /// macOS's own name for the tier (`hw.perflevelN.name`): "Performance", "Efficiency" or "Super".
    public let name: String
    public let cores: Int
    /// Share of the tier's time spent busy, 0 to 100; nil until a second reading.
    public let busy: Double?
    public init(name: String, cores: Int, busy: Double?) { self.name = name; self.cores = cores; self.busy = busy }
}

public struct ProcessKey: Hashable, Sendable, Codable {
    public let pid: Int32
    public let started: UInt64
    public init(pid: Int32, started: UInt64) { self.pid = pid; self.started = started }
    public var id: String { "\(pid):\(started)" }
}

public struct RawProcess: Sendable {
    public let key: ProcessKey
    public let parent: Int32
    public let name: String
    public let path: String
    public let cpu: UInt64?
    public let memory: UInt64?
    public let read: UInt64?
    public let written: UInt64?
    /// Nanojoules used so far.
    public let energy: UInt64?
}

public struct AppSample: Identifiable, Sendable {
    public let id: String
    public let identity: ProcessIdentity
    /// The .app bundle for apps; otherwise the executable, or "" when macOS hides it.
    public let executable: String
    public let members: [ProcessKey]
    public let cpu: Double?
    public let memory: UInt64?
    public let read: Double?
    public let written: Double?
    public let restricted: Bool
    /// The app or process that started this one, e.g. "Riot Client". Nil when launchd did.
    public let openedBy: String?
    /// Estimated power in watts, from the energy macOS counts per process; nil without a reading.
    public let power: Double?
    /// The busiest process's CPU in cores, where 1 is one core fully busy. Share-of-Mac figures hide a process that
    /// pins one core of many, which is what a single-threaded hang looks like.
    public let cores: Double?
    /// What its processes say keeps the Mac or its display awake, such as "Playing video"; empty when nothing does.
    public let keepsAwake: [String]
    public var name: String { identity.displayName }

    public init(id: String, identity: ProcessIdentity, executable: String, members: [ProcessKey], cpu: Double?, memory: UInt64?, read: Double?, written: Double?,
                restricted: Bool, openedBy: String?, power: Double? = nil, cores: Double? = nil, keepsAwake: [String] = []) {
        self.id = id; self.identity = identity; self.executable = executable; self.members = members; self.cpu = cpu; self.memory = memory
        self.read = read; self.written = written; self.restricted = restricted; self.openedBy = openedBy; self.power = power; self.cores = cores
        self.keepsAwake = keepsAwake
    }
}

extension AppSample {
    /// A sample named directly, e.g. in tests; the kind and description still follow `executable`.
    public init(id: String, name: String, executable: String, members: [ProcessKey], cpu: Double?, memory: UInt64?, read: Double?, written: Double?, restricted: Bool, power: Double? = nil, cores: Double? = nil) {
        let derived = ProcessIdentity(path: executable, processName: name, bundleName: name)
        self.init(id: id, identity: ProcessIdentity(kind: derived.kind, displayName: name, secondaryText: derived.secondaryText, description: derived.description),
            executable: executable, members: members, cpu: cpu, memory: memory, read: read, written: written, restricted: restricted, openedBy: nil, power: power, cores: cores)
    }

    /// One of its processes holds most of a core: at least 0.9 of one, as a pegged thread reads.
    public var holdsACore: Bool { (cores ?? 0) >= 0.9 }
}

public struct ActivitySnapshot: Sendable {
    public let date: Date
    public let uptime: Double
    public let cpu: Double?
    public let pressure: MemoryPressure
    public let apps: [AppSample]
    public let error: String?
    public let unavailableProcesses: Int
    public let processes: [ProcessSample]
    public let memory: MemoryUse?
    /// CPU tiers, lowest capability first, as macOS numbers the cores.
    public let tiers: [CoreTier]
    public let thermal: ThermalPressure
    public let lowPowerMode: Bool
    /// Bytes per second received and sent over every interface but loopback.
    public let networkIn: Double?
    public let networkOut: Double?
    /// The GPU's busy share, 0 to 100.
    public let gpu: Double?
    public let battery: BatteryState?
    public init(date: Date, uptime: Double, cpu: Double?, pressure: MemoryPressure, apps: [AppSample], error: String?, unavailableProcesses: Int = 0, processes: [ProcessSample] = [],
                memory: MemoryUse? = nil, tiers: [CoreTier] = [], thermal: ThermalPressure = .nominal, lowPowerMode: Bool = false,
                networkIn: Double? = nil, networkOut: Double? = nil, gpu: Double? = nil, battery: BatteryState? = nil) {
        self.date = date; self.uptime = uptime; self.cpu = cpu; self.pressure = pressure
        self.apps = apps; self.error = error; self.unavailableProcesses = unavailableProcesses; self.processes = processes
        self.memory = memory; self.tiers = tiers; self.thermal = thermal; self.lowPowerMode = lowPowerMode
        self.networkIn = networkIn; self.networkOut = networkOut; self.gpu = gpu; self.battery = battery
    }

    /// CPU the Mac used that no readable app accounts for: macOS's protected processes and the kernel. Nil without
    /// the Mac's own reading.
    public var unattributedCPU: Double? {
        guard let cpu else { return nil }
        return max(0, cpu - apps.compactMap(\.cpu).reduce(0, +))
    }
}

public struct ProcessSample: Identifiable, Sendable {
    public let key: ProcessKey
    /// The kernel's name for the process, which it truncates to 32 bytes.
    public let name: String
    public let path: String
    public let parent: Int32
    public let cpu: Double?
    public let memory: UInt64?
    public let read: Double?
    public let written: Double?
    public let power: Double?
    /// CPU in cores: 1 is one core fully busy.
    public let cores: Double?
    public var id: ProcessKey { key }
    public init(key: ProcessKey, name: String, path: String, parent: Int32, cpu: Double?, memory: UInt64?, read: Double?, written: Double?, power: Double? = nil, cores: Double? = nil) {
        self.key = key; self.name = name; self.path = path; self.parent = parent; self.cpu = cpu; self.memory = memory
        self.read = read; self.written = written; self.power = power; self.cores = cores
    }
    /// The full executable name when macOS reveals the path, otherwise the kernel's name.
    public var displayName: String { path.isEmpty ? name : URL(fileURLWithPath: path).lastPathComponent }
}

public struct ActivityPoint: Sendable {
    public let date: Date
    public let uptime: Double
    public let cpu: Double?
    public let pressure: MemoryPressure
    /// Memory in use and swap, for the memory chart and the panel's growth figures.
    public let memory: MemoryUse?
    public let thermal: ThermalPressure
    public init(date: Date, uptime: Double, cpu: Double?, pressure: MemoryPressure, memory: MemoryUse? = nil, thermal: ThermalPressure = .nominal) {
        self.date = date; self.uptime = uptime; self.cpu = cpu; self.pressure = pressure; self.memory = memory; self.thermal = thermal
    }
}

public struct AppPoint: Sendable {
    public let date: Date
    public let uptime: Double
    public let cpu: Double?
    public let memory: UInt64?
    public let read: Double?
    public let written: Double?
    public let power: Double?
    public let members: [ProcessKey]
}

public struct AppTimeline: Identifiable, Sendable {
    public let id: String
    public var latest: AppSample
    public var points: [AppPoint]
    public var isRunning: Bool
}

public struct SessionHistory: Sendable {
    // The approved product requirement is a ten-minute retrospective.
    public static let retention: TimeInterval = 10 * 60
    public private(set) var system: [ActivityPoint] = []
    public private(set) var apps: [String: AppTimeline] = [:]
    public init() {}
    public mutating func append(_ snapshot: ActivitySnapshot) {
        let cutoff = snapshot.uptime - Self.retention
        system.removeAll { $0.uptime < cutoff }
        system.append(ActivityPoint(date: snapshot.date, uptime: snapshot.uptime, cpu: snapshot.cpu, pressure: snapshot.pressure, memory: snapshot.memory, thermal: snapshot.thermal))
        for id in Array(apps.keys) {
            apps[id]?.isRunning = false
            apps[id]?.points.removeAll { $0.uptime < cutoff }
            if apps[id]?.points.isEmpty == true { apps.removeValue(forKey: id) }
        }
        for app in snapshot.apps {
            let point = AppPoint(date: snapshot.date, uptime: snapshot.uptime, cpu: app.cpu, memory: app.memory, read: app.read, written: app.written, power: app.power, members: app.members)
            if apps[app.id] != nil {
                apps[app.id]?.latest = app
                apps[app.id]?.isRunning = true
                apps[app.id]?.points.append(point)
            } else {
                apps[app.id] = AppTimeline(id: app.id, latest: app, points: [point], isRunning: true)
            }
        }
    }
}
