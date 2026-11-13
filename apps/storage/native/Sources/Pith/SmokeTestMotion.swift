import AppKit
import PithCore

extension AppDelegate {
    /// The renderer keeps readings in place, publishes accessibility immediately and removes motion on request.
    func checkReadingMotion() async -> [String: Bool] {
        let view = FlowView(frame: NSRect(x: 0, y: 0, width: 200, height: 60))
        let window = NSWindow(contentRect: NSRect(x: 32, y: 32, width: 200, height: 60), styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = view
        window.orderFrontRegardless()
        defer { window.orderOut(nil); window.contentView = nil }
        let face = BruhsType.readoutFace
        view.show("89%", face: face, color: BruhsNSColor.text, moves: false)
        CATransaction.flush()
        try? await Task.sleep(for: .milliseconds(60))
        let reading = readingLayer(in: view.layer)
        let initialFrame = reading?.frame
        view.show("97%", face: face, color: BruhsNSColor.text, moves: true, duration: ReadingMotion.live)
        CATransaction.flush()
        let fade = reading?.animation(forKey: ReadingMotion.fadeKey) as? CATransition
        var point: [Float] = [0, 0]
        fade?.timingFunction?.getControlPoint(at: 1, values: &point)
        let reduceMotion = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        let calmFade = reduceMotion ? fade == nil : fade?.type == .fade && fade?.duration == ReadingMotion.live
            && abs(point[0] - 0.23) < 0.001 && abs(point[1] - 1) < 0.001
        try? await Task.sleep(for: .milliseconds(30))
        view.show("93%", face: face, color: BruhsNSColor.text, moves: true, duration: ReadingMotion.live)
        let latest = view.accessibilityLabel() == "93%" && reading?.contents != nil
        let staysInPlace = reading != nil && reading?.frame == initialFrame
            && (reading?.animationKeys() ?? []).allSatisfy { $0 == ReadingMotion.fadeKey }
        view.show("93%", face: face, color: BruhsNSColor.text, moves: false, duration: ReadingMotion.live)
        let stops = reading?.animationKeys()?.isEmpty != false && view.accessibilityLabel() == "93%"
        // A delayed macOS file icon must not hold layout or a live reading on the main thread.
        let probe = MotionIconProbe()
        let icons = AppIconCache(lookup: probe.lookup)
        let path = "/Applications/Pith.app/Contents/MacOS/Pith"
        let began = ContinuousClock.now
        _ = icons.icon(for: path)
        _ = icons.icon(for: path)
        let iconDidNotBlock = began.duration(to: .now) < .milliseconds(100)
        let loadedIcon = await icons.loadedIcon(for: path)
        let iconSettled = await eventually { icons.icon(for: path) === probe.image }
        let iconsLoadInBackground = iconDidNotBlock && loadedIcon === probe.image && iconSettled && probe.calls == 1
        print("reading motion: subtle fade \(calmFade), stays in place \(staysInPlace), latest value accessible \(latest), Reduce Motion stops same-value fade \(stops)")
        return ["readings_use_subtle_crossfades": calmFade, "reading_updates_stay_in_place": staysInPlace,
                "latest_reading_is_accessible_during_fade": latest, "reduce_motion_stops_same_value_fade": stops,
                "app_icon_loading_does_not_block_live_readings": iconsLoadInBackground]
    }

    private func readingLayer(in layer: CALayer?) -> CALayer? {
        guard let layer else { return nil }
        if layer.name == "Pith reading" { return layer }
        return layer.sublayers?.lazy.compactMap { self.readingLayer(in: $0) }.first
    }

    /// A focused, packaged diagnostic for readout, ranking, cadence and pause/resume changes. It maps no personal files.
    func auditReadings(savingTo report: URL) async {
        setvbuf(stdout, nil, _IOLBF, 0)
        var checks: [String: Bool] = [:]
        do {
            activity.pause()
            checks.merge(await checkReadingMotion(), uniquingKeysWith: { _, new in new })
            checks.merge(await checkRankedLists(), uniquingKeysWith: { _, new in new })
            print("readout and ranking checks: \(checks)")
            showActivity()
            activity.start()
            try await waitUntil("live CPU and memory readings") { self.activity.liveTotals?.cpu != nil && self.activity.liveTotals?.memory != nil }
            checks.merge(await checkFastTotals(), uniquingKeysWith: { _, new in new })
            activity.pause()
            try? await Task.sleep(for: .milliseconds(650))
            checks["pause_stops_live_totals"] = activity.liveTotals == nil
            activity.start()
            checks["resume_restarts_live_totals"] = await eventually { self.activity.liveTotals?.cpu != nil }
            mainWindow?.window.performClose(nil)
            statusItem?.closePanel()
            try await waitUntil("both reading views to close") { !self.activity.activityOnScreen && !self.activity.showsDiskSpace }
            let menu = await checkFastTotals()
            checks.merge(Dictionary(uniqueKeysWithValues: menu.map { ("menu_only_" + $0.key, $0.value) }), uniquingKeysWith: { _, new in new })
            checks["icon_only_unwatched_stops_live_totals"] = await checkHiddenTotals()
            activity.pause()
            try FileManager.default.createDirectory(at: report.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONSerialization.data(withJSONObject: checks, options: [.prettyPrinted, .sortedKeys]).write(to: report)
            print("Reading diagnostic: \(checks.count) checks; failures \(checks.filter { !$0.value }.keys.sorted())")
            if checks.values.contains(false) { exit(1) }
            NSApp.terminate(nil)
        } catch {
            let result: [String: Any] = ["checks": checks, "error": error.localizedDescription]
            try? JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys]).write(to: report)
            print("Reading diagnostic failed: \(error.localizedDescription)")
            exit(1)
        }
    }

}

private final class MotionIconProbe: @unchecked Sendable {
    let image = NSImage(size: NSSize(width: 16, height: 16))
    private let lock = NSLock()
    private var count = 0
    var calls: Int { lock.withLock { count } }
    func lookup(_ key: IconKey) -> NSImage? {
        lock.withLock { count += 1 }
        Thread.sleep(forTimeInterval: 0.25)
        return image
    }
}
