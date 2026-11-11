import Foundation

/// The smoke test's report on disk, at `url`, which its caller reads once the run is over. It's written as each check
/// lands (`landed`), so a run stopped on its way, as its caller's alarm stops one that runs too long, still leaves every
/// check it finished, marked as a run that didn't finish, so nobody takes it for one that passed. The finished run writes
/// its report over it, as it always has.
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
}
