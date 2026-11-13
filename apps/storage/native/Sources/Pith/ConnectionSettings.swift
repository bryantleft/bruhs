import AppKit
import PithCore
import SwiftUI

struct ConnectionSettings: View {
    let binary: URL
    @State private var root = FileManager.default.homeDirectoryForCurrentUser
    @State private var checking = false
    @State private var notice: String?
    @State private var problem: String?

    var body: some View {
        Section {
            LabeledContent("Folder") {
                Text(root.path).lineLimit(2).truncationMode(.middle).textSelection(.enabled)
            }
            Button("Choose Folder…", action: chooseFolder)
                .disabled(checking)
                .help("Choose a project or Downloads to give the connection less access.")
        } header: {
            Text("Connect an assistant")
        } footer: {
            Text("This connection can inspect only this folder and its subfolders.")
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        Section {
            Button("Copy MCP Configuration", action: copyConfiguration)
            Button(checking ? "Checking…" : "Test Connection", action: check)
                .help("Checks the local server without scanning. Your assistant must be configured separately.")
            if checking { ProgressView().controlSize(.small).accessibilityLabel("Checking the local connection") }
            if let notice { Text(notice).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true).accessibilityIdentifier("mcp-connection-notice") }
            if let problem { Text(problem).foregroundStyle(BruhsColor.statusCritical).fixedSize(horizontal: false, vertical: true) }
        } header: {
            Text("Local MCP server")
        } footer: {
            Text("Paste into your assistant’s MCP settings to ask what’s worth cleaning up.")
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .disabled(checking)
        Section {
            LabeledContent("Access", value: "Read-only")
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Access")
                .accessibilityValue("Read-only")
                .help("The connection cannot delete or move anything.")
            LabeledContent("Shared") {
                Text("Names, sizes and cleanup reasons")
                    .multilineTextAlignment(.trailing)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Shared")
            .accessibilityValue("File and folder names, sizes and cleanup reasons")
        } header: {
            Text("Privacy")
        } footer: {
            Text("Your assistant’s provider may process this metadata. Pith does not read file contents or download cloud files.")
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        Section {
            DisclosureGroup("Connection details") {
                Text("Keep Pith at its current location. Copy the configuration again if you move it.")
                Text("Scan reports stay privately on this Mac. They expire after a day and are removed as the cache is used; older reports may be removed sooner.")
                Text("The app running your assistant may need its own macOS privacy access, even when Pith already has access.")
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func chooseFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true; panel.canChooseFiles = false; panel.allowsMultipleSelection = false
        panel.directoryURL = root
        panel.prompt = "Use Folder"
        if panel.runModal() == .OK, let folder = panel.url {
            root = folder.resolvingSymlinksInPath()
            notice = nil; problem = nil
        }
    }

    private func copyConfiguration() {
        do {
            let configuration = try MCPConnection.configuration(binary: binary, root: root)
            NSPasteboard.general.clearContents()
            guard NSPasteboard.general.setString(configuration, forType: .string) else { throw DiskFailure("The configuration could not be copied. Try copying it again.") }
            notice = "MCP configuration copied."; problem = nil
        } catch { problem = error.localizedDescription; notice = nil }
    }

    private func check() {
        checking = true; notice = nil; problem = nil
        Task {
            defer { checking = false }
            do {
                let count = try await ScannerRunner.checkMCP(binary: binary, root: root)
                notice = "Local server ready. \(count) storage tools available."
            } catch { problem = error.localizedDescription }
        }
    }
}
