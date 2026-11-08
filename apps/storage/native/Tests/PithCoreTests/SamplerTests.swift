import XCTest
@testable import PithCore

final class SamplerTests: XCTestCase {
    func testMemoryCountsAsActivityMonitorDoes() {
        // Pages of 16 KB: 100 active, 50 inactive, 10 speculative, 40 wired, 20 compressed, 5 purgeable, 30 file-backed.
        let memory = MemoryUse(pages: (100, 50, 10, 40, 20, 5, 30), pageSize: 16_384, physical: 1 << 32, swapUsed: 0, swapTotal: 0)
        XCTAssertEqual(memory.used, (100 + 50 + 10 + 40 + 20 - 5 - 30) * 16_384)
        XCTAssertEqual(memory.wired, 40 * 16_384)
        XCTAssertEqual(memory.compressed, 20 * 16_384)
        XCTAssertEqual(memory.app, memory.used - memory.wired - memory.compressed)
        XCTAssertEqual(memory.cached, 35 * 16_384)
    }

    func testTiersSplitTheCoresLowestFirst() {
        let layout = [(name: "Efficiency", cores: 2), (name: "Performance", cores: 2)]
        let before: [(busy: UInt64, total: UInt64)] = [(0, 0), (0, 0), (0, 0), (0, 0)]
        let after: [(busy: UInt64, total: UInt64)] = [(100, 100), (50, 100), (0, 100), (10, 100)]
        let tiers = SystemSampler.tiers(layout, current: after, previous: before)
        XCTAssertEqual(tiers.map(\.name), ["Efficiency", "Performance"])
        XCTAssertEqual(tiers[0].busy, 75)
        XCTAssertEqual(tiers[1].busy, 5)
        XCTAssertNil(SystemSampler.tiers(layout, current: after, previous: []).first?.busy, "the first reading has nothing to compare with")
        XCTAssertTrue(SystemSampler.tiers(layout, current: Array(after.prefix(3)), previous: before).isEmpty, "a layout that doesn't match the CPUs gives no tiers")
    }

    func testThisMacsTiersAddUpToItsCores() throws {
        let layout = SystemSampler.readTierLayout()
        guard !layout.isEmpty else { throw XCTSkip("One CPU tier, such as in a virtual machine") }
        XCTAssertEqual(layout.reduce(0) { $0 + $1.cores }, ProcessInfo.processInfo.processorCount)
    }

    func testUnattributedCPUIsWhatNoReadableAppAccountsFor() {
        let apps = [AppSample(id: "a", name: "A", executable: "/a", members: [], cpu: 10, memory: nil, read: nil, written: nil, restricted: false),
                    AppSample(id: "b", name: "B", executable: "/b", members: [], cpu: nil, memory: nil, read: nil, written: nil, restricted: true)]
        let snapshot = ActivitySnapshot(date: Date(), uptime: 0, cpu: 25, pressure: .normal, apps: apps, error: nil)
        XCTAssertEqual(snapshot.unattributedCPU, 15)
        XCTAssertEqual(ActivitySnapshot(date: Date(), uptime: 0, cpu: 5, pressure: .normal, apps: apps, error: nil).unattributedCPU, 0, "never negative")
    }

    func testAProcessPinningOneCoreIsCalledOut() {
        let pinned = AppSample(id: "a", name: "A", executable: "/a", members: [], cpu: 8.3, memory: nil, read: nil, written: nil, restricted: false, cores: 0.99)
        XCTAssertTrue(pinned.holdsACore)
        XCTAssertFalse(AppSample(id: "b", name: "B", executable: "/b", members: [], cpu: 8.3, memory: nil, read: nil, written: nil, restricted: false, cores: 0.5).holdsACore)
    }

    func testTheSamplerReadsMemoryPowerAndTiers() async throws {
        let sampler = SystemSampler()
        _ = await sampler.sample()
        try await Task.sleep(for: .milliseconds(300))
        let sample = await sampler.sample()
        let memory = try XCTUnwrap(sample.memory)
        XCTAssertGreaterThan(memory.used, 0)
        XCTAssertLessThanOrEqual(memory.used, memory.physical)
        let own = sample.processes.first { $0.key.pid == ProcessInfo.processInfo.processIdentifier }
        XCTAssertNotNil(own?.power, "a process's own energy is readable")
        XCTAssertNotNil(own?.cores)
        if !SystemSampler.readTierLayout().isEmpty { XCTAssertTrue(sample.tiers.allSatisfy { $0.busy != nil }) }
        XCTAssertNotNil(sample.networkIn, "interface counters are public")
        if let gpu = sample.gpu { XCTAssertTrue((0...100).contains(gpu)) }
        if let battery = sample.battery { XCTAssertTrue((0...100).contains(battery.percent)) }
    }

    func testTheSamplerCountsWhatAProcessMovesOverTheNetwork() async throws {
        try XCTSkipUnless(SystemSampler.countsNetwork, "macOS's private network statistics didn't load here")
        let sampler = SystemSampler()
        let before = await sampler.sample()
        let pair = try LoopbackPair()
        defer { pair.close() }
        let bytes = 4 << 20
        try pair.move(bytes)
        let after = await sampler.sample()
        let own = try XCTUnwrap(after.processes.first { $0.key.pid == getpid() })
        let moved = try XCTUnwrap(own.network) * (after.uptime - before.uptime)
        // One socket counts what it sent and the other what it received, and both are this process's.
        XCTAssertEqual(moved, Double(2 * bytes), accuracy: Double(bytes) / 16)
        XCTAssertNotNil(after.apps.first { $0.members.contains(own.key) }?.network)
    }
}

/// A connected pair of loopback TCP sockets in this process.
private struct LoopbackPair {
    let client: Int32, server: Int32

    init() throws {
        let listener = socket(AF_INET, SOCK_STREAM, 0)
        guard listener >= 0 else { throw POSIXError(.EBADF) }
        defer { Darwin.close(listener) }
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        var length = socklen_t(MemoryLayout<sockaddr_in>.size)
        let client = socket(AF_INET, SOCK_STREAM, 0)
        let connected = withUnsafeMutablePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { address in
                bind(listener, address, length) == 0 && listen(listener, 1) == 0 && getsockname(listener, address, &length) == 0
                    && connect(client, address, length) == 0
            }
        }
        let server = accept(listener, nil, nil)
        guard client >= 0, connected, server >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        self.client = client; self.server = server
    }

    /// Sends `count` bytes from the client and reads each 32 KB at the server before the next, well under the 128 KB
    /// socket buffers, so neither side blocks.
    func move(_ count: Int) throws {
        let chunk = [UInt8](repeating: 7, count: 32_768)
        var sink = [UInt8](repeating: 0, count: chunk.count)
        var left = count
        while left > 0 {
            let size = min(left, chunk.count)
            var sent = 0, received = 0
            while sent < size {
                let n = chunk.withUnsafeBytes { write(client, $0.baseAddress! + sent, size - sent) }
                guard n > 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
                sent += n
            }
            while received < size {
                let n = sink.withUnsafeMutableBytes { read(server, $0.baseAddress!, size - received) }
                guard n > 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
                received += n
            }
            left -= size
        }
    }

    func close() { Darwin.close(client); Darwin.close(server) }
}
