import Foundation

/// Whether a live map's volume space is measured again for it, or the figures last measured stand (`DiskModel.figures`).
/// Each live map lags a change by the scanner's settle (`SETTLE` in scanner/src/serve.rs), while the volume's space is
/// measured at once, so a large write would grow Not measured for a few seconds, then shrink it again. The scanner says
/// with each map how many folders wait to be listed for a change (`pending` in a tree line): while some do, the figures
/// measured with the last map that had none stand, so the block, the popover and the hover card's used space stay one
/// accounting. The first map that has none is measured, and so is the first a minute after the figures were, however
/// long folders keep waiting, as a busy one in its cooldown can: the same bound, and receipt, as the person's changes
/// held on the live map (`LiveEdits.longestHold`).
public struct SpaceHold: Sendable, Equatable {
    /// The root of the map the figures were last measured for, and when.
    private var last: (root: String, at: Date)?

    public init() {}

    public static func == (lhs: SpaceHold, rhs: SpaceHold) -> Bool { lhs.last?.root == rhs.last?.root && lhs.last?.at == rhs.last?.at }

    /// A map of `root` came from an index with `pending` folders waiting to be listed, or nil when the scanner didn't say,
    /// as one from before it did: whether to measure the volume's space for it at `now`. `holding` says whether figures for
    /// a map of `root` are in hand to stand for it.
    public func measures(root: String, pending: Int?, holding: Bool, at now: Date) -> Bool {
        guard holding, let last, last.root == root, let pending, pending > 0 else { return true }
        return now.timeIntervalSince(last.at) > LiveEdits.longestHold
    }

    /// The volume's space was measured for a map of `root` at `time`.
    public mutating func measured(root: String, at time: Date) {
        last = (root, time)
    }
}
