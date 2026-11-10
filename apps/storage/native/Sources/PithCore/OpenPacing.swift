import Foundation

/// When the live map asks for the tree of a folder the person opened: at once, rather than up to two seconds later
/// as for a refresh, so the folder's finer detail comes with it. Opens closer together than `burst`, as a held key
/// repeating ⌘[ or ⌘↑ makes, are a burst: its first open asks at once, and its last asks once the burst ends, so the
/// ones between, which nobody sees, ask for nothing.
public struct OpenPacing: Sendable {
    /// When a folder last opened.
    private var last: Date?

    public init() {}

    /// How close together opens come in a burst, from macOS's key repeat interval (`NSEvent.keyRepeatInterval`):
    /// twice it, so a repeat that arrives a little late still counts, and never longer than the two seconds between
    /// refreshes. At macOS's default repeat of 1/12 s, that's 1/6 s.
    public static func burst(keyRepeat: TimeInterval) -> TimeInterval {
        min(2, max(0, 2 * keyRepeat))
    }

    /// Notes a folder opening at `now`: nil to ask for its tree at once, or how long to wait before asking, a wait the
    /// next open of the burst starts over.
    public mutating func opened(at now: Date, burst: TimeInterval) -> TimeInterval? {
        defer { last = now }
        guard let last, now.timeIntervalSince(last) < burst else { return nil }
        return burst
    }
}
