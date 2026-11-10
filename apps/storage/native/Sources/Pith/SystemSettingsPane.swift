import AppKit
import ServiceManagement

/// The panes of System Settings Pith opens, each the way macOS documents for it. Every one goes through
/// `openSystemSettings`, which lint-native.mjs holds to, so the smoke test, recording each pane asked for instead,
/// never opens System Settings.
enum SystemSettingsPane: Equatable {
    /// Privacy & Security, Full Disk Access, where the person can let Pith read every folder.
    case fullDiskAccess
    /// Notifications, where Pith's alerts are allowed or not.
    case notifications
    /// Menu Bar, where macOS 26 lets each app's menu bar item be turned off.
    case menuBar
    /// General, Login Items & Extensions, where launching Pith at login is approved.
    case loginItems

    /// The URL that opens it, or nil for Login Items, which ServiceManagement opens.
    var url: URL? {
        switch self {
        case .fullDiskAccess: URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")
        case .notifications: URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension")
        case .menuBar: URL(string: "x-apple.systempreferences:com.apple.ControlCenter-Settings.extension")
        case .loginItems: nil
        }
    }

    /// Opens System Settings at it.
    @MainActor func open() {
        guard let url else { SMAppService.openSystemSettingsLoginItems(); return }
        NSWorkspace.shared.open(url)
    }
}

/// Opens a pane of System Settings. The smoke test records each pane asked for instead.
@MainActor var openSystemSettings: (SystemSettingsPane) -> Void = { $0.open() }

/// Opens Full Disk Access in System Settings: Settings' and Disk's notices' Full Disk Access… buttons, and a click on a
/// place the disk map's Places can't read.
@MainActor func openDiskAccess() { openSystemSettings(.fullDiskAccess) }

/// Opens System Settings' Menu Bar pane, which the welcome window points to.
@MainActor func openMenuBarSettings() { openSystemSettings(.menuBar) }
