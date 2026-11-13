import AppKit
import PithCore
import SwiftUI

/// Repeatable renders of Pith's real views. The automated launch keeps settings and history in memory.
extension AppDelegate {
    func auditUI(savingTo folder: URL) async {
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try await waitUntil("an Activity sample for the UI audit") { self.activity.snapshot?.cpu != nil }
            activity.refreshDiskSpace()
            try await waitUntil("disk capacity for the UI audit") { self.activity.totalDisk != nil }
            activity.pause()
            let engine = AuditUpdateEngine()
            let releaseUpdates = Updates(version: updates.version)
            releaseUpdates.attach(engine)
            let localTools = try await LocalToolsFixture.make(binary: disk.binary)
            defer { try? FileManager.default.removeItem(at: localTools.folder) }
            var findings: [String: Double] = [:]
            var panelHeights: [String: CGFloat] = [:]
            for scale in [1.0, 1.4] {
                TextSize.shared.reset()
                while TextSize.shared.scale < scale { TextSize.shared.step(1) }
                for (look, appearance) in [("light", NSAppearance.Name.aqua), ("dark", .darkAqua)] {
                    let searching = ActivityState()
                    searching.search = String(repeating: "unmatched long search query ", count: 60)
                    _ = try await captureUI(ActivityView(model: activity, state: searching), name: "search-long-\(Int(scale * 100))-\(look)",
                                            size: NSSize(width: 820, height: 560), appearance: appearance, folder: folder)
                    for width in [820.0, 1180.0] {
                        for inspecting in [false, true] {
                            let state = ActivityState()
                            if inspecting { state.selection = activity.history.apps.values.first(where: { $0.latest.identity.kind == .app }).map { .app($0.id) } }
                            let name = "activity-\(Int(width))-\(Int(scale * 100))-\(look)\(inspecting ? "-inspector" : "")"
                            _ = try await captureUI(ActivityView(model: activity, state: state), name: name,
                                                    size: NSSize(width: width, height: 560), appearance: appearance, folder: folder)
                        }
                    }
                    let actions = PanelActions(openActivity: { _ in }, openDisk: {}, openSettings: {}, checkForUpdates: {}, openUpdate: {})
                    var panelHeight: CGFloat = 0
                    let menu = MenuPanel(model: activity, updates: releaseUpdates, size: MenuPanelLayout.idealSize, actions: actions,
                                         contentHeight: { panelHeight = $0 })
                    _ = try await captureUI(menu, name: "panel-\(Int(scale * 100))-\(look)", size: MenuPanelLayout.idealSize, appearance: appearance, folder: folder)
                    activity.paused = false
                    _ = try await captureUI(menu, name: "panel-live-\(Int(scale * 100))-\(look)", size: MenuPanelLayout.idealSize, appearance: appearance, folder: folder)
                    panelHeights["collapsed-\(Int(scale * 100))-\(look)"] = panelHeight
                    let expandedMenu = MenuPanel(model: activity, updates: releaseUpdates, size: MenuPanelLayout.idealSize, actions: actions,
                                                 memoryDetailsInitiallyExpanded: true, contentHeight: { panelHeight = $0 })
                    _ = try await captureUI(expandedMenu, name: "panel-details-\(Int(scale * 100))-\(look)", size: MenuPanelLayout.idealSize, appearance: appearance, folder: folder)
                    panelHeights["expanded-\(Int(scale * 100))-\(look)"] = panelHeight
                    if let saved = activity.snapshot {
                        let savedHistory = activity.history
                        for (state, pressure) in [("normal", MemoryPressure.normal), ("warning", .warning)] {
                            let sample = ActivitySnapshot(date: saved.date.addingTimeInterval(0.001), uptime: saved.uptime + 0.001,
                                                          cpu: saved.cpu, pressure: pressure, apps: saved.apps, error: nil,
                                                          memory: saved.memory, tiers: saved.tiers)
                            activity.snapshot = sample
                            activity.history = savedHistory
                            activity.history.append(sample)
                            _ = try await captureUI(menu, name: "panel-\(state)-\(Int(scale * 100))-\(look)", size: MenuPanelLayout.idealSize, appearance: appearance, folder: folder)
                            panelHeights["\(state)-\(Int(scale * 100))-\(look)"] = panelHeight
                        }
                        activity.snapshot = saved
                        activity.history = savedHistory
                    }
                    activity.paused = true
                    let keptState = ActivityState()
                    keptState.span = .sixHours
                    _ = try await captureUI(ActivityView(model: activity, state: keptState), name: "history-820-\(Int(scale * 100))-\(look)",
                                            size: NSSize(width: 820, height: 560), appearance: appearance, folder: folder)
                    let settings = SettingsView(model: activity, alerts: alertSettings, disk: disk, shortcut: shortcut, updates: releaseUpdates)
                    let ideal = try await captureUI(settings, name: "settings-\(Int(scale * 100))-\(look)", size: nil, appearance: appearance, folder: folder)
                    findings["settings-\(Int(scale * 100))-\(look)-height"] = ideal.height
                    _ = try await captureUI(settings, name: "settings-bottom-\(Int(scale * 100))-\(look)", size: nil, appearance: appearance,
                                            folder: folder, scrollToBottom: true)
                    for pane in [SettingsPane.monitoring, .connections] {
                        let settings = SettingsView(model: activity, alerts: alertSettings, disk: disk, shortcut: shortcut, updates: releaseUpdates, pane: pane)
                        _ = try await captureUI(settings, name: "settings-\(pane.rawValue)-\(Int(scale * 100))-\(look)", size: nil,
                                                appearance: appearance, folder: folder)
                    }
                    let diagnostics = SettingsView(model: activity, alerts: alertSettings, disk: disk, shortcut: shortcut, updates: releaseUpdates,
                                                   pane: .monitoring, diagnosticsExpanded: true)
                    _ = try await captureUI(diagnostics, name: "settings-diagnostics-\(Int(scale * 100))-\(look)", size: nil, appearance: appearance,
                                            folder: folder, scrollToBottom: true)
                    let welcome = WelcomeView(activity: activity, glyph: statusGlyph(), open: { _ in }, close: {})
                    _ = try await captureUI(welcome, name: "welcome-\(Int(scale * 100))-\(look)", size: nil, appearance: appearance, folder: folder)
                    try await captureLocalTools(localTools, scale: scale, look: look, appearance: appearance, folder: folder)
                }
            }
            TextSize.shared.reset()
            let geometry = folder.appendingPathComponent("geometry")
            let captures = try FileManager.default.contentsOfDirectory(at: geometry, includingPropertiesForKeys: nil)
                .sorted { $0.lastPathComponent < $1.lastPathComponent }
                .map { try JSONSerialization.jsonObject(with: Data(contentsOf: $0)) }
            let overflowing = captures.compactMap { capture -> String? in
                guard let measured = capture as? [String: Any], let name = measured["name"] as? String,
                      let width = measured["actualWidth"] as? Double, let height = measured["actualHeight"] as? Double,
                      let requestedWidth = measured["requestedWidth"] as? Double, let requestedHeight = measured["requestedHeight"] as? Double else { return "invalid geometry" }
                return width > requestedWidth + 0.5 || height > requestedHeight + 0.5 ? name : nil
            }
            let report = try JSONSerialization.data(withJSONObject: ["settingsHeights": findings, "panelContentHeights": panelHeights, "captures": captures, "overflowingCaptures": overflowing], options: [.prettyPrinted, .sortedKeys])
            try report.write(to: folder.appendingPathComponent("native-layout.json"))
            guard overflowing.isEmpty else { throw DiskFailure("Native content outgrew its window: \(overflowing.joined(separator: ", ")).") }
            print("Native UI audit saved \(captures.count) captures and their actual geometry to \(folder.path). Settings heights: \(findings)")
            NSApp.terminate(nil)
        } catch {
            print("Native UI audit failed: \(error.localizedDescription)")
            exit(1)
        }
    }

    func captureUI<Content: View>(_ content: Content, name: String, size: NSSize?, appearance: NSAppearance.Name, folder: URL,
                                         scrollToBottom: Bool = false) async throws -> NSSize {
        let host = NSHostingView(rootView: content.background(BruhsColor.canvas))
        host.appearance = NSAppearance(named: appearance)
        let ideal = host.fittingSize
        let size = size ?? ideal
        let window = NSWindow(contentRect: NSRect(x: -8000, y: -8000, width: size.width, height: size.height),
                              styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.appearance = host.appearance
        window.contentView = host
        window.orderFrontRegardless()
        defer { window.orderOut(nil); window.contentView = nil }
        try await Task.sleep(for: .milliseconds(200))
        host.layoutSubtreeIfNeeded()
        if scrollToBottom, let scroll = firstView(NSScrollView.self, in: host), let document = scroll.documentView {
            document.scroll(NSPoint(x: 0, y: document.isFlipped ? max(0, document.bounds.height - scroll.contentView.bounds.height) : 0))
            scroll.reflectScrolledClipView(scroll.contentView)
            try await Task.sleep(for: .milliseconds(100))
        }
        guard let bitmap = host.bitmapImageRepForCachingDisplay(in: host.bounds) else { throw DiskFailure("Could not capture \(name).") }
        host.cacheDisplay(in: host.bounds, to: bitmap)
        guard let png = bitmap.representation(using: .png, properties: [:]) else { throw DiskFailure("Could not encode \(name).") }
        try png.write(to: folder.appendingPathComponent("\(name).png"))
        // Window corners may be transparent; the inset canvas must have painted before this is evidence.
        guard bitmap.colorAt(x: bitmap.pixelsWide / 4, y: bitmap.pixelsHigh / 4)?.alphaComponent == 1 else {
            throw DiskFailure("Capture \(name) is transparent. The native view did not paint its canvas; retake this capture.")
        }
        let geometry = folder.appendingPathComponent("geometry")
        try FileManager.default.createDirectory(at: geometry, withIntermediateDirectories: true)
        let measured: [String: Any] = ["name": name, "requestedWidth": size.width, "requestedHeight": size.height,
                                       "actualWidth": host.bounds.width, "actualHeight": host.bounds.height,
                                       "idealWidth": ideal.width, "idealHeight": ideal.height]
        try JSONSerialization.data(withJSONObject: measured, options: [.prettyPrinted, .sortedKeys])
            .write(to: geometry.appendingPathComponent("\(name).json"))
        return ideal
    }
}

@MainActor private final class AuditUpdateEngine: UpdateEngine {
    var canCheck = true
    var checksAutomatically = false
    var downloadsAutomatically = false
    func check() {}
    func reply(_ choice: UpdateFlow.Choice) {}
    func answerPermission(checks: Bool, downloads: Bool) {}
    func close() {}
}
