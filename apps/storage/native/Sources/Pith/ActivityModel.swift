import AppKit
import Observation
import PithCore

@MainActor @Observable final class ActivityModel {
    // Warm sampling measured 10–15 ms on the development Mac. Two seconds
    // amortizes this below 1% of one core before UI/history work; verify the bundle too.
    static let interval: TimeInterval = 2
    var snapshot: ActivitySnapshot?
    var history = SessionHistory()
    var paused = false
    var iconOnly = UserDefaults.standard.bool(forKey: "iconOnly") {
        didSet { UserDefaults.standard.set(iconOnly, forKey: "iconOnly"); onSample?() }
    }
    var availableDisk: Int64?
    var totalDisk: Int64?
    var volumeName: String?
    /// True while the panel is open, the one place that shows the startup disk's free space.
    var showsDiskSpace = false {
        didSet { if showsDiskSpace && !oldValue { refreshDiskSpace() } }
    }
    /// Set when the panel opens Activity for one app; Activity selects it and clears this.
    var focusAppID: String?
    var onSample: (() -> Void)?
    /// A gap longer than two sample intervals is missing data, not a slow sample.
    static let maxGap = interval * 2

    /// The session window ending at the latest sample, in sample-clock seconds.
    var window: ClosedRange<Double>? { snapshot.map { ($0.uptime - SessionHistory.retention)...$0.uptime } }
    /// When readings began, while that is inside the window. Summaries then say "since 10:41", because an average
    /// over two minutes of a young session isn't one over the last ten.
    var historyStart: Date? { window.flatMap { PanelSummary.cpu(history.system, window: $0, maxGap: Self.maxGap).since } }
    private let sampler = SystemSampler()
    private var sampling: Task<Void, Never>?
    private var diskSpace: Task<Void, Never>?

    func start() {
        sampling?.cancel()
        paused = false
        sampling = Task {
            await sampler.reset()
            while !Task.isCancelled {
                let sample = await sampler.sample()
                guard !Task.isCancelled else { return }
                snapshot = sample
                history.append(sample)
                if showsDiskSpace { refreshDiskSpace() }
                onSample?()
                do { try await Task.sleep(for: .seconds(Self.interval)) } catch { return }
            }
        }
    }

    func pause() {
        sampling?.cancel(); sampling = nil; paused = true
        onSample?()
    }

    /// Asking for the space available for important usage took about 6 ms per call (19 ms cold) on the
    /// development Mac, so it runs off the main thread and only while the panel shows the result.
    private func refreshDiskSpace() {
        diskSpace?.cancel()
        diskSpace = Task {
            let volume = await Task.detached(priority: .utility) { () -> (available: Int64?, total: Int64?, name: String?)? in
                guard let values = try? URL(fileURLWithPath: "/").resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey, .volumeTotalCapacityKey, .volumeLocalizedNameKey])
                else { return nil }
                return (values.volumeAvailableCapacityForImportantUsage, values.volumeTotalCapacity.map { Int64($0) }, values.volumeLocalizedName)
            }.value
            guard !Task.isCancelled else { return }
            availableDisk = volume?.available
            totalDisk = volume?.total
            volumeName = volume?.name
        }
    }
}

func bytes(_ value: UInt64?) -> String {
    value.map(formatBytes) ?? "—"
}
/// Glance surfaces (menu bar, panel headline) show whole percents; lists and tables keep one
/// decimal below 10% so small but real activity doesn't read as zero.
func percent(_ value: Double?, glance: Bool = false) -> String {
    guard let value else { return "—" }
    return glance || value >= 10 ? String(format: "%.0f%%", value) : String(format: "%.1f%%", value)
}
func rate(_ value: Double?) -> String { value.map { bytes(UInt64(max(0, $0))) + "/s" } ?? "—" }

/// "10:41:20": the locale's time with seconds and without its day period, for times inside the
/// ten-minute window, alongside PanelSummary.clock's minutes.
@MainActor func clockWithSeconds(_ date: Date) -> String { secondsClock.string(from: date) }

@MainActor private let secondsClock: DateFormatter = {
    let formatter = DateFormatter()
    let pattern = DateFormatter.dateFormat(fromTemplate: "jmmss", options: 0, locale: .current) ?? "HH:mm:ss"
    formatter.dateFormat = pattern.replacingOccurrences(of: "a", with: "").trimmingCharacters(in: .whitespaces)
    return formatter
}()
