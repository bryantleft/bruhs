import AppKit
import Observation
import PithCore
import UserNotifications

/// The conditions Pith can alert about. Each is off until the user turns it on: routine spikes never alert.
enum AlertKind: String, CaseIterable, Identifiable {
    case memory, thermal, disk, core
    var id: Self { self }

    var title: String {
        switch self {
        case .memory: "Memory pressure stays elevated"
        case .thermal: "The Mac slows down to cool"
        case .disk: "The startup disk is nearly full"
        case .core: "An app keeps a core busy for 5 minutes"
        }
    }

    /// How long the condition must last before it alerts. A minute filters pressure and thermal blips; five minutes
    /// separates a stuck process from a build or an export doing its work.
    var sustain: TimeInterval {
        switch self {
        case .memory, .thermal: 60
        case .disk: 0
        case .core: 300
        }
    }

    /// The wait before the same alert can come again: half an hour for usage, a day for a disk that stays full.
    var cooldown: TimeInterval { self == .disk ? 86400 : 1800 }
}

/// Which alerts are on, kept in user defaults.
@MainActor @Observable final class AlertSettings {
    private(set) var enabled: Set<AlertKind>
    /// macOS's answer when Pith asked to post notifications; nil until it asks.
    private(set) var authorization: UNAuthorizationStatus?

    init() {
        enabled = Set((UserDefaults.standard.stringArray(forKey: "alerts") ?? []).compactMap(AlertKind.init(rawValue:)))
    }

    func isOn(_ kind: AlertKind) -> Bool { enabled.contains(kind) }

    func set(_ kind: AlertKind, _ on: Bool) {
        if on { enabled.insert(kind) } else { enabled.remove(kind) }
        UserDefaults.standard.set(enabled.map(\.rawValue).sorted(), forKey: "alerts")
        if on { requestAuthorization() }
    }

    func refreshAuthorization() {
        guard AlertMonitor.canNotify else { return }
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let status = settings.authorizationStatus
            Task { @MainActor in self.authorization = status }
        }
    }

    private func requestAuthorization() {
        guard AlertMonitor.canNotify else { return }
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in
            Task { @MainActor in self.refreshAuthorization() }
        }
    }
}

/// Watches each sample for the conditions the user asked about, and posts one notification per condition, naming the
/// app behind it, once it has lasted long enough. Quit and Open Activity act on that app from the notification.
@MainActor final class AlertMonitor: NSObject, UNUserNotificationCenterDelegate {
    static let category = "app.bruhs.pith.alert"
    static let quitAction = "quit"
    static let openAction = "open"
    /// `swift run` has no bundle, and UNUserNotificationCenter needs one.
    nonisolated static var canNotify: Bool { Bundle.main.bundleIdentifier != nil && Bundle.main.bundleURL.pathExtension == "app" }

    let settings: AlertSettings
    private let activity: ActivityModel
    private let open: (String?) -> Void
    private var since: [AlertKind: Date] = [:]
    private var lastPosted: [AlertKind: Date] = [:]

    init(settings: AlertSettings, activity: ActivityModel, open: @escaping (String?) -> Void) {
        self.settings = settings
        self.activity = activity
        self.open = open
        super.init()
        guard Self.canNotify else { return }
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        center.setNotificationCategories([UNNotificationCategory(identifier: Self.category, actions: [
            UNNotificationAction(identifier: Self.quitAction, title: "Quit", options: [.destructive]),
            UNNotificationAction(identifier: Self.openAction, title: "Open Activity", options: [.foreground]),
        ], intentIdentifiers: [])])
        settings.refreshAuthorization()
    }

    /// Checks one sample. Called after the sample joins the history, so growth and culprits include it.
    func check(_ snapshot: ActivitySnapshot) {
        guard !settings.enabled.isEmpty else { since = [:]; return }
        for kind in AlertKind.allCases where settings.isOn(kind) {
            guard let finding = finding(kind, snapshot) else { since[kind] = nil; continue }
            let start = since[kind] ?? snapshot.date
            since[kind] = start
            guard snapshot.date.timeIntervalSince(start) >= kind.sustain,
                  lastPosted[kind].map({ snapshot.date.timeIntervalSince($0) >= kind.cooldown }) ?? true else { continue }
            lastPosted[kind] = snapshot.date
            post(kind, finding)
        }
    }

    /// What's wrong now and who's behind it, or nil while the condition doesn't hold.
    private func finding(_ kind: AlertKind, _ snapshot: ActivitySnapshot) -> (title: String, body: String, app: AppSample?)? {
        let own = ProcessInfo.processInfo.processIdentifier
        switch kind {
        case .memory:
            guard snapshot.pressure.isElevated else { return nil }
            let window = activity.window ?? (snapshot.uptime - SessionHistory.retention)...snapshot.uptime
            let culprit = PanelSummary.memoryCulprit(snapshot, history: activity.history, window: window, ownPID: own)
            let who = culprit.map { culprit in culprit.growth.map { "\(culprit.app.name) grew \(memorySize(UInt64(max(0, $0)))) in the last 10 minutes." }
                ?? "\(culprit.app.name) uses the most, \(culprit.app.memory.map(memorySize) ?? "")." } ?? ""
            return ("Memory pressure is \(snapshot.pressure.label.lowercased())", "The Mac is running short of memory. \(who)", culprit?.app)
        case .thermal:
            guard snapshot.thermal.isThrottling else { return nil }
            let busiest = snapshot.apps.filter { !$0.members.contains { $0.pid == own } }.max { ($0.cpu ?? 0) < ($1.cpu ?? 0) }
            let who = busiest.flatMap { app in app.cpu.map { "\(app.name) is the busiest, at \(percent($0)) CPU." } } ?? ""
            return ("Your Mac is \(snapshot.thermal.label.lowercased())", "macOS is slowing it down to cool it. \(who)", busiest)
        case .disk:
            guard let free = activity.availableDisk, let total = activity.totalDisk, ActivityModel.isLowOnSpace(free: free, total: total) else { return nil }
            return ("The startup disk is nearly full", "\(bytes(UInt64(max(0, free)))) is free. Open Disk to see what takes the space.", nil)
        case .core:
            guard let app = snapshot.apps.filter({ $0.holdsACore && $0.identity.kind != .system && !$0.members.contains { $0.pid == own } }).max(by: { ($0.cores ?? 0) < ($1.cores ?? 0) }) else { return nil }
            return ("\(app.name) has kept a core busy for 5 minutes", "One of its processes is using a whole core. If you didn't expect that, it may be stuck.", app)
        }
    }

    private func post(_ kind: AlertKind, _ finding: (title: String, body: String, app: AppSample?)) {
        guard Self.canNotify else { return }
        let content = UNMutableNotificationContent()
        content.title = finding.title
        content.body = finding.body
        content.categoryIdentifier = Self.category
        if let app = finding.app, ProcessControl.refusal(kind: app.identity.kind, members: app.members, isRunning: true) == nil {
            content.userInfo = ["app": app.id]
        }
        let request = UNNotificationRequest(identifier: "\(kind.rawValue)-\(Date().timeIntervalSince1970)", content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request) { error in
            if let error { NSLog("Pith: couldn't post the \(kind.rawValue) alert: \(error.localizedDescription)") }
        }
    }

    // MARK: UNUserNotificationCenterDelegate

    /// Shown even while a Pith window is in front: an alert the user turned on is always worth seeing.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let appID = response.notification.request.content.userInfo["app"] as? String
        let action = response.actionIdentifier
        await MainActor.run {
            if action == Self.quitAction, let appID, let app = activity.history.apps[appID], app.isRunning {
                // A notification's Quit is the polite one; Force Quit stays in Activity, behind its confirmation.
                _ = ProcessControl.quit(QuitRequest(appID: appID, name: app.latest.name, kind: app.latest.identity.kind, members: app.latest.members))
            } else {
                open(appID)
            }
        }
    }
}
