import AppKit
import ServiceManagement
import SwiftUI

struct SettingsView: View {
    @Bindable var model: ActivityModel
    @State private var login = SMAppService.mainApp.status == .enabled
    @State private var loginError: String?
    var body: some View {
        Form {
            Section {
                Toggle("Show icon only", isOn: $model.iconOnly)
            } header: {
                Text("Menu bar")
            } footer: {
                Text("High memory pressure still shows next to the icon.").foregroundStyle(.secondary)
            }
            Section("Startup") {
                Toggle("Launch Pith at login", isOn: launchAtLogin)
                if let loginError { Text(loginError).foregroundStyle(.secondary) }
                Button("Open Login Items") { SMAppService.openSystemSettingsLoginItems() }
            }
            Section("Privacy") {
                Text("Activity stays on this Mac. History covers the running session and clears when you quit. Disk scans run only when you request them.")
                Button("Full Disk Access…") { openDiskAccess() }
            }
        }.formStyle(.grouped).frame(width: 460, height: 360)
    }

    /// Registers in the setter rather than in onChange, so restoring the toggle after a failure doesn't run the
    /// opposite action and replace the error.
    private var launchAtLogin: Binding<Bool> {
        Binding(get: { login }, set: { enabled in
            do {
                if enabled { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
                login = enabled
                loginError = SMAppService.mainApp.status == .requiresApproval ? "Approve Pith in System Settings → Login Items." : nil
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
