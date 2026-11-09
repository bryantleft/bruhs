import XCTest
@testable import PithCore

final class LiveIndexTests: XCTestCase {
    func testReportsDecodeAsTheScannerWritesThem() throws {
        let decode = { (line: String) in try LiveDecoder.decode(Data(line.utf8)) }
        guard case .opened(let opened) = try decode(#"{"type":"opened","restored":true,"through":42,"savedAt":1700000000,"folders":12,"locked":false}"#) else {
            return XCTFail("not an opening")
        }
        XCTAssertEqual(opened, LiveOpened(restored: true, through: 42, savedAt: Date(timeIntervalSince1970: 1_700_000_000), folders: 12, reason: nil, locked: false))
        guard case .opened(let fresh) = try decode(#"{"type":"opened","restored":false,"reason":"there's no saved map yet","locked":true}"#) else {
            return XCTFail("not an opening")
        }
        XCTAssertFalse(fresh.restored)
        XCTAssertTrue(fresh.locked)
        guard case .status(let status) = try decode(#"{"type":"status","through":9,"pending":3,"changed":true,"checking":false,"historyDone":true}"#) else {
            return XCTFail("not a status")
        }
        XCTAssertEqual(status, LiveStatus(through: 9, pending: 3, changed: true, checking: false, historyDone: true))
        guard case .checked(let check) = try decode(#"{"type":"checked","folders":100,"corrected":2,"bytes":4096,"ms":900}"#) else {
            return XCTFail("not a check")
        }
        XCTAssertEqual(check.corrected, 2)
        guard case .failed(let request, let reason) = try decode(#"{"type":"error","request":7,"reason":"The map has no folder at /x."}"#) else {
            return XCTFail("not a failure")
        }
        XCTAssertEqual(request, 7)
        XCTAssertEqual(reason, "The map has no folder at /x.")
        guard case .fatal = try decode(#"{"type":"fatal","reason":"no"}"#) else { return XCTFail("not fatal") }
        XCTAssertThrowsError(try decode(#"{"type":"surprise"}"#))
    }

    func testATreeIsCheckedLikeAScanResult() throws {
        let tree = #"{"type":"tree","request":3,"result":{"type":"result","version":4,"root":{"name":"x","path":"/x","size":10,"kind":"dir","files":1,"children":[]},"topFiles":[],"volumes":[],"unreadableFolders":[],"summary":{"dirs":1,"files":1,"bytes":10,"errors":0,"unreadable":{"protected":0,"denied":0,"other":0},"entryErrors":0,"cloudOnly":{"files":0,"bytes":0,"folders":0},"clones":{"files":0,"bytes":0},"elapsedMs":5,"engine":"bulk"}}}"#
        guard case .tree(let request, let result, let json) = try LiveDecoder.decode(Data(tree.utf8)) else { return XCTFail("not a tree") }
        XCTAssertEqual(request, 3)
        XCTAssertEqual(result.root.size, 10)
        // The page gets the result object exactly as the scanner wrote it.
        XCTAssertTrue(json.hasPrefix(#"{"type":"result","version":4"#) && json.hasSuffix(#""engine":"bulk"}}"#))
        XCTAssertEqual(try JSONDecoder().decode(DiskResult.self, from: Data(json.utf8)).root.path, "/x")
        // The same checks as a scan's result: a map of another version is refused.
        XCTAssertThrowsError(try LiveDecoder.decode(Data(tree.replacingOccurrences(of: #""version":4"#, with: #""version":3"#).utf8)))
    }

    func testASavedMapCatchesUpOnlyWhileHistoryReachesItCheaply() {
        let saved = Date(timeIntervalSince1970: 1_700_000_000)
        let reaches: (Date) -> UInt64 = { _ in 500 }
        XCTAssertEqual(LivePlan.after(through: 1_000, savedAt: saved, current: 2_000, historyStart: reaches), .replay(since: 1_000))
        guard case .rebuild = LivePlan.after(through: 1_000, savedAt: saved, current: 1_000 + LivePlan.replayLimit + 1, historyStart: reaches) else {
            return XCTFail("a replay past the limit costs as much as a walk")
        }
        guard case .rebuild = LivePlan.after(through: 1_000, savedAt: saved, current: 2_000, historyStart: { _ in 0 }) else {
            return XCTFail("history that doesn't reach the save can't catch it up")
        }
        guard case .rebuild = LivePlan.after(through: 5_000, savedAt: saved, current: 2_000, historyStart: reaches) else {
            return XCTFail("IDs that started over mean nothing")
        }
    }

    func testTheTimeLookupTakesSecondsSince1970() {
        // A minute ago is well within any Mac's history, so the answer is an event ID; given 2001-based seconds the
        // same call answers 0.
        let id = LivePlan.lastEvent(before: Date().addingTimeInterval(-60), onVolumeOf: NSTemporaryDirectory())
        XCTAssertGreaterThan(id, 0)
        XCTAssertLessThanOrEqual(id, DiskWatcher.currentEventID)
    }

    /// Review finding: every folder went to the live map, another disk's included, which it never holds.
    func testOnlyFoldersOfTheMapsOwnVolumeComeFromIt() {
        XCTAssertTrue(LivePlan.holds("/Users", mapOf: "/"))
        XCTAssertTrue(LivePlan.holds("/private/var", mapOf: "/"))
        XCTAssertTrue(LivePlan.holds(NSTemporaryDirectory(), mapOf: "/"))
        // Volumes of their own, which the map stops at and shows only by their used space.
        XCTAssertFalse(LivePlan.holds("/System/Volumes/Preboot", mapOf: "/"))
        XCTAssertFalse(LivePlan.holds("/System/Volumes/VM", mapOf: "/"))
        XCTAssertFalse(LivePlan.holds("/Users", mapOf: "/Applications"))
    }

    /// Review finding: a scanner that exited mid-write killed Pith with SIGPIPE.
    func testWritingToAScannerThatExitedDoesntStopPith() throws {
        let gone = expectation(description: "the scanner exits")
        let process = LiveProcess(binary: URL(fileURLWithPath: "/usr/bin/true"), receive: { _ in }, exited: { _ in gone.fulfill() })
        try process.start()
        wait(for: [gone], timeout: 5)
        for _ in 0..<100 { process.walk(since: 1) }
        process.close()
        // Still here: the writes failed as errors on the commands' own queue.
        let drained = expectation(description: "the writes are done")
        DispatchQueue.global().asyncAfter(deadline: .now() + 0.5) { drained.fulfill() }
        wait(for: [drained], timeout: 5)
    }

    func testTheStreamNamesEachItemWithItsInode() throws {
        let folder = try temporaryFolder().resolvingSymlinksInPath()
        defer { try? FileManager.default.removeItem(at: folder) }
        let file = folder.appendingPathComponent("item.txt")
        let heard = expectation(description: "the file's event")
        let inode = LockedValue<UInt64>(0)
        // FSEvents names it at its /private path, which Foundation's resolving leaves off.
        let stream = LiveStream(root: folder.path, since: DiskWatcher.currentEventID, replay: false) { events in
            for event in events where event.path.hasSuffix("/item.txt") && event.inode != 0 {
                if inode.set(event.inode) { heard.fulfill() }
            }
        }
        XCTAssertNotNil(stream)
        try Data("hi".utf8).write(to: file)
        wait(for: [heard], timeout: 10)
        stream?.stop()
        let attributes = try FileManager.default.attributesOfItem(atPath: file.path)
        XCTAssertEqual(inode.value, (attributes[.systemFileNumber] as? NSNumber)?.uint64Value)
    }

    func testTheScannerKeepsAFolderCurrentOverItsPipes() throws {
        let storage = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let binary = storage.appendingPathComponent("scanner/target/release/storage-scanner")
        guard FileManager.default.isExecutableFile(atPath: binary.path) else { throw XCTSkip("Build the Rust scanner before running integration tests") }
        let folder = try temporaryFolder().resolvingSymlinksInPath()
        defer { try? FileManager.default.removeItem(at: folder) }
        try FileManager.default.createDirectory(at: folder.appendingPathComponent("sub"), withIntermediateDirectories: true)
        try Data(count: 50_000).write(to: folder.appendingPathComponent("sub/one.bin"))
        let reports = LockedValue<[LiveReport]>([])
        let process = LiveProcess(binary: binary, receive: { report in reports.update { $0.append(report) } }, exited: { _ in })
        try process.start()
        defer { process.terminate() }
        process.open(root: folder.path, snapshot: nil, volume: nil)
        let since = DiskWatcher.currentEventID
        let stream = LiveStream(root: folder.path, since: since, replay: false) { events in process.events(events) }
        defer { stream?.stop() }
        process.walk(since: since)
        XCTAssertTrue(waitFor(reports) { if case .walked = $0 { return true }; return false })
        try Data(count: 100_000).write(to: folder.appendingPathComponent("sub/two.bin"))
        let scanned = try runScan(binary: binary, root: folder)
        // The file's event goes to the scanner, which lists its folder once it settles: the map then matches a scan.
        var size: UInt64?
        let deadline = Date().addingTimeInterval(20)
        var request = 0
        while size != scanned, Date() < deadline {
            request += 1
            process.tree(path: folder.path, focus: nil, request: request)
            let asked = request
            _ = waitFor(reports, timeout: 2) { if case .tree(asked, let result, _) = $0 { size = result.root.size; return true }; return false }
            RunLoop.current.run(until: Date().addingTimeInterval(0.5))
        }
        XCTAssertEqual(size, scanned)
    }

    private func runScan(binary: URL, root: URL) throws -> UInt64 {
        let process = Process(), output = Pipe()
        process.executableURL = binary
        process.arguments = ["scan", "--root", root.path]
        process.standardOutput = output
        try process.run()
        let data = output.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        let last = data.split(separator: 10).last.map { Data($0) } ?? Data()
        return try JSONDecoder().decode(DiskResult.self, from: last).root.size
    }

    private func waitFor(_ reports: LockedValue<[LiveReport]>, timeout: TimeInterval = 15, _ match: (LiveReport) -> Bool) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        var seen = 0
        while Date() < deadline {
            let all = reports.value
            if all[seen...].contains(where: match) { return true }
            seen = all.count
            RunLoop.current.run(until: Date().addingTimeInterval(0.05))
        }
        return false
    }

    private func temporaryFolder() throws -> URL {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("pith-live-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }
}

/// A value shared between a test and the threads that report to it.
final class LockedValue<Value>: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: Value
    init(_ value: Value) { stored = value }
    var value: Value { lock.lock(); defer { lock.unlock() }; return stored }
    @discardableResult func update<T>(_ change: (inout Value) -> T) -> T { lock.lock(); defer { lock.unlock() }; return change(&stored) }
}

extension LockedValue where Value == UInt64 {
    /// Sets it once: true the first time.
    func set(_ value: UInt64) -> Bool { update { stored in guard stored == 0 else { return false }; stored = value; return true } }
}
