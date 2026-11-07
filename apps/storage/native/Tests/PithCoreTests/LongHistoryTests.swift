import XCTest
@testable import PithCore

final class LongHistoryTests: XCTestCase {
    private let base = Date(timeIntervalSince1970: 1_800_000_000) // on a 5-minute boundary

    private func snapshot(_ seconds: Double, cpu: Double, apps: [(String, Double, UInt64)], pressure: MemoryPressure = .normal) -> ActivitySnapshot {
        let samples = apps.map { AppSample(id: $0.0, name: $0.0, executable: "/Applications/\($0.0).app", members: [], cpu: $0.1, memory: $0.2, read: nil, written: nil, restricted: false) }
        return ActivitySnapshot(date: base.addingTimeInterval(seconds), uptime: seconds, cpu: cpu, pressure: pressure, apps: samples, error: nil,
                                memory: MemoryUse(physical: 1000, used: 500, app: 400, wired: 50, compressed: 50, cached: 100, swapUsed: 10, swapTotal: 100))
    }

    func testSamplesCloseIntoThirtySecondBuckets() {
        var history = LongHistory()
        for second in stride(from: 0.0, to: 62, by: 2) { history.record(snapshot(second, cpu: second < 30 ? 10 : 30, apps: [("a", 5, 100)])) }
        XCTAssertEqual(history.halfMinute.count, 2, "0 to 30 and 30 to 60 have closed; 60 is still filling")
        XCTAssertEqual(history.halfMinute[0].cpu, 10)
        XCTAssertEqual(history.halfMinute[1].cpu, 30)
        XCTAssertEqual(history.halfMinute[0].apps.first?.cpu, 5)
        XCTAssertEqual(history.identities["a"]?.name, "a")
    }

    func testABucketKeepsTheBusiestAppsByCPUAndByMemory() {
        var history = LongHistory()
        let apps = (0..<20).map { ("app\($0)", Double($0), UInt64(1000 - $0)) }
        history.record(snapshot(0, cpu: 50, apps: apps))
        history.record(snapshot(30, cpu: 50, apps: apps))
        let kept = Set(history.halfMinute[0].apps.map(\.id))
        XCTAssertTrue(kept.isSuperset(of: ["app19", "app18", "app14"]), "the busiest by CPU")
        XCTAssertTrue(kept.isSuperset(of: ["app0", "app1", "app5"]), "the largest by memory")
        XCTAssertLessThanOrEqual(kept.count, 2 * LongHistory.appsPerBucket)
    }

    func testThirtySecondBucketsRollIntoFiveMinuteOnes() {
        var history = LongHistory()
        for second in stride(from: 0.0, through: 630, by: 30) {
            history.record(snapshot(second, cpu: second < 300 ? 20 : 40, apps: [("a", 1, 1)], pressure: second == 120 ? .warning : .normal))
        }
        // 0 to 300 and 300 to 600 have closed once the 30-second bucket after each closed.
        XCTAssertEqual(history.fiveMinute.count, 2)
        XCTAssertEqual(history.fiveMinute[0].cpu ?? 0, 20, accuracy: 0.001)
        XCTAssertEqual(history.fiveMinute[1].cpu ?? 0, 40, accuracy: 0.001)
        XCTAssertEqual(history.fiveMinute[0].pressure, .warning, "a bucket keeps its worst pressure")
        XCTAssertEqual(history.buckets(.sevenDays, now: base.addingTimeInterval(630)).count, 3, "the filling bucket reaches now")
    }

    func testUsageAcrossARangeAveragesTheBuckets() {
        var history = LongHistory()
        for second in stride(from: 0.0, through: 90, by: 30) { history.record(snapshot(second, cpu: 10, apps: [("a", second < 30 ? 10 : 30, 200)])) }
        let usage = history.usage(in: base...base.addingTimeInterval(60), span: .sixHours)
        XCTAssertEqual(usage["a"]?.cpu ?? 0, 20, accuracy: 0.001)
        XCTAssertEqual(usage["a"]?.memory, 200)
    }

    func testOldBucketsAgeOut() {
        var history = LongHistory()
        history.record(snapshot(0, cpu: 1, apps: []))
        history.record(snapshot(30, cpu: 1, apps: []))
        history.record(snapshot(7 * 3600, cpu: 1, apps: []))
        XCTAssertTrue(history.halfMinute.allSatisfy { $0.end >= base.addingTimeInterval(3600) }, "six hours of 30-second buckets")
    }

    func testItSurvivesARoundTripThroughJSON() throws {
        var history = LongHistory()
        for second in stride(from: 0.0, to: 61, by: 2) { history.record(snapshot(second, cpu: 10, apps: [("a", 1, 1)])) }
        let decoded = try JSONDecoder().decode(LongHistory.self, from: JSONEncoder().encode(history))
        XCTAssertEqual(decoded.halfMinute, history.halfMinute)
        XCTAssertEqual(decoded.identities, history.identities)
    }
}
