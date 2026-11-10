import Foundation

/// How this run of Pith began. A run a script starts and checks, with `--smoke-test`, `--activity` or `--scan`, leaves
/// the person's persisted state as it found it: it reads none of their settings and writes none, and keeps its Activity
/// history and its scans in memory or in folders of its own, never in theirs.
enum Launch {
    static let isAutomated = CommandLine.arguments.contains { ["--activity", "--scan", "--smoke-test"].contains($0) }

    /// Gives an automated run its settings in memory, before anything reads one: each at the value `Setting` gives an
    /// automated run, in the volatile argument domain. Reads look there before the person's own defaults, and it's never
    /// saved.
    static func keepSettingsInMemory() {
        guard isAutomated else { return }
        let defaults = UserDefaults.standard
        var arguments = defaults.volatileDomain(forName: UserDefaults.argumentDomain)
        for setting in Setting.allCases { arguments[setting.rawValue] = setting.automatedValue }
        defaults.setVolatileDomain(arguments, forName: UserDefaults.argumentDomain)
    }
}

/// Pith's settings, each kept in the person's defaults under its own name.
enum Setting: String, CaseIterable {
    case iconOnly, menuBarShows, keepsHistory, alerts, remembersScans, panelShortcut, textScale, inspectorWidth, welcomeSeen

    /// Its value in an automated run, whatever the person chose: Pith's default, but for Activity's history, which an
    /// automated run keeps, in memory only.
    var automatedValue: Any {
        switch self {
        case .iconOnly, .panelShortcut: false
        case .keepsHistory, .remembersScans, .welcomeSeen: true
        case .menuBarShows: MenuBarMetric.cpu.rawValue
        case .alerts: [String]()
        case .textScale: 1.0
        case .inspectorWidth: 300.0
        }
    }
}

extension UserDefaults {
    /// Keeps `value` for `setting`: in the person's defaults, or in an automated run in memory, where reading the
    /// setting still finds it, so the run changes nothing the person chose.
    func set(_ value: Any, for setting: Setting) {
        guard Launch.isAutomated else { set(value, forKey: setting.rawValue); return }
        var arguments = volatileDomain(forName: UserDefaults.argumentDomain)
        arguments[setting.rawValue] = value
        setVolatileDomain(arguments, forName: UserDefaults.argumentDomain)
    }
}
