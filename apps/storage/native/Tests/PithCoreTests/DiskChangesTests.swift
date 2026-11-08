import XCTest
@testable import PithCore

final class DiskChangesTests: XCTestCase {
    private typealias Flag = DiskChanges.Flag

    private func map() -> DiskResult {
        func dir(_ path: String, _ children: [DiskNode] = []) -> DiskNode {
            DiskNode(kind: .dir, name: (path as NSString).lastPathComponent, path: path, size: 1, files: 1, children: children)
        }
        let summary = DiskSummary(dirs: 4, files: 1, bytes: 1, errors: 0, unreadable: .init(protected: 0, denied: 0, other: 0), entryErrors: 0,
                                  cloudOnly: .init(files: 0, bytes: 0, folders: 0), elapsedMs: 1, engine: "bulk")
        let projects = dir("/Users/me/projects", [dir("/Users/me/projects/app"), dir("/Users/me/projects/site")])
        return DiskResult(root: dir("/Users/me", [projects, dir("/Users/me/Music")]), topFiles: [], summary: summary)
    }

    func testFoldersComeFromEventsUnderTheRoot() {
        var changes = DiskChanges()
        changes.note("/Users/me/projects/app/", flags: 0, root: "/Users/me")
        changes.note("/Users/other/", flags: 0, root: "/Users/me")
        changes.note("/Users/me", flags: Flag.historyDone, root: "/Users/me")
        XCTAssertEqual(changes.folders, ["/Users/me/projects/app"], "trailing slash gone, outside paths and the replay marker ignored")
        XCTAssertFalse(changes.everything)
    }

    func testTheDataVolumeIsReportedAtItsVisiblePaths() {
        var changes = DiskChanges()
        changes.note("/Users/me/Documents/", flags: 0, root: "/System/Volumes/Data")
        XCTAssertEqual(changes.folders, ["/System/Volumes/Data/Users/me/Documents"])
        changes.note("/Users/me/Documents/", flags: 0, root: "/")
        XCTAssertTrue(changes.folders.contains("/Users/me/Documents"))
        // /tmp and /var are symlinks into /private, which FSEvents reports and Foundation's resolved paths drop.
        changes.note("/private/tmp/build/", flags: 0, root: "/tmp")
        XCTAssertTrue(changes.folders.contains("/tmp/build"))
    }

    func testLostEventsMeanOnlyAFullScanCatchesUp() {
        for flag in [Flag.userDropped, Flag.kernelDropped, Flag.eventIdsWrapped, Flag.rootChanged] {
            var changes = DiskChanges()
            changes.note("/Users/me/Music/", flags: flag, root: "/Users/me")
            XCTAssertTrue(changes.everything)
            XCTAssertNil(changes.refreshTargets(in: map()))
            XCTAssertTrue(changes.touches("/Users/me/projects"))
        }
        var many = DiskChanges()
        for index in 0...DiskChanges.limit { many.note("/Users/me/projects/app/\(index)", flags: 0, root: "/Users/me") }
        XCTAssertTrue(many.everything, "past the limit a full scan is quicker than chasing each folder")
        XCTAssertTrue(many.folders.isEmpty)
    }

    func testTouchesFollowsSizesUpAndLostSubtreesDown() {
        var changes = DiskChanges()
        changes.note("/Users/me/projects/app/src/", flags: 0, root: "/Users/me")
        XCTAssertTrue(changes.touches("/Users/me/projects"), "a folder's size counts everything inside it")
        XCTAssertTrue(changes.touches("/Users/me/projects/app/src"))
        XCTAssertFalse(changes.touches("/Users/me/projects/app/src/deeper"), "a folder's own listing changing leaves its subfolders alone")
        XCTAssertFalse(changes.touches("/Users/me/Music"))
        changes.note("/Users/me/Music/", flags: Flag.mustScanSubDirs, root: "/Users/me")
        XCTAssertTrue(changes.touches("/Users/me/Music/Albums"), "FSEvents lost the detail below Music")
    }

    func testRefreshScansTheNearestFoldersOnTheMapOnce() throws {
        var changes = DiskChanges()
        // Folded into a group of smaller items on the map, so it's scanned through app.
        changes.note("/Users/me/projects/app/node_modules/.pnpm/", flags: 0, root: "/Users/me")
        changes.note("/Users/me/projects/app/", flags: 0, root: "/Users/me")
        changes.note("/Users/me/projects/site/", flags: 0, root: "/Users/me")
        XCTAssertEqual(changes.refreshTargets(in: map()), ["/Users/me/projects/app", "/Users/me/projects/site"])
        changes.note("/Users/me/projects/", flags: Flag.mustScanSubDirs, root: "/Users/me")
        XCTAssertEqual(changes.refreshTargets(in: map()), ["/Users/me/projects"], "a folder covers the ones inside it")
        changes.note("/Users/me/", flags: 0, root: "/Users/me")
        XCTAssertNil(changes.refreshTargets(in: map()), "a change in the root itself needs the whole scan")
        XCTAssertNil(changes.refreshTargets(in: map(), limit: 0))
    }

    func testAFolderScannedAgainForgetsWhatChangedInsideIt() {
        var changes = DiskChanges()
        changes.note("/Users/me/projects/app/", flags: 0, root: "/Users/me")
        changes.note("/Users/me/projects/site/", flags: Flag.mustScanSubDirs, root: "/Users/me")
        changes.note("/Users/me/Music/", flags: 0, root: "/Users/me")
        let earlier = changes
        changes.clear(inside: "/Users/me/projects")
        XCTAssertEqual(changes.folders, ["/Users/me/Music"])
        XCTAssertTrue(changes.subtrees.isEmpty)
        changes.merge(earlier)
        XCTAssertEqual(changes, earlier, "a failed scan puts its folders' changes back")
    }

    func testASavedScanRoundTripsBesideItsFolderSizes() throws {
        let saved = SavedScan(result: map(), date: Date(timeIntervalSince1970: 1_000), since: 343_968_750, volume: "A9DE7092", edited: true)
        let decoded = try JSONDecoder().decode(SavedScan.self, from: JSONEncoder().encode(saved))
        XCTAssertEqual(decoded.result.root, saved.result.root)
        XCTAssertEqual(decoded.since, 343_968_750)
        XCTAssertEqual(decoded.volume, "A9DE7092")
        XCTAssertTrue(decoded.edited)
        let folder = URL(fileURLWithPath: "/tmp")
        XCTAssertNotEqual(SavedScan.file(for: "/", in: folder), ScanMemory.file(for: "/", in: folder))
    }

    @MainActor func testTheWatcherHearsAnotherProcessChangeAFolder() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("pith-watch-\(UUID().uuidString)").resolvingSymlinksInPath()
        let inside = root.appendingPathComponent("inside")
        try FileManager.default.createDirectory(at: inside, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        var changes = DiskChanges()
        let watcher = try XCTUnwrap(DiskWatcher(root: root.path, since: DiskWatcher.currentEventID) { events in
            for event in events { changes.note(event.path, flags: event.flags, root: root.path) }
        })
        defer { watcher.stop() }
        // The watcher leaves out this process's own changes, as it does Pith's moves to the Trash.
        let touch = Process()
        touch.executableURL = URL(fileURLWithPath: "/usr/bin/touch")
        touch.arguments = [inside.appendingPathComponent("new.txt").path]
        try touch.run()
        touch.waitUntilExit()
        let deadline = Date().addingTimeInterval(10)
        while !changes.folders.contains(inside.path), Date() < deadline { try await Task.sleep(for: .milliseconds(100)) }
        // Creating the folders just before can arrive too: fseventsd numbers events a moment after they happen.
        XCTAssertTrue(changes.folders.contains(inside.path))
        XCTAssertTrue(changes.folders.allSatisfy { $0 == root.path || $0 == inside.path }, "nothing outside the watched folder")
        XCTAssertTrue(changes.touches(root.path))
    }
}
