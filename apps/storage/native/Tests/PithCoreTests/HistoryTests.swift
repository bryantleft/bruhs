import XCTest
import Darwin
@testable import PithCore

final class HistoryTests: XCTestCase {
    func testExitedAppsRemainSearchableAndExpireAfterTenMinutes() {
        var history = SessionHistory()
        let key = ProcessKey(pid: 123, started: 1)
        let app = AppSample(id: key.id, identity: ProcessIdentity(path: "/gone", processName: "Gone app", bundleName: nil), executable: "/gone", members: [key], cpu: 40, memory: 10, read: 0, written: 0, restricted: false, openedBy: nil)
        history.append(snapshot(0, apps: [app]))
        history.append(snapshot(599, apps: []))
        XCTAssertEqual(history.apps[key.id]?.isRunning, false)
        XCTAssertEqual(history.apps[key.id]?.points.first?.cpu, 40)
        history.append(snapshot(601, apps: []))
        XCTAssertNil(history.apps[key.id])
    }

    func testOnlyReadingsOlderThanTenMinutesExpire() {
        var history = SessionHistory()
        let key = ProcessKey(pid: 7, started: 1)
        let app = AppSample(id: key.id, name: "Steady", executable: "/steady", members: [key], cpu: 1, memory: 1, read: 0, written: 0, restricted: false)
        for second in stride(from: 0.0, through: 600, by: 1) { history.append(snapshot(second, apps: [app])) }
        // At 600 s the reading from 0 s is exactly ten minutes old, which still counts.
        XCTAssertEqual(history.system.first?.uptime, 0)
        XCTAssertEqual(history.apps[key.id]?.points.first?.uptime, 0)
        history.append(snapshot(603, apps: [app]))
        XCTAssertEqual(history.system.map(\.uptime).prefix(2), [3, 4], "0, 1 and 2 s went, together")
        XCTAssertEqual(history.apps[key.id]?.points.first?.uptime, 3)
        XCTAssertEqual(history.apps[key.id]?.points.count, 599)
    }

    func testPIDReuseCreatesSeparateTimelinesAndPreservesGap() {
        var history = SessionHistory()
        for (time, start) in [(0.0, UInt64(1)), (60.0, UInt64(2))] {
            let key = ProcessKey(pid: 123, started: start)
            let app = AppSample(id: key.id, identity: ProcessIdentity(path: "/app", processName: "App", bundleName: nil), executable: "/app", members: [key], cpu: nil, memory: nil, read: nil, written: nil, restricted: true, openedBy: nil)
            history.append(snapshot(time, apps: [app]))
        }
        XCTAssertEqual(history.apps.count, 2)
        XCTAssertEqual(history.system.map(\.uptime), [0, 60])
        XCTAssertNil(history.apps["123:2"]?.points.first?.cpu)
    }

    func testLiveSamplerCanReadOwnProcessWithoutRoot() async {
        let sampler = SystemSampler()
        let sample = await sampler.sample()
        let own = sample.apps.first { $0.members.contains { $0.pid == ProcessInfo.processInfo.processIdentifier } }
        XCTAssertNotNil(own)
        XCTAssertNotNil(own?.memory)
        XCTAssertGreaterThan(own?.memory ?? 0, 0, "A successful rusage read must contain the live test process's footprint.")
        XCTAssertNil(sample.error)
    }

    func testLiveSamplerNamesAProcessAndWhoOpenedIt() async throws {
        // A child of this test process has a known opener, however the test runner itself was started.
        let child = Process()
        child.executableURL = URL(fileURLWithPath: "/bin/sleep")
        child.arguments = ["10"]
        try child.run()
        defer { child.terminate() }
        let sample = await SystemSampler().sample()
        let pid = ProcessInfo.processInfo.processIdentifier
        let own = try XCTUnwrap(sample.apps.first { $0.members.contains { $0.pid == pid } })
        let sleeper = try XCTUnwrap(sample.apps.first { $0.members.contains { $0.pid == child.processIdentifier } })
        XCTAssertEqual(sleeper.identity.kind, .system)
        XCTAssertEqual(sleeper.name, "sleep")
        XCTAssertEqual(sleeper.openedBy, own.name)
        let process = try XCTUnwrap(sample.processes.first { $0.key.pid == child.processIdentifier })
        XCTAssertEqual(process.path, "/bin/sleep")
        XCTAssertEqual(process.parent, pid)
    }

    func testLiveCPUTimeMatchesGetrusageRatherThanRawMachTicks() async throws {
        let sampler = SystemSampler()
        // A first sample does one-time work after its reading (bundle names, identities, IOKit), which this process's
        // CPU between two readings includes but getrusage's window below doesn't. Warm up first, as the app runs warm.
        _ = await sampler.sample()
        let first = await sampler.sample()
        func cpuTime() -> Double {
            var usage = rusage()
            getrusage(RUSAGE_SELF, &usage)
            return Double(usage.ru_utime.tv_sec + usage.ru_stime.tv_sec)
                + Double(usage.ru_utime.tv_usec + usage.ru_stime.tv_usec) / 1_000_000
        }
        let before = cpuTime()
        var work = 0.0
        while cpuTime() - before < 0.1 {
            for i in 1...1000 { work += sqrt(Double(i)) }
        }
        let second = await sampler.sample()
        let consumed = cpuTime() - before
        let own = second.apps.first { $0.members.contains { $0.pid == ProcessInfo.processInfo.processIdentifier } }
        let measured = try XCTUnwrap(own?.cpu) / 100 * Double(ProcessInfo.processInfo.activeProcessorCount) * (second.uptime - first.uptime)
        XCTAssertEqual(measured, consumed, accuracy: consumed * 0.3)
        XCTAssertGreaterThan(work, 0)
    }

    func testRepeatedSamplesDoNotLeakHostPortReferences() async {
        let host = mach_host_self()
        defer { mach_port_deallocate(mach_task_self_, host) }
        var before: mach_port_urefs_t = 0
        XCTAssertEqual(mach_port_get_refs(mach_task_self_, host, mach_port_right_t(MACH_PORT_RIGHT_SEND), &before), KERN_SUCCESS)
        let sampler = SystemSampler()
        for _ in 0..<25 { _ = await sampler.sample() }
        var after: mach_port_urefs_t = 0
        XCTAssertEqual(mach_port_get_refs(mach_task_self_, host, mach_port_right_t(MACH_PORT_RIGHT_SEND), &after), KERN_SUCCESS)
        XCTAssertEqual(after, before)
    }

    private func snapshot(_ uptime: Double, apps: [AppSample]) -> ActivitySnapshot {
        ActivitySnapshot(date: Date(timeIntervalSince1970: uptime), uptime: uptime, cpu: nil, pressure: .normal, apps: apps, error: nil)
    }
}
