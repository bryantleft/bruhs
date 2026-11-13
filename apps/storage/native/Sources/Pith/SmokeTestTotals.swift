import AppKit
import PithCore

extension AppDelegate {
    /// Records delivery times, rather than polling snapshots, so short intervals cannot be missed by the check itself.
    func checkFastTotals() async -> [String: Bool] {
        let original = activity.onTotals
        var arrivals: [Double] = []
        var fullSamples = Set<Double>()
        let historyAtStart = activity.history.system.count
        activity.onTotals = { [weak self] in
            original?()
            guard let self, activity.liveTotals != nil else { return }
            arrivals.append(SampleClock.now)
            if let uptime = activity.snapshot?.uptime { fullSamples.insert(uptime) }
        }
        defer { activity.onTotals = original }
        let arrived = await eventually { arrivals.count >= 24 }
        let gaps = zip(arrivals.dropFirst(), arrivals).map { $0 - $1 }.sorted()
        guard arrived, !gaps.isEmpty else { return ["live_totals_at_half_second_cadence": false] }
        let median = gaps[gaps.count / 2]
        let p95 = gaps[min(gaps.count - 1, Int(ceil(Double(gaps.count) * 0.95)) - 1)]
        let elapsed = (arrivals.last ?? 0) - (arrivals.first ?? 0)
        let historyAdded = activity.history.system.count - historyAtStart
        print("fast totals: \(arrivals.count) deliveries, median \(median * 1000) ms, p95 \(p95 * 1000) ms; \(fullSamples.count) full readings and \(historyAdded) history points in \(elapsed) s")
        // A full read timestamps after enumerating processes, even though its totals came first. Publishing it
        // must not replace the dedicated readings. Restore synchronously, before any UI work can see this fixture.
        var fullDidNotReplaceTotals = false
        if let live = activity.liveTotals, let saved = activity.snapshot {
            activity.snapshot = ActivitySnapshot(date: saved.date, uptime: live.uptime + 1, cpu: live.cpu == 0 ? 100 : 0,
                                                 pressure: .unknown, apps: saved.apps, error: nil)
            fullDidNotReplaceTotals = activity.currentCPU == live.cpu && activity.currentMemory == live.memory
                && activity.currentPressure == live.pressure && activity.currentTiers == live.tiers
            activity.snapshot = saved
        }
        return [
            "live_totals_at_half_second_cadence": median >= ActivityModel.totalsInterval * 0.8
                && median < ActivityModel.totalsInterval + 0.1 && p95 < ActivityModel.totalsInterval + 0.15,
            "fast_totals_keep_process_and_history_cadence": fullSamples.count >= 2 && fullSamples.count < arrivals.count
                && fullSamples.count <= Int(ceil(elapsed / ActivityModel.watchedInterval)) + 1
                && historyAdded > 0 && historyAdded <= Int(ceil(elapsed / ActivityModel.watchedInterval)) + 2,
            "fast_totals_read_cpu_and_memory": activity.liveTotals?.cpu != nil && activity.liveTotals?.memory != nil,
            "full_samples_do_not_roll_live_totals_back": fullDidNotReplaceTotals
        ]
    }

    /// Icon-only mode paints no changing numbers while both views are closed, so the fast timer must stop delivering.
    func checkHiddenTotals() async -> Bool {
        guard !activity.activityOnScreen, !activity.showsDiskSpace else { return false }
        let original = activity.iconOnly
        activity.iconOnly = true
        defer { activity.iconOnly = original }
        guard await eventually({ self.activity.liveTotals == nil }) else { return false }
        try? await Task.sleep(for: .milliseconds(400))
        return activity.liveTotals == nil
    }
}
