import AppKit
import Observation
import PithCore

/// The figures the menu bar item can show.
enum MenuBarMetric: String, CaseIterable, Identifiable {
    case cpu, memory, both
    var id: Self { self }
    var title: String {
        switch self {
        case .cpu: "CPU"
        case .memory: "Memory"
        case .both: "CPU and memory"
        }
    }
}

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
    /// What the menu bar item shows after its glyph.
    var menuBarShows = MenuBarMetric(rawValue: UserDefaults.standard.string(forKey: "menuBarShows") ?? "") ?? .cpu {
        didSet { UserDefaults.standard.set(menuBarShows.rawValue, forKey: "menuBarShows"); onSample?() }
    }
    /// Space free on the startup disk now, as Finder counts it.
    var availableDisk: Int64?
    /// Space macOS says it can free for important use, such as caches and snapshots, on top of `availableDisk`.
    var purgeableDisk: Int64?
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
                announceChanges(from: snapshot, to: sample)
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

    /// Says so to VoiceOver when memory pressure turns elevated or the Mac starts to throttle, as the Charts HIG asks:
    /// the menu bar shows it, but a VoiceOver user isn't looking at the menu bar.
    private func announceChanges(from old: ActivitySnapshot?, to new: ActivitySnapshot) {
        var news: [String] = []
        if let old, new.pressure.isElevated, new.pressure != old.pressure { news.append("Memory pressure \(new.pressure.label.lowercased())") }
        if let old, new.thermal.isThrottling, !old.thermal.isThrottling { news.append("The Mac is hot, so macOS is slowing it down") }
        guard !news.isEmpty else { return }
        NSAccessibility.post(element: NSApp as Any, notification: .announcementRequested, userInfo: [
            .announcement: "Pith: " + news.joined(separator: ". "),
            .priority: NSAccessibilityPriorityLevel.high.rawValue,
        ])
    }

    /// Asking for the space available for important usage took about 6 ms per call (19 ms cold) on the
    /// development Mac, so it runs off the main thread and only while the panel shows the result. Free space is the
    /// plain figure Finder shows; what macOS could purge is reported apart, since purging isn't certain to happen.
    func refreshDiskSpace() {
        diskSpace?.cancel()
        diskSpace = Task {
            let volume = await Task.detached(priority: .utility) { () -> (available: Int64?, important: Int64?, total: Int64?, name: String?)? in
                guard let values = try? URL(fileURLWithPath: "/").resourceValues(forKeys: [.volumeAvailableCapacityKey, .volumeAvailableCapacityForImportantUsageKey, .volumeTotalCapacityKey, .volumeLocalizedNameKey])
                else { return nil }
                return (values.volumeAvailableCapacity.map { Int64($0) }, values.volumeAvailableCapacityForImportantUsage, values.volumeTotalCapacity.map { Int64($0) }, values.volumeLocalizedName)
            }.value
            guard !Task.isCancelled else { return }
            availableDisk = volume?.available
            purgeableDisk = volume.flatMap { volume in volume.important.flatMap { important in volume.available.map { max(0, important - $0) } } }
            totalDisk = volume?.total
            volumeName = volume?.name
        }
    }

    /// Whether free space is low enough to warn about: under 5% of the disk, since a nearly full APFS disk slows down,
    /// or under 25 GB, about what Apple asks to have free to upgrade macOS, whichever is larger.
    static func isLowOnSpace(free: Int64, total: Int64) -> Bool {
        free < max(total / 20, 25_000_000_000)
    }
}

// The figure formatters take values, not optionals: a missing reading is left out or explained where it would show,
// never drawn as a placeholder dash. Storage and disk activity count in decimal units, as Finder does; memory in
// binary units, as Activity Monitor does.
func bytes(_ value: UInt64) -> String { formatBytes(value) }
func memorySize(_ value: UInt64) -> String { formatMemory(value) }
/// Glance surfaces (menu bar, panel headline) show whole percents; lists and tables keep one
/// decimal below 10% so small but real activity doesn't read as zero.
func percent(_ value: Double, glance: Bool = false) -> String {
    glance || value >= 10 ? String(format: "%.0f%%", value) : String(format: "%.1f%%", value)
}
func rate(_ value: Double) -> String { bytes(UInt64(max(0, value))) + "/s" }
/// "2.0 W", "12 W": one decimal below 10 W, as estimates don't deserve more.
func watts(_ value: Double) -> String { value >= 9.95 ? String(format: "%.0f W", value) : String(format: "%.1f W", value) }

/// "10:41:20": the locale's time with seconds and without its day period, for times inside the
/// ten-minute window, alongside PanelSummary.clock's minutes.
@MainActor func clockWithSeconds(_ date: Date) -> String { secondsClock.string(from: date) }

@MainActor private let secondsClock: DateFormatter = {
    let formatter = DateFormatter()
    let pattern = DateFormatter.dateFormat(fromTemplate: "jmmss", options: 0, locale: .current) ?? "HH:mm:ss"
    formatter.dateFormat = pattern.replacingOccurrences(of: "a", with: "").trimmingCharacters(in: .whitespaces)
    return formatter
}()
