import Foundation

public enum MetricMath {
    public static func cpu(busy: UInt64, total: UInt64, previousBusy: UInt64, previousTotal: UInt64) -> Double? {
        guard total > previousTotal, busy >= previousBusy else { return nil }
        let delta = busy - previousBusy
        guard delta <= total - previousTotal else { return nil }
        return Double(delta) / Double(total - previousTotal) * 100
    }
    public static func rate(counter: UInt64, previous: UInt64, elapsed: Double) -> Double? {
        guard counter >= previous, elapsed.isFinite, elapsed > 0 else { return nil }
        return Double(counter - previous) / elapsed
    }
}
