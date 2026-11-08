import AppIntents
import AppKit
import PithCore

/// Shortcuts actions and Siri phrases for what Pith measures. They read the running app's latest sample, so their
/// answers match Activity and the menu bar panel. build-mac.mjs extracts their metadata into the app bundle, as Xcode
/// would, since Pith builds with SwiftPM.

/// A failure said as Shortcuts and Siri show it: what went wrong and what to do.
struct PithIntentError: Error, CustomLocalizedStringResourceConvertible {
    let localizedStringResource: LocalizedStringResource
    init(_ message: LocalizedStringResource) { localizedStringResource = message }
}

@MainActor private enum Pith {
    static var app: AppDelegate {
        get throws {
            guard let app = NSApp.delegate as? AppDelegate else { throw PithIntentError("Pith isn’t running. Open Pith, then try again.") }
            return app
        }
    }

    /// The latest sample, waiting up to 3 seconds for a first one when the action launched Pith: samples arrive every 2.
    static func latest() async throws -> ActivitySnapshot {
        let activity = try app.activity
        for _ in 0..<30 {
            if let snapshot = activity.snapshot { return snapshot }
            try await Task.sleep(for: .milliseconds(100))
        }
        throw PithIntentError("Pith hasn’t taken a reading yet. Try again in a moment.")
    }
}

struct GetMemoryPressureIntent: AppIntent {
    static let title: LocalizedStringResource = "Get Memory Pressure"
    static let description = IntentDescription("Says how hard macOS is working to find memory, and how much is in use.")

    @MainActor func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        let snapshot = try await Pith.latest()
        var answer = "Memory pressure is \(snapshot.pressure.label.lowercased())."
        if let memory = snapshot.memory {
            answer += " \(memorySize(memory.used)) of \(memorySize(memory.physical)) is in use"
            if let swap = memory.swapUsed, swap > 0 { answer += ", and \(memorySize(swap)) is in swap." } else { answer += "." }
        }
        return .result(value: answer, dialog: IntentDialog(stringLiteral: answer))
    }
}

/// What the busiest apps are ranked by.
enum BusiestMeasure: String, AppEnum {
    case cpu, memory
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Measure"
    static let caseDisplayRepresentations: [BusiestMeasure: DisplayRepresentation] = [.cpu: "CPU", .memory: "Memory"]
}

struct GetBusiestAppsIntent: AppIntent {
    static let title: LocalizedStringResource = "Get Busiest Apps"
    static let description = IntentDescription("Lists the apps using the most CPU or memory right now, as Activity ranks them.")

    @Parameter(title: "By", default: .cpu) var measure: BusiestMeasure
    @Parameter(title: "How Many", default: 3, inclusiveRange: (1, 10)) var count: Int

    static var parameterSummary: some ParameterSummary { Summary("Get the \(\.$count) busiest apps by \(\.$measure)") }

    @MainActor func perform() async throws -> some IntentResult & ReturnsValue<[String]> & ProvidesDialog {
        let snapshot = try await Pith.latest()
        let own = ProcessInfo.processInfo.processIdentifier
        let apps = snapshot.apps.filter { !$0.members.contains { $0.pid == own } }
        let ranked: [(name: String, figure: String)] = switch measure {
        case .cpu: apps.filter { ($0.cpu ?? 0) > 0 }.sorted { ($0.cpu ?? 0) > ($1.cpu ?? 0) }.prefix(count).map { ($0.name, "\(percent($0.cpu ?? 0)) CPU") }
        case .memory: apps.filter { ($0.memory ?? 0) > 0 }.sorted { ($0.memory ?? 0) > ($1.memory ?? 0) }.prefix(count).map { ($0.name, memorySize($0.memory ?? 0)) }
        }
        guard !ranked.isEmpty else { throw PithIntentError("No app is using any \(measure == .cpu ? "CPU" : "memory") Pith can read right now.") }
        let lines = ranked.map { "\($0.name), \($0.figure)" }
        let said = ranked.map { "\($0.name) (\($0.figure))" }
        let list = said.count == 1 ? said[0] : said.dropLast().joined(separator: ", ") + " and " + said[said.count - 1]
        return .result(value: lines, dialog: IntentDialog(stringLiteral: "The busiest \(said.count == 1 ? "app is" : "apps are") \(list)."))
    }
}

struct ShowActivityIntent: AppIntent {
    static let title: LocalizedStringResource = "Show Activity"
    static let description = IntentDescription("Opens Pith’s Activity window, which shows what’s using your Mac.")
    static let openAppWhenRun = true

    @MainActor func perform() async throws -> some IntentResult {
        try Pith.app.showActivity()
        return .result()
    }
}

struct ScanFolderIntent: AppIntent {
    static let title: LocalizedStringResource = "Scan Folder"
    static let description = IntentDescription("Opens Pith’s Disk tab and scans a folder, to show what takes its space.")
    static let openAppWhenRun = true

    // Limiting the picker to folders needs macOS 15, and Pith runs on 14, so a file is turned away here instead.
    @Parameter(title: "Folder") var folder: IntentFile

    @MainActor func perform() async throws -> some IntentResult {
        guard let url = folder.fileURL, (try? url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true else {
            throw PithIntentError("Choose a folder on this Mac to scan.")
        }
        let app = try Pith.app
        app.showDisk()
        app.disk.scan(url)
        return .result()
    }
}

struct PithShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: GetBusiestAppsIntent(), phrases: ["What’s slowing my Mac in \(.applicationName)", "Busiest apps in \(.applicationName)"],
                    shortTitle: "Busiest Apps", systemImageName: "cpu")
        AppShortcut(intent: GetMemoryPressureIntent(), phrases: ["Check memory pressure in \(.applicationName)", "How is my Mac’s memory in \(.applicationName)"],
                    shortTitle: "Memory Pressure", systemImageName: "memorychip")
        AppShortcut(intent: ShowActivityIntent(), phrases: ["Show Activity in \(.applicationName)"], shortTitle: "Activity", systemImageName: "waveform.path.ecg")
    }
}
