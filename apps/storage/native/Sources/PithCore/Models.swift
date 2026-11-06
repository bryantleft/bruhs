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
    public var name: String { identity.displayName }
}

extension AppSample {
    /// A sample named directly, e.g. in tests; the kind and description still follow `executable`.
    public init(id: String, name: String, executable: String, members: [ProcessKey], cpu: Double?, memory: UInt64?, read: Double?, written: Double?, restricted: Bool) {
        let derived = ProcessIdentity(path: executable, processName: name, bundleName: name)
        self.init(id: id, identity: ProcessIdentity(kind: derived.kind, displayName: name, secondaryText: derived.secondaryText, description: derived.description),
            executable: executable, members: members, cpu: cpu, memory: memory, read: read, written: written, restricted: restricted, openedBy: nil)
    }
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
    public init(date: Date, uptime: Double, cpu: Double?, pressure: MemoryPressure, apps: [AppSample], error: String?, unavailableProcesses: Int = 0, processes: [ProcessSample] = []) {
        self.date = date; self.uptime = uptime; self.cpu = cpu; self.pressure = pressure
        self.apps = apps; self.error = error; self.unavailableProcesses = unavailableProcesses; self.processes = processes
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
    public var id: ProcessKey { key }
    /// The full executable name when macOS reveals the path, otherwise the kernel's name.
    public var displayName: String { path.isEmpty ? name : URL(fileURLWithPath: path).lastPathComponent }
}

public struct ActivityPoint: Sendable {
    public let date: Date
    public let uptime: Double
    public let cpu: Double?
    public let pressure: MemoryPressure
}

public struct AppPoint: Sendable {
    public let date: Date
    public let uptime: Double
    public let cpu: Double?
    public let memory: UInt64?
    public let read: Double?
    public let written: Double?
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
        system.append(ActivityPoint(date: snapshot.date, uptime: snapshot.uptime, cpu: snapshot.cpu, pressure: snapshot.pressure))
        for id in Array(apps.keys) {
            apps[id]?.isRunning = false
            apps[id]?.points.removeAll { $0.uptime < cutoff }
            if apps[id]?.points.isEmpty == true { apps.removeValue(forKey: id) }
        }
        for app in snapshot.apps {
            let point = AppPoint(date: snapshot.date, uptime: snapshot.uptime, cpu: app.cpu, memory: app.memory, read: app.read, written: app.written, members: app.members)
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
