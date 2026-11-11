import Foundation

/// The smoke test's report on disk, at `url`, which its caller reads once the run is over. It's written as each check
/// lands (`landed`), so a run stopped on its way, as its caller's alarm stops one that runs too long, still leaves every
/// check it finished, marked as a run that didn't finish, so nobody takes it for one that passed. The run's last report,
/// finished or stopped on an error, is written over it whole too (`write`).
public struct SmokeReport: Sendable {
    public let url: URL

    public init(url: URL) { self.url = url }

    /// Writes `checks`, every check that has landed so far, as a run that hasn't finished: the checks, and an error that
    /// says so, as the report of a run that stopped on an error has them. Written whole, so a reader never finds half.
    public func landed(_ checks: [String: Bool]) {
        let landed = "\(checks.count) check\(checks.count == 1 ? "" : "s") had landed"
        let report: [String: Any] = ["checks": checks, "error": "The smoke test hadn't finished when this was written: \(landed)."]
        guard let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]) else { return }
        try? data.write(to: url, options: .atomic)
    }

    /// Writes `report`, the finished run's report or that of a run stopped on an error, over the one written as its checks
    /// landed. Written whole, as `landed` writes, so a run stopped while it's written still leaves the report before it,
    /// never half of either.
    public func write(_ report: Data) throws {
        try report.write(to: url, options: .atomic)
    }
}
