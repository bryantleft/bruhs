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

    private func writing(_ seconds: Double, _ apps: [(id: String, cpu: Double, written: Double)]) -> ActivitySnapshot {
        let samples = apps.map { AppSample(id: $0.id, name: $0.id, executable: "/Applications/\($0.id).app", members: [], cpu: $0.cpu, memory: 100,
                                           read: nil, written: $0.written, restricted: false) }
        return ActivitySnapshot(date: base.addingTimeInterval(seconds), uptime: seconds, cpu: 10, pressure: .normal, apps: samples, error: nil,
                                memory: MemoryUse(physical: 1000, used: 500, app: 400, wired: 50, compressed: 50, cached: 100, swapUsed: 10, swapTotal: 100))
    }

    func testBucketsKeepWhatEachAppWroteToDisk() throws {
        var history = LongHistory()
        // Twenty apps busier by CPU and memory, and one quiet app writing a megabyte a second.
        let busy = (0..<20).map { (id: "busy\($0)", cpu: Double(10 + $0), written: 0.0) }
        for second in stride(from: 0.0, to: 62, by: 2) { history.record(writing(second, busy + [(id: "writer", cpu: 0.1, written: 1_000_000)])) }
        let first = try XCTUnwrap(history.halfMinute.first?.apps.first { $0.id == "writer" }, "kept for what it wrote")
        // The first sample has no earlier one to measure from, so 14 of its 15 samples count, two seconds each.
        XCTAssertEqual(first.written, 28_000_000)
        XCTAssertEqual(history.halfMinute[1].apps.first { $0.id == "writer" }?.written, 30_000_000)
        let written = try XCTUnwrap(history.written(in: base...base.addingTimeInterval(60)))
        XCTAssertEqual(written.apps.first?.id, "writer")
        XCTAssertEqual(written.apps.first?.bytes, 58_000_000)
        XCTAssertEqual(written.from, base)
        XCTAssertNil(history.written(in: base.addingTimeInterval(-7200)...base.addingTimeInterval(-3600)), "nothing kept from before")
    }

    func testAHistoryKeptBeforeWritesWereCountedStillLoads() throws {
        var history = LongHistory()
        for second in stride(from: 0.0, to: 62, by: 2) { history.record(writing(second, [(id: "a", cpu: 5, written: 1000)])) }
        // Strip every trace of writes, as in a file saved by the version before.
        func strip(_ value: Any) -> Any {
            if let object = value as? [String: Any] {
                return object.filter { !["written", "appWritten", "lastUptime"].contains($0.key) }.mapValues(strip)
            }
            if let array = value as? [Any] { return array.map(strip) }
            return value
        }
        let old = try JSONSerialization.data(withJSONObject: strip(JSONSerialization.jsonObject(with: JSONEncoder().encode(history))))
        let loaded = try JSONDecoder().decode(LongHistory.self, from: old)
        XCTAssertEqual(loaded.halfMinute.count, history.halfMinute.count)
        XCTAssertNil(loaded.halfMinute.first?.apps.first?.written)
        XCTAssertEqual(loaded.written(in: base...base.addingTimeInterval(60))?.apps.count, 0, "no writes recorded, none invented")
    }
}
