import AppKit
import PithCore
import ServiceManagement
import SwiftUI

enum SettingsPane: String, CaseIterable {
    case general, monitoring, connections
}

struct SettingsView: View {
    @Bindable var model: ActivityModel
    let alerts: AlertSettings
    @Bindable var disk: DiskModel
    var shortcut: PanelShortcut?
    let updates: Updates
    @State var pane = SettingsPane.general
    @State var diagnosticsExpanded = false

    var body: some View {
        // A steady window size fits short displays; longer forms scroll within their pane.
        TabView(selection: $pane) {
            form { general }.tabItem { Label("General", systemImage: "gearshape") }.tag(SettingsPane.general)
            form { monitoring }.tabItem { Label("Monitoring", systemImage: "waveform.path.ecg") }.tag(SettingsPane.monitoring)
            form { ConnectionSettings(binary: disk.binary) }.tabItem { Label("Connections", systemImage: "link") }.tag(SettingsPane.connections)
        }
        .padding(.top, 8)
        .frame(width: 480, height: 560)
        .background(BruhsColor.canvas)
        .tint(BruhsColor.accent)
    }

    private func form<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        Form { content() }
            .formStyle(.grouped)
            .scrollContentBackground(.hidden)
            .bruhsScrollers(inset: 6)
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
            Button("Open Login Items") { openSystemSettings(.loginItems) }
        }
        if updates.isAvailable {
            Section {
                Toggle("Check for updates automatically", isOn: Binding(get: { updates.checksAutomatically }, set: { updates.setChecksAutomatically($0) }))
                Toggle("Download and install updates automatically",
                       isOn: Binding(get: { updates.downloadsAutomatically }, set: { updates.setDownloadsAutomatically($0) }))
                    .disabled(!updates.checksAutomatically)
                LabeledContent("Version", value: updates.version)
            } header: {
                Text("Updates")
            } footer: {
                Text("Checks GitHub daily. No system information is sent.")
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        } else {
            // A build made on this Mac has no updater, so the section says why rather than going missing.
            Section("Updates") {
                LabeledContent("Version", value: updates.version)
                Text("Automatic updates are unavailable in this local build.")
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        Section("Privacy") {
            Text(updates.isAvailable
                 ? "Activity and disk maps stay on this Mac. Network access is limited to updates. Connected assistants can receive storage metadata."
                 : "Activity and disk maps stay on this Mac. Pith makes no network connections. Connected assistants can receive storage metadata.")
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
                 ? "Saved on this Mac. Turning this off clears saved history."
                 : "Session history clears when you quit.")
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .help("CPU, memory and the busiest apps are saved every 30 seconds for up to 7 days.")
        }
        Section {
            ForEach(AlertKind.allCases) { kind in
                Toggle(kind.title, isOn: Binding(get: { alerts.isOn(kind) }, set: { alerts.set(kind, $0) }))
            }
            if alerts.authorization == .denied, !alerts.enabled.isEmpty {
                Text("Notifications are off for Pith, so these alerts can't show.").foregroundStyle(.secondary)
                Button("Open Notifications Settings") { openSystemSettings(.notifications) }
            }
        } header: {
            Text("Alerts")
        } footer: {
            Text("For sustained problems. Each alert repeats at most every 30 minutes.")
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        Section {
            Toggle("Keep the disk map between launches", isOn: $disk.remembersScans)
            if disk.remembersScans { Button("Forget the Map") { disk.forgetScans() } }
        } header: {
            Text("Disk")
        } footer: {
            Text("Keeps folder names, sizes and growth since yesterday on this Mac. File contents are never saved.")
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .help("Reopens the saved startup disk map and catches up on changes. Once a day, on power, Pith checks every folder for changes macOS didn’t report.")
        }
        Section("Diagnostics") {
            DisclosureGroup("Pith resource usage", isExpanded: $diagnosticsExpanded) {
                if let own = PanelSummary.own(model.snapshot?.apps ?? [], pid: ProcessInfo.processInfo.processIdentifier) {
                    LabeledContent("CPU", value: own.cpu.map { percent($0) } ?? "Unavailable")
                    LabeledContent("Memory footprint", value: own.memory.map(memorySize) ?? "Unavailable")
                    Text("Includes Pith and its helper processes.").foregroundStyle(.secondary)
                    if model.paused { Text("Monitoring paused").foregroundStyle(.secondary) }
                } else {
                    Text("No reading yet").foregroundStyle(.secondary)
                }
            }
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
