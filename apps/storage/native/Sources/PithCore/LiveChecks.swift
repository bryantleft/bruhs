import Foundation

/// The live map's checks of every folder: whether Pith asked for the daily one and hasn't heard it end, and which check
/// the scanner says is under way. The daily check ends when the scanner reports a check done, when a walk begins, which
/// lists every folder anyway, or when the scanner stops, so a check the scanner later begins itself, as when FSEvents
/// loses track, is never taken for the daily one.
public struct LiveChecks: Equatable, Sendable {
    /// Pith asked the scanner for the daily check, and hasn't heard it end.
    public private(set) var dailyAsked = false
    /// The check under way, as the scanner reports it.
    public private(set) var running: DiskCaption.Check?

    public init() {}

    /// Pith asked the scanner for the daily check.
    public mutating func askedForDaily() { dailyAsked = true }

    /// A status line came, saying whether a check is under way: the daily one while Pith's is unended, any other the
    /// scanner's own.
    public mutating func status(checking: Bool) {
        running = checking ? (dailyAsked ? .daily : .lostTrack) : nil
    }

    /// The scanner finished a check. Whether it was the daily one Pith asked for, which the scheduler then hears is done.
    public mutating func checked() -> Bool { end() }

    /// A walk began, which lists every folder, so a daily check it cut short is done with. Whether one was.
    public mutating func walkBegan() -> Bool { end() }

    /// The scanner stopped, so a daily check asked for didn't finish, and the scheduler should ask again later. Whether
    /// one was asked for.
    public mutating func stopped() -> Bool { end() }

    private mutating func end() -> Bool {
        defer { dailyAsked = false; running = nil }
        return dailyAsked
    }
}
