import AppKit
import ServiceManagement
import SwiftUI

struct SettingsView: View {
    @Bindable var model: ActivityModel
    let alerts: AlertSettings
    @Bindable var disk: DiskModel
    var shortcut: PanelShortcut?
    let updates: Updates

    var body: some View {
        // Two panes, so each fits a 13-inch display without scrolling.
        TabView {
            form { general }.tabItem { Label("General", systemImage: "gearshape") }
            form { monitoring }.tabItem { Label("Monitoring", systemImage: "waveform.path.ecg") }
        }
        .padding(.top, 8)
        .frame(width: 480)
        .fixedSize(horizontal: false, vertical: true)
        .background(BruhsColor.canvas)
        .tint(BruhsColor.accent)
    }

    private func form<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        Form { content() }
            .formStyle(.grouped)
            .scrollContentBackground(.hidden)
            .scrollDisabled(true)
            .fixedSize(horizontal: false, vertical: true)
    }

    @ViewBuilder private var general: some View {
        Section {
            Picker("Show", selection: $model.menuBarShows) {
                ForEach(MenuBarMetric.allCases) { Text($0.title).tag($0) }
            }
            .disabled(model.iconOnly)
            Toggle("Show icon only", isOn: $model.iconOnly)
            if let shortcut {
                Toggle("Open the panel with \(PanelShortcut.display)", isOn: Binding(get: { shortcut.enabled }, set: { shortcut.enabled = $0 }))
                if let problem = shortcut.problem { Text(problem).foregroundStyle(.secondary) }
            }
        } header: {
            Text("Menu bar")
        } footer: {
            Text("High memory pressure still shows next to the icon.").foregroundStyle(.secondary)
        }
        Section("Startup") {
            LaunchAtLoginToggle()
            Button("Open Login Items") { SMAppService.openSystemSettingsLoginItems() }
        }
        // A build for this Mac only has no updater.
        if updates.isAvailable {
            Section {
                Toggle("Check for updates automatically", isOn: Binding(get: { updates.checksAutomatically }, set: { updates.setChecksAutomatically($0) }))
                Toggle("Download and install updates automatically",
                       isOn: Binding(get: { updates.downloadsAutomatically }, set: { updates.setDownloadsAutomatically($0) }))
                    .disabled(!updates.checksAutomatically)
            } header: {
                Text("Updates")
            } footer: {
                Text("Once a day, Pith asks GitHub, where its releases are published, whether a newer version is out. It sends nothing about this Mac. This is version \(updates.version).")
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        Section("Privacy") {
            Text(updates.isAvailable
                 ? "Activity stays on this Mac. Pith goes online only to check for updates, when you allow it. Disk scans run only when you request them."
                 : "Activity stays on this Mac, and Pith makes no network connections. Disk scans run only when you request them.")
                .fixedSize(horizontal: false, vertical: true)
            Button("Full Disk Access…") { openDiskAccess() }
        }
    }

    @ViewBuilder private var monitoring: some View {
        Section {
            Toggle("Keep a week of history", isOn: $model.keepsHistory)
            if model.keepsHistory {
                Button("Clear History") { model.clearHistory() }
            }
        } header: {
            Text("History")
        } footer: {
            Text(model.keepsHistory
                 ? "Pith saves CPU, memory and the busiest apps every 30 seconds, on this Mac only, and keeps them for 7 days. Activity can then look back hours and days."
                 : "Off: history covers the running session and clears when you quit.")
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        Section {
            ForEach(AlertKind.allCases) { kind in
                Toggle(kind.title, isOn: Binding(get: { alerts.isOn(kind) }, set: { alerts.set(kind, $0) }))
            }
            if alerts.authorization == .denied, !alerts.enabled.isEmpty {
                Text("Notifications are off for Pith, so these alerts can't show.").foregroundStyle(.secondary)
                Button("Open Notifications Settings") {
                    if let url = URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension") { NSWorkspace.shared.open(url) }
                }
            }
        } header: {
            Text("Alerts")
        } footer: {
            Text("Only for problems that last. Each alert names the app behind it, and waits half an hour before it can come again.")
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        Section {
            Toggle("Remember scans to show what grew", isOn: $disk.remembersScans)
            if disk.remembersScans { Button("Forget Scans") { disk.forgetScans() } }
        } header: {
            Text("Disk")
        } footer: {
            Text("Pith keeps each scan's map on this Mac, never what's in the files, so it can open on the last map and show what changed and grew since.")
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Launch at login, off until the user turns it on, with what to do when macOS wants approval.
struct LaunchAtLoginToggle: View {
    @State private var login = SMAppService.mainApp.status == .enabled
    @State private var loginError: String?

    var body: some View {
        Toggle("Launch Pith at login", isOn: launchAtLogin)
        if let loginError { Text(loginError).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
    }

    /// Registers in the setter rather than in onChange, so restoring the toggle after a failure doesn't run the
    /// opposite action and replace the error.
    private var launchAtLogin: Binding<Bool> {
        Binding(get: { login }, set: { enabled in
            do {
                if enabled { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
                login = enabled
                loginError = SMAppService.mainApp.status == .requiresApproval ? "Approve Pith in System Settings, under General, in Login Items & Extensions." : nil
            } catch {
                login = SMAppService.mainApp.status == .enabled
                loginError = error.localizedDescription
            }
        })
    }
}

func openDiskAccess() {
    if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles") { NSWorkspace.shared.open(url) }
}

/// System Settings' Menu Bar pane, where macOS 26 lets each app's menu bar item be turned off.
func openMenuBarSettings() {
    if let url = URL(string: "x-apple.systempreferences:com.apple.ControlCenter-Settings.extension") { NSWorkspace.shared.open(url) }
}
