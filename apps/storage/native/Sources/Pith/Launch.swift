import Foundation

/// How this run of Pith began. A run a script starts and checks, with `--smoke-test`, `--activity` or `--scan`, leaves
/// the person's persisted state as it found it: it reads none of their settings and writes none, keeps its Activity
/// history and its scans in memory or in folders of its own, never in theirs, and moves nothing into their Trash
/// (`DiskModel.trashFolder`).
enum Launch {
    static let isAutomated = CommandLine.arguments.contains { ["--activity", "--scan", "--smoke-test"].contains($0) }

    /// Gives an automated run its settings in memory, before anything reads one: each at the value `Setting` gives an
    /// automated run (`automatedValue`), Pith's default for all but two, in the volatile argument domain. Reads look
    /// there before the person's own defaults, and it's never saved.
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
    /// The disk map's click hints the person has learned, by name (`MapHints`).
    case learnedMapHints
    /// Whether Pith had Full Disk Access at the last probe that could tell, and when it found it lost, in seconds since
    /// 1970, 0 for never, so a loss is found across launches and lasts through them (`DiskAccessWatch`).
    case hadFullDiskAccess, fullDiskAccessLostAt

    /// Its value in an automated run, whatever the person chose: Pith's default, but for two. Keep a week of history is
    /// on, off by default, so the run keeps Activity's history, in memory only, and the welcome window counts as seen,
    /// unseen by default, so the run never shows it.
    var automatedValue: Any {
        switch self {
        case .iconOnly, .panelShortcut, .hadFullDiskAccess: false
        case .keepsHistory, .remembersScans, .welcomeSeen: true
        case .menuBarShows: MenuBarMetric.cpu.rawValue
        case .alerts, .learnedMapHints: [String]()
        case .textScale: 1.0
        case .inspectorWidth: 300.0
        case .fullDiskAccessLostAt: 0.0
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
