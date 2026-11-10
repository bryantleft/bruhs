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
        guard case .status(let status) = try decode(#"{"type":"status","through":9,"pending":3,"changed":true,"checking":false,"historyDone":true,"asking":2}"#) else {
            return XCTFail("not a status")
        }
        XCTAssertEqual(status, LiveStatus(through: 9, pending: 3, changed: true, checking: false, historyDone: true, asking: 2))
        guard case .walked(_, let folders, _, _, let asking) = try decode(#"{"type":"walked","ms":5,"folders":7,"files":3,"bytes":10,"asking":4}"#) else {
            return XCTFail("not a walk's end")
        }
        XCTAssertEqual(folders, 7)
        XCTAssertEqual(asking, 4)
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
        guard case .relisted(let relisted) = try decode(#"{"type":"relisted","request":12}"#) else { return XCTFail("not a relist's end") }
        XCTAssertEqual(relisted, 12)
    }

    /// The real scanner says when the relist Check Again asks for has landed, the folder and everything in it listed
    /// again, by the request it came with, so Disk asks for that map at once.
    func testTheScannerSaysWhenCheckAgainsRelistHasLanded() throws {
        let storage = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let binary = storage.appendingPathComponent("scanner/target/release/storage-scanner")
        guard FileManager.default.isExecutableFile(atPath: binary.path) else { throw XCTSkip("Build the Rust scanner before running integration tests") }
        let folder = try temporaryFolder().resolvingSymlinksInPath()
        defer { try? FileManager.default.removeItem(at: folder) }
        try FileManager.default.createDirectory(at: folder.appendingPathComponent("sub/deeper"), withIntermediateDirectories: true)
        try Data(count: 50_000).write(to: folder.appendingPathComponent("sub/deeper/one.bin"))
        let reports = LockedValue<[LiveReport]>([])
        let process = LiveProcess(binary: binary, receive: { report in reports.update { $0.append(report) } }, exited: { _ in })
        try process.start()
        defer { process.terminate() }
        process.open(root: folder.path, snapshot: nil, volume: nil)
        process.walk(since: DiskWatcher.currentEventID)
        XCTAssertTrue(waitFor(reports) { if case .walked = $0 { return true }; return false })
        process.relist(path: folder.appendingPathComponent("sub").path, deep: true, request: 21)
        XCTAssertTrue(waitFor(reports) { if case .relisted(21) = $0 { return true }; return false })
    }

    func testLinesAreSplitWhereverTheReadsFall() {
        var lines = LineSplitter()
        XCTAssertEqual(lines.feed(Data("ab".utf8)), [])
        XCTAssertEqual(lines.feed(Data("c\nd\n\ne".utf8)), [Data("abc".utf8), Data("d".utf8), Data()])
        XCTAssertEqual(lines.feed(Data("f".utf8)), [])
        XCTAssertEqual(lines.feed(Data("\n".utf8)), [Data("ef".utf8)])
        XCTAssertEqual(lines.rest(), Data())
        XCTAssertEqual(lines.feed(Data("tail".utf8)), [])
        XCTAssertEqual(lines.rest(), Data("tail".utf8))
    }

    /// Review of the whole disk's map on screen: a 3 MB line read 64 KB at a time was searched from its start with
    /// every read, a quarter of a core while Disk refreshed every two seconds.
    func testALongLineInManyReadsIsSearchedOnce() {
        let line = Data(repeating: UInt8(ascii: "x"), count: 3_000_000) + Data([10])
        var lines = LineSplitter()
        let started = Date()
        var found: [Data] = []
        for offset in stride(from: 0, to: line.count, by: 65_536) {
            found += lines.feed(line.subdata(in: offset..<min(offset + 65_536, line.count)))
        }
        XCTAssertEqual(found.map(\.count), [3_000_000])
        XCTAssertLessThan(Date().timeIntervalSince(started), 0.1)
    }

    func testATreeIsCheckedLikeAScanResult() throws {
        let tree = #"{"type":"tree","request":3,"result":{"type":"result","version":4,"root":{"name":"x","path":"/x","size":10,"kind":"dir","files":1,"children":[]},"topFiles":[],"volumes":[],"unreadableFolders":[],"summary":{"dirs":1,"files":1,"bytes":10,"errors":0,"unreadable":{"protected":0,"denied":0,"other":0},"entryErrors":0,"cloudOnly":{"files":0,"bytes":0,"folders":0},"clones":{"files":0,"bytes":0},"elapsedMs":5,"engine":"bulk"}}}"#
        guard case .tree(let request, let result, let json, let places, let unlisted) = try LiveDecoder.decode(Data(tree.utf8)) else { return XCTFail("not a tree") }
        XCTAssertEqual(request, 3)
        XCTAssertEqual(places, [], "a tree asked for without places")
        XCTAssertEqual(unlisted, [], "nor any of the person's changes")
        XCTAssertEqual(result.root.size, 10)
        // The page gets the result object exactly as the scanner wrote it.
        XCTAssertTrue(json.hasPrefix(#"{"type":"result","version":4"#) && json.hasSuffix(#""engine":"bulk"}}"#))
        XCTAssertEqual(try JSONDecoder().decode(DiskResult.self, from: Data(json.utf8)).root.path, "/x")
        // The same checks as a scan's result: a map of another version is refused.
        XCTAssertThrowsError(try LiveDecoder.decode(Data(tree.replacingOccurrences(of: #""version":4"#, with: #""version":3"#).utf8)))
    }

    /// The scanner answers for the known places Pith names beside the map they go with, ahead of the map, which the page
    /// still gets exactly as the scanner wrote it. A place it has listed says how many files it holds and whether it holds
    /// folders; one that doesn't say, as from a scanner from before it did, holds something as far as Pith knows.
    func testATreeSaysWhatItsIndexHoldsAtEachPlace() throws {
        let result = #"{"type":"result","version":4,"root":{"name":"x","path":"/x","size":10,"kind":"dir","files":1,"children":[]},"topFiles":[],"volumes":[],"unreadableFolders":[],"summary":{"dirs":1,"files":1,"bytes":10,"errors":0,"unreadable":{"protected":0,"denied":0,"other":0},"entryErrors":0,"cloudOnly":{"files":0,"bytes":0,"folders":0},"clones":{"files":0,"bytes":0},"elapsedMs":5,"engine":"bulk"}}"#
        let line = #"{"type":"tree","request":3,"places":[{"path":"/x/Library/Mail","size":null},{"path":"/x/Library/Developer","size":4096,"files":2,"subfolders":true},{"path":"/x/Library/Mobile Documents","size":null,"asking":true},{"path":"/x/.Trash","size":0,"files":1,"subfolders":false},{"path":"/x/Old","size":0}],"unlisted":["/x/a.bin"],"result":"# + result + "}"
        guard case .tree(_, _, let json, let places, let unlisted) = try LiveDecoder.decode(Data(line.utf8)) else { return XCTFail("not a tree") }
        XCTAssertEqual(places, [LivePlace(path: "/x/Library/Mail", size: nil), LivePlace(path: "/x/Library/Developer", size: 4096, files: 2, subfolders: true),
                                LivePlace(path: "/x/Library/Mobile Documents", size: nil, asking: true),
                                LivePlace(path: "/x/.Trash", size: 0, files: 1, subfolders: false), LivePlace(path: "/x/Old", size: 0)],
                       "a place waiting on macOS says so")
        XCTAssertEqual(places.map(\.holdsNothing), [false, false, false, false, false], "a file, or nothing said of what it holds")
        XCTAssertTrue(LivePlace(path: "/x/.Trash", size: 0, files: 0, subfolders: false).holdsNothing)
        XCTAssertEqual(unlisted, ["/x/a.bin"], "the person's changes its index doesn't show yet")
        XCTAssertEqual(json, result)
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

    /// Review of Pith with Disk on screen: the thread reading the scanner kept every buffer it read until it ended,
    /// 1.8 GB within half an hour, since `availableData` hands back autoreleased buffers.
    func testReadingTheScannerKeepsNoBuffers() throws {
        let folder = try temporaryFolder()
        defer { try? FileManager.default.removeItem(at: folder) }
        // A stand-in scanner that writes 50 reports of 1 MB each.
        let line = folder.appendingPathComponent("line")
        try Data((#"{"type":"stats","pad":""# + String(repeating: "x", count: 1_000_000) + "\"}\n").utf8).write(to: line)
        let script = folder.appendingPathComponent("scanner")
        try "#!/bin/sh\nfor i in $(seq 1 50); do cat '\(line.path)'; done\n".write(to: script, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: script.path)
        let received = LockedValue<Int>(0)
        let before = footprint()
        let process = LiveProcess(binary: script, receive: { report in
            if case .stats = report { received.update { $0 += 1 } }
        }, exited: { _ in })
        try process.start()
        let deadline = Date().addingTimeInterval(30)
        while received.value < 50, Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.05)) }
        XCTAssertEqual(received.value, 50)
        let grown = footprint() - before
        XCTAssertLessThan(grown, 20_000_000, "reading 50 MB kept \(grown / 1_000_000) MB")
    }

    private func footprint() -> Int64 {
        var info = task_vm_info_data_t()
        var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
        let status = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count) }
        }
        return status == KERN_SUCCESS ? Int64(info.phys_footprint) : 0
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
            _ = waitFor(reports, timeout: 2) { if case .tree(asked, let result, _, _, _) = $0 { size = result.root.size; return true }; return false }
            RunLoop.current.run(until: Date().addingTimeInterval(0.5))
        }
        XCTAssertEqual(size, scanned)
    }

    /// The real scanner answers for the places Pith names with the map they go with: a folder's size as that map
    /// shows it, none for one it couldn't read or inside one, and nothing for one that isn't there.
    func testThePlacesComeWithTheSizesOfTheirMap() throws {
        let storage = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let binary = storage.appendingPathComponent("scanner/target/release/storage-scanner")
        guard FileManager.default.isExecutableFile(atPath: binary.path) else { throw XCTSkip("Build the Rust scanner before running integration tests") }
        let folder = try temporaryFolder().resolvingSymlinksInPath()
        let locked = folder.appendingPathComponent("Mail")
        defer {
            try? FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: locked.path)
            try? FileManager.default.removeItem(at: folder)
        }
        try FileManager.default.createDirectory(at: folder.appendingPathComponent("Developer"), withIntermediateDirectories: true)
        try Data(count: 50_000).write(to: folder.appendingPathComponent("Developer/one.bin"))
        try FileManager.default.createDirectory(at: locked, withIntermediateDirectories: false, attributes: [.posixPermissions: 0])
        let reports = LockedValue<[LiveReport]>([])
        let process = LiveProcess(binary: binary, receive: { report in reports.update { $0.append(report) } }, exited: { _ in })
        try process.start()
        defer { process.terminate() }
        process.open(root: folder.path, snapshot: nil, volume: nil)
        process.walk(since: DiskWatcher.currentEventID)
        XCTAssertTrue(waitFor(reports) { if case .walked = $0 { return true }; return false })
        let developer = folder.appendingPathComponent("Developer").path, inside = locked.appendingPathComponent("V10").path
        let gone = folder.appendingPathComponent("Gone").path
        process.tree(path: folder.path, focus: nil, request: 1, places: [developer, locked.path, inside, folder.appendingPathComponent("Messages").path],
                     gone: [developer, gone], back: [developer, gone])
        var answer: (DiskResult, [LivePlace], [String])?
        XCTAssertTrue(waitFor(reports) { if case .tree(1, let result, _, let places, let unlisted) = $0 { answer = (result, places, unlisted); return true }; return false })
        let (map, places, unlisted) = try XCTUnwrap(answer)
        XCTAssertEqual(places, [LivePlace(path: developer, size: map.item(at: developer)?.size, files: 1, subfolders: false),
                                LivePlace(path: locked.path, size: nil), LivePlace(path: inside, size: nil)])
        XCTAssertNotNil(map.item(at: developer)?.size)
        // Developer is in the index, listed, and nothing is at Gone: of the changes asked about, the index doesn't show
        // Developer moved to the Trash, nor Gone put back.
        XCTAssertEqual(unlisted, [developer, gone])
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
