import XCTest
@testable import PithCore

final class RangeTests: XCTestCase {
    func testSystemAverageAndPeakLeaveOutUnreadableSamples() throws {
        let history = record([(0, 10), (2, 20), (4, nil), (6, 40), (8, 50)])
        let all = try XCTUnwrap(history.systemCPU(in: 0...8))
        XCTAssertEqual(all.average, 30)
        XCTAssertEqual(all.peak, 50)
        XCTAssertEqual(history.systemCPU(in: 3...7), CPUSummary(average: 40, peak: 40))
        XCTAssertNil(history.systemCPU(in: 9...20), "No samples is unknown, not zero.")
        XCTAssertNil(history.systemCPU(in: 4...4), "A sample without a reading is unknown.")
    }

    func testAppAverageCountsTimeNotRunningAsIdle() throws {
        let busy = app("busy", cpu: 30)
        let busier = app("busy", cpu: 50)
        let history = record([(0, 10, []), (2, 10, [busy]), (4, 10, [busier]), (6, 10, []), (8, 10, [])])
        let usage = try XCTUnwrap(history.appUsage(in: 0...8)["busy"])
        XCTAssertEqual(usage.cpu, 16, "80 percent-samples spread over five samples.")
        XCTAssertEqual(usage.peakCPU, 50)
        XCTAssertNil(history.appUsage(in: 6...8)["busy"], "Apps that weren't running in the range are left out.")
    }

    func testAppAverageLeavesOutSamplesItCouldNotRead() throws {
        // The first sample of a process has no rate yet; a protected process never has one.
        let history = record([
            (0, 10, [app("new", cpu: nil), app("locked", cpu: nil, restricted: true)]),
            (2, 10, [app("new", cpu: 20), app("locked", cpu: nil, restricted: true)]),
            (4, 10, [app("new", cpu: 40), app("locked", cpu: nil, restricted: true)]),
        ])
        let usage = history.appUsage(in: 0...4)
        XCTAssertEqual(usage["new"]?.cpu, 30)
        XCTAssertNotNil(usage["locked"])
        XCTAssertNil(usage["locked"]?.cpu)
        XCTAssertNil(usage["locked"]?.peakCPU)
        XCTAssertNil(usage["locked"]?.read)
    }

    func testGapsStayGapsRatherThanIdleTime() throws {
        // Sampling stops during sleep: 2…100 has no samples, so it can't dilute the average.
        let history = record([(0, 10, [app("a", cpu: 10)]), (2, 10, [app("a", cpu: 30)]), (100, 10, [app("a", cpu: 50)]), (102, 10, [app("a", cpu: 70)])])
        XCTAssertEqual(history.appUsage(in: 0...102)["a"]?.cpu, 40)
        XCTAssertEqual(history.systemCPU(in: 0...102)?.average, 10)
    }

    func testMembershipAndMemoryComeFromEachSample() throws {
        let p1 = ProcessKey(pid: 1, started: 1), p2 = ProcessKey(pid: 2, started: 2), p3 = ProcessKey(pid: 3, started: 3)
        let history = record([
            (0, 10, [app("a", cpu: 0, memory: 100, members: [p1])]),
            (2, 10, [app("a", cpu: 0, memory: 300, members: [p1, p2])]),
            (4, 10, [app("a", cpu: 0, memory: nil, members: [p2, p3])]),
            (6, 10, []),
        ])
        let usage = try XCTUnwrap(history.appUsage(in: 0...6)["a"])
        XCTAssertEqual(usage.processes, 3)
        XCTAssertEqual(usage.memory, 200, "Memory is the footprint while running, from the samples that could read it.")
        XCTAssertEqual(history.appUsage(in: 0...2)["a"]?.processes, 2)
    }

    func testDiskRatesAverageLikeCPU() {
        let history = record([(0, 10, [app("a", cpu: 0, read: 100, written: 10)]), (2, 10, [])])
        XCTAssertEqual(history.appUsage(in: 0...2)["a"]?.read, 50)
        XCTAssertEqual(history.appUsage(in: 0...2)["a"]?.written, 5)
    }

    func testOneAppsUsageMatchesTheFullTable() {
        let history = record([(0, 10, [app("a", cpu: 30), app("b", cpu: 5)]), (2, 10, [app("b", cpu: 5)]), (4, 10, [app("a", cpu: 60)])])
        XCTAssertEqual(history.usage(of: "a", in: 0...4), history.appUsage(in: 0...4)["a"])
        XCTAssertEqual(history.usage(of: "a", in: 0...4)?.cpu, 30)
        XCTAssertNil(history.usage(of: "a", in: 2...2))
        XCTAssertNil(history.usage(of: "missing", in: 0...4))
    }

    func testDatesFollowTheLatestSample() {
        let history = record([(100, 10), (102, 10)])
        XCTAssertEqual(history.date(at: 90), Date(timeIntervalSince1970: 90))
        XCTAssertNil(SessionHistory().date(at: 0))
    }

    func testTimeAxisTicksLandOnWholeMinutesAndKeepClearOfNow() {
        // 10:43:30 local-agnostic: 1_800_000_210 s is 30 s past a whole minute.
        let now = Date(timeIntervalSince1970: 1_800_000_210)
        let ticks = TimeAxis.ticks(endingAt: 1000, date: now, span: 600, stepMinutes: 2, clearance: 45)
        let dates = ticks.map { now.addingTimeInterval($0 - 1000).timeIntervalSince1970 }
        XCTAssertFalse(ticks.isEmpty)
        XCTAssertTrue(dates.allSatisfy { $0.truncatingRemainder(dividingBy: 120) == 0 }, "\(dates)")
        XCTAssertTrue(ticks.allSatisfy { $0 >= 400 && $0 <= 1000 - 45 }, "\(ticks)")
        XCTAssertEqual(ticks, ticks.sorted())
        XCTAssertEqual(ticks.count, 5)
    }

    // MARK: - Fixtures

    private func app(_ id: String, cpu: Double?, memory: UInt64? = 10, read: Double? = 0, written: Double? = 0, members: [ProcessKey]? = nil, restricted: Bool = false) -> AppSample {
        AppSample(id: id, identity: ProcessIdentity(path: "/usr/local/bin/\(id)", processName: id, bundleName: nil), executable: "/usr/local/bin/\(id)",
            members: members ?? [ProcessKey(pid: 1, started: 1)], cpu: cpu, memory: memory, read: restricted ? nil : read, written: restricted ? nil : written,
            restricted: restricted, openedBy: nil)
    }

    private func record(_ samples: [(Double, Double?)]) -> SessionHistory {
        record(samples.map { ($0.0, $0.1, []) })
    }

    private func record(_ samples: [(Double, Double?, [AppSample])]) -> SessionHistory {
        var history = SessionHistory()
        for (time, cpu, apps) in samples {
            history.append(ActivitySnapshot(date: Date(timeIntervalSince1970: time), uptime: time, cpu: cpu, pressure: .normal, apps: apps, error: nil))
        }
        return history
    }
}
