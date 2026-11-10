import Foundation

/// When Pith measures what deleting the selection frees (`ScannerRunner.frees`): once for each selection, and again only
/// when an item's size has moved by more than `threshold` since the measurement in hand began. One measurement runs at
/// a time, and the next of the same selection waits out a rest after the last, paced as the scanner paces a folder it
/// follows, so a large selection that keeps changing costs at most half a percent of a core to follow.
public struct FreesSchedule: Sendable {
    /// What to do about the figure, as the schedule decides.
    public enum Step: Equatable, Sendable {
        /// Nothing to measure: the figure in hand stands.
        case keep
        /// Measure now.
        case measure
        /// The items moved, but the last measurement rests until then: ask again then. The figure in hand stands
        /// meanwhile.
        case wait(until: Date)
    }

    /// A megabyte as Pith counts and shows sizes (`formatBytes`): 10^6 bytes.
    public static let threshold: UInt64 = 1_000_000

    /// The least rest after a measurement: the time a changed folder waits before the live map lists it (`SETTLE` in
    /// scanner/src/serve.rs), so the figure follows the disk no faster than the map does.
    public static let leastRest: TimeInterval = 3

    /// The rest after a measurement, in multiples of how long it took, for each core it could take. The scanner makes a
    /// folder whose listing took long wait 200 times as long before its next (`COOLDOWN_FACTOR` in scanner/src/serve.rs),
    /// which keeps following it under half a percent of a core. A measurement walks on every core at once: a walk of the
    /// repo's node_modules, 88,188 files, took 0.70 s and 6.2 to 6.4 s of CPU on a 12-core M2 Max. Its CPU time is at
    /// most its length times the cores, so 200 times that keeps it under the same half a percent on any Mac.
    public static let restPerCore: Double = 200

    /// How many times as long as the last measurement took the next of the same selection waits.
    private let restFactor: Double
    /// The selected items' sizes, by path, when the measurement under way or the last one began; nil with nothing selected.
    private var basis: [String: UInt64]?
    private var measuring = false
    /// When the rest after the last measurement ends.
    private var restsUntil: Date?

    /// The schedule for a Mac of `cores` cores, this one's unless a test gives its own.
    public init(cores: Int = ProcessInfo.processInfo.activeProcessorCount) {
        restFactor = Self.restPerCore * Double(max(1, cores))
    }

    /// Whether items of `sizes` differ from those `measured` was taken of: other items, or one whose size moved by
    /// more than `threshold`, either way.
    public static func moved(from measured: [String: UInt64], to sizes: [String: UInt64]) -> Bool {
        guard Set(measured.keys) == Set(sizes.keys) else { return true }
        return sizes.contains { path, size in
            let before = measured[path] ?? 0
            return (size > before ? size - before : before - size) > threshold
        }
    }

    /// The selection changed to items of `sizes`: measure them, as for any selection but none, without waiting, since
    /// it's the person's own choice. A measurement of the last one is the last one's, and is dropped.
    public mutating func selected(_ sizes: [String: UInt64]) -> Step {
        restsUntil = nil
        guard !sizes.isEmpty else { basis = nil; measuring = false; return .keep }
        basis = sizes
        measuring = true
        return .measure
    }

    /// A newer map gives the same items `sizes` at `time`: whether to measure them again.
    public mutating func mapChanged(_ sizes: [String: UInt64], at time: Date) -> Step {
        guard !measuring, let basis, !sizes.isEmpty, Self.moved(from: basis, to: sizes) else { return .keep }
        if let restsUntil, time < restsUntil { return .wait(until: restsUntil) }
        self.basis = sizes
        measuring = true
        return .measure
    }

    /// The measurement under way came at `time`, after `took` seconds, when the items are `sizes`: it rests, and they're
    /// measured again after its rest if they moved meanwhile.
    public mutating func landed(_ sizes: [String: UInt64], at time: Date, took: TimeInterval) -> Step {
        rest(from: time, took: took)
        return mapChanged(sizes, at: time)
    }

    /// The measurement under way failed at `time`, after `took` seconds. It rests too, and the next map whose items moved
    /// measures again: trying again unmoved would likely fail again.
    public mutating func failed(at time: Date, took: TimeInterval) { rest(from: time, took: took) }

    private mutating func rest(from time: Date, took: TimeInterval) {
        measuring = false
        restsUntil = time.addingTimeInterval(max(Self.leastRest, restFactor * max(0, took)))
    }
}
