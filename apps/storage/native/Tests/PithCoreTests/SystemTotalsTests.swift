import XCTest
import PithSystem
@testable import PithCore

final class SystemTotalsTests: XCTestCase {
    func testTotalsCaptureContainsNoProcessesOrNetwork() throws {
        let capture = pith_read_totals()
        defer { pith_free(capture) }
        XCTAssertNil(capture.processes)
        XCTAssertEqual(capture.count, 0)
        XCTAssertEqual(capture.unavailable_processes, 0)
        XCTAssertEqual(capture.error_code, 0)
        XCTAssertEqual(capture.network_valid, 0)
        XCTAssertEqual(capture.network_in, 0)
        XCTAssertEqual(capture.network_out, 0)
        XCTAssertEqual(capture.cpu_valid, 1)
        XCTAssertGreaterThan(capture.total_ticks, 0)
        XCTAssertEqual(capture.coreTicks.count, ProcessInfo.processInfo.processorCount)
        XCTAssertNotNil(capture.memoryUse)
    }

    func testTotalsAt150MillisecondsReadCPUAndMemoryAndResetTheirBaselines() async throws {
        let sampler = SystemTotalsSampler()
        let first = await sampler.sample()
        XCTAssertNil(first.cpu)
        XCTAssertTrue(first.tiers.allSatisfy { $0.busy == nil })
        try await Task.sleep(for: .milliseconds(150))
        let second = await sampler.sample()
        let cpu = try XCTUnwrap(second.cpu)
        XCTAssertTrue((0...100).contains(cpu))
        XCTAssertGreaterThanOrEqual(second.uptime - first.uptime, 0.15)
        XCTAssertGreaterThan(second.date, first.date)
        let memory = try XCTUnwrap(second.memory)
        XCTAssertEqual(memory.physical, ProcessInfo.processInfo.physicalMemory)
        XCTAssertGreaterThan(memory.used, 0)
        XCTAssertLessThanOrEqual(memory.used, memory.physical)
        XCTAssertLessThanOrEqual(memory.wired, memory.used)
        if let swapUsed = memory.swapUsed, let swapTotal = memory.swapTotal { XCTAssertLessThanOrEqual(swapUsed, swapTotal) }
        let layout = SystemSampler.readTierLayout()
        XCTAssertEqual(second.tiers.map(\.name), layout.map(\.name))
        XCTAssertEqual(second.tiers.map(\.cores), layout.map(\.cores))
        XCTAssertTrue(second.tiers.allSatisfy { $0.busy.map { (0...100).contains($0) } ?? false })

        await sampler.reset()
        let reset = await sampler.sample()
        XCTAssertNil(reset.cpu)
        XCTAssertTrue(reset.tiers.allSatisfy { $0.busy == nil })
        XCTAssertNotNil(reset.memory, "memory does not depend on an earlier reading")
        try await Task.sleep(for: .milliseconds(150))
        let afterReset = await sampler.sample()
        XCTAssertNotNil(afterReset.cpu)
    }

    func testInterleavingTotalsAndFullSamplerKeepsIndependentWindows() async throws {
        let full = SystemSampler()
        let fast = SystemTotalsSampler()
        let firstFull = await full.sample()
        XCTAssertNil(firstFull.cpu)
        try await Task.sleep(for: .milliseconds(150))
        let firstFast = await fast.sample()
        XCTAssertNil(firstFast.cpu, "the full sampler's baseline must not prime the fast sampler")
        try await Task.sleep(for: .milliseconds(150))
        let secondFast = await fast.sample()
        XCTAssertNotNil(secondFast.cpu)
        await fast.reset()
        try await Task.sleep(for: .milliseconds(150))
        let secondFull = await full.sample()
        XCTAssertNotNil(secondFull.cpu, "resetting fast totals must not clear the full sampler's baseline")

        // Each process's counter is divided by the full sampler's elapsed time, spanning the fast readings.
        let fullElapsed = secondFull.uptime - firstFull.uptime
        XCTAssertGreaterThanOrEqual(fullElapsed, 0.45)
        let fastElapsed = secondFast.uptime - firstFast.uptime
        XCTAssertGreaterThan(fullElapsed, fastElapsed * 2)
        let own = try XCTUnwrap(secondFull.processes.first { $0.key.pid == ProcessInfo.processInfo.processIdentifier })
        XCTAssertNotNil(own.cpu)
        XCTAssertNotNil(own.cores)

        let resetFast = await fast.sample()
        XCTAssertNil(resetFast.cpu, "later full readings must not prime a reset fast sampler")
        await full.reset()
        try await Task.sleep(for: .milliseconds(150))
        let nextFast = await fast.sample()
        XCTAssertNotNil(nextFast.cpu, "resetting the full sampler must not clear fast totals")
        let resetFull = await full.sample()
        XCTAssertNil(resetFull.cpu)
    }
}
