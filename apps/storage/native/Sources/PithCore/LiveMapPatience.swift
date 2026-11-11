import Foundation

/// How long a wait for the live map to show a change on the disk goes on, as the smoke test waits for its own files to
/// reach the map and leave it. A change reaches the map through FSEvents' second of latency, the scanner's three
/// seconds of settling (`SETTLE` in scanner/src/serve.rs) and Pith's two seconds between maps, 4.5 to 5.7 s on the
/// development Mac (`LiveEdits.longestHold`). But a folder whose last listing was slow waits for its next one 200 times
/// as long as that listing took (`COOLDOWN_FACTOR`), so a listing a loaded Mac slows past 15 ms holds its folder's next
/// past the settling, and one slowed by 100 ms holds it for 20 s, the whole of a fixed patience, while the map is only
/// behind. The scanner says how many folders it has waiting, cooldowns' included, with each status line. So the wait's
/// `patience` counts only while the live map has no folder waiting to be listed, and the wait goes on for `longest` at
/// most in all. A change that never shows still fails it: once the map has had nothing waiting for the whole patience,
/// or at the longest.
public struct LiveMapPatience: Sendable {
    /// How long the wait goes on while the live map has no folder waiting to be listed.
    public let patience: TimeInterval
    /// The longest the wait goes on in all, folders waiting or not.
    public let longest: TimeInterval
    private let began: Date
    private var lastLook: Date
    /// How long the live map has had no folder waiting since the wait began.
    private var idle: TimeInterval = 0

    public init(patience: TimeInterval, longest: TimeInterval, at began: Date) {
        self.patience = patience
        self.longest = longest
        self.began = began
        lastLook = began
    }

    /// The wait looks again at `now`, the live map with folders `waiting` to be listed or not: whether it may go on. The
    /// time since the last look counts against the patience only when nothing waits.
    public mutating func mayGoOn(at now: Date, waiting: Bool) -> Bool {
        if !waiting { idle += max(0, now.timeIntervalSince(lastLook)) }
        lastLook = now
        return idle < patience && now.timeIntervalSince(began) < longest
    }
}
