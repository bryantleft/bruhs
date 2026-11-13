import XCTest
@testable import PithCore

final class CleanupTests: XCTestCase {
    func testReportRejectsEscapedAndOverlappingCandidates() throws {
        let root = URL(fileURLWithPath: "/Users/me/project")
        XCTAssertThrowsError(try CleanupReport.decode(report(root.path, candidates: [candidate("/Users/me/elsewhere")]), root: root))
        XCTAssertThrowsError(try CleanupReport.decode(report(root.path, candidates: [candidate(root.path + "/cache"), candidate(root.path + "/cache-other"), candidate(root.path + "/cache/nested")]), root: root))
        XCTAssertThrowsError(try CleanupReport.decode(report(root.path, candidates: [candidate(root.path + "/../outside")]), root: root))
        XCTAssertThrowsError(try CleanupReport.decode(report(root.path, candidates: [candidate(root.path + "/cache", risk: "guessed")]), root: root))
    }

    func testReportPlansPrunedCandidatesButRefusesManagedAndIncompleteItems() throws {
        let fixture = try CleanupFixture()
        defer { fixture.remove() }
        let cache = try fixture.file("project/node_modules/dependency.bin")
        let root = cache.deletingLastPathComponent().deletingLastPathComponent()
        let report = try CleanupReport.decode(self.report(root.path, candidates: [candidate(cache.path),
            candidate(root.path + "/managed", risk: "managed"), candidate(root.path + "/partial", unreadable: 1)]), root: root)
        let batch = try report.trashBatch(paths: [cache.path], home: fixture.root).get()
        XCTAssertEqual(batch.plans.map(\.target.path), [cache.path])
        XCTAssertThrowsError(try report.trashBatch(paths: [root.path + "/managed"], home: fixture.root).get())
        XCTAssertThrowsError(try report.trashBatch(paths: [root.path + "/partial"], home: fixture.root).get())
        XCTAssertThrowsError(try report.trashBatch(paths: [root.path + "/unmeasured"], home: fixture.root).get())
    }

    func testPermanentRemovalTouchesOnlyRecordedItemsAndNeverFollowsSymlinks() throws {
        let fixture = try CleanupFixture()
        defer { fixture.remove() }
        let original = try fixture.file("selected/nested/file.bin")
        let outside = try fixture.file("keep/outside.bin")
        let selected = original.deletingLastPathComponent().deletingLastPathComponent()
        try FileManager.default.createSymbolicLink(at: selected.appendingPathComponent("link"), withDestinationURL: outside.deletingLastPathComponent())
        let alreadyTrashed = try fixture.file("trash/keep.bin")
        let move = try fixture.move(selected)
        let selection = try CleanupTrashSelection.capture(moves: [move]) { _ in fixture.trash }
        let outcome = try selection.remove()
        XCTAssertEqual(outcome.removed, [move])
        XCTAssertNil(outcome.problem)
        XCTAssertFalse(FileManager.default.fileExists(atPath: try XCTUnwrap(move.trashed).path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: outside.path), "a symlink's destination is never traversed")
        XCTAssertTrue(FileManager.default.fileExists(atPath: alreadyTrashed.path), "unrelated Trash stays intact")
    }

    func testAChangedNestedFileRefusesAllBeforeAnyPermanentDeletion() throws {
        let fixture = try CleanupFixture()
        defer { fixture.remove() }
        let a = try fixture.file("a.bin"), deep = try fixture.file("folder/nested/child.bin")
        let moves = try [fixture.move(a), fixture.move(deep.deletingLastPathComponent().deletingLastPathComponent())]
        let selection = try CleanupTrashSelection.capture(moves: moves) { _ in fixture.trash }
        let child = try XCTUnwrap(moves[1].trashed).appendingPathComponent("nested/child.bin")
        try Data("changed content".utf8).write(to: child)
        XCTAssertThrowsError(try selection.remove())
        for move in moves { XCTAssertTrue(FileManager.default.fileExists(atPath: try XCTUnwrap(move.trashed).path)) }
    }

    func testReplacedOrRestoredItemsAreNeverPermanentlyDeleted() throws {
        let fixture = try CleanupFixture()
        defer { fixture.remove() }
        let source = try fixture.file("item.bin")
        let move = try fixture.move(source)
        let selection = try CleanupTrashSelection.capture(moves: [move]) { _ in fixture.trash }
        let trashed = try XCTUnwrap(move.trashed)
        try FileManager.default.moveItem(at: trashed, to: source)
        try Data("replacement".utf8).write(to: trashed)
        XCTAssertThrowsError(try selection.remove())
        XCTAssertEqual(try Data(contentsOf: source), Data("original".utf8))
        XCTAssertEqual(try Data(contentsOf: trashed), Data("replacement".utf8))
        XCTAssertThrowsError(try CleanupTrashSelection.capture(moves: [move]) { _ in fixture.trash })
    }

    func testChangedContentCannotHideByRestoringItsModificationDate() throws {
        let fixture = try CleanupFixture()
        defer { fixture.remove() }
        let moved = try fixture.move(fixture.file("a.bin"))
        let selected = try CleanupTrashSelection.capture(moves: [moved]) { _ in fixture.trash }
        let path = try XCTUnwrap(moved.trashed)
        let date = try XCTUnwrap(FileManager.default.attributesOfItem(atPath: path.path)[.modificationDate] as? Date)
        let handle = try FileHandle(forWritingTo: path)
        try handle.write(contentsOf: Data("modified".utf8))
        try handle.close()
        try FileManager.default.setAttributes([.modificationDate: date], ofItemAtPath: path.path)
        XCTAssertThrowsError(try selected.remove())
        XCTAssertTrue(FileManager.default.fileExists(atPath: path.path))
    }

    func testPartiallyRemovedFolderReportsItsUndoAsInvalid() throws {
        guard geteuid() != 0 else { throw XCTSkip("A root process bypasses the fixture's directory permissions") }
        let fixture = try CleanupFixture()
        defer { fixture.remove() }
        let file = try fixture.file("selected/child.bin")
        let moved = try fixture.move(file.deletingLastPathComponent())
        let selection = try CleanupTrashSelection.capture(moves: [moved]) { _ in fixture.trash }
        try FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: fixture.trash.path)
        defer { try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: fixture.trash.path) }
        let outcome = try selection.remove()
        XCTAssertTrue(outcome.removed.isEmpty)
        XCTAssertEqual(outcome.attempted, [moved], "a partial folder deletion must invalidate its Undo too")
        XCTAssertEqual(outcome.unfinished, [moved])
        XCTAssertNotNil(outcome.problem)
        XCTAssertTrue(FileManager.default.fileExists(atPath: try XCTUnwrap(moved.trashed).path))
    }

    func testRootAndEscapingSymlinkAreRejected() throws {
        let fixture = try CleanupFixture()
        defer { fixture.remove() }
        let original = try fixture.file("outside/file.bin")
        let alias = fixture.trash.appendingPathComponent("alias")
        try FileManager.default.createSymbolicLink(at: alias, withDestinationURL: original.deletingLastPathComponent())
        let escaped = alias.appendingPathComponent(original.lastPathComponent)
        let move = TrashMove(plan: fixture.plan(original), trashed: escaped, identity: TrashPolicy.identity(of: original.path, following: false))
        XCTAssertThrowsError(try CleanupTrashSelection.capture(moves: [move]) { _ in fixture.trash })
        let root = TrashMove(plan: fixture.plan(fixture.trash), trashed: fixture.trash, identity: TrashPolicy.identity(of: fixture.trash.path, following: false))
        XCTAssertThrowsError(try CleanupTrashSelection.capture(moves: [root]) { _ in fixture.trash })
        XCTAssertTrue(FileManager.default.fileExists(atPath: original.path))
    }

    func testHardlinksSelectedTogetherCanBeDeleted() throws {
        let fixture = try CleanupFixture()
        defer { fixture.remove() }
        let a = try fixture.file("a.bin"), b = fixture.root.appendingPathComponent("b.bin")
        try FileManager.default.linkItem(at: a, to: b)
        let moves = try [fixture.move(a), fixture.move(b)]
        let selected = try CleanupTrashSelection.capture(moves: moves) { _ in fixture.trash }
        XCTAssertEqual(try selected.remove().removed, moves)
    }

    func testMissingRecordedIdentityCannotEnablePermanentDeletion() throws {
        let fixture = try CleanupFixture()
        defer { fixture.remove() }
        let source = try fixture.file("a.bin")
        let moved = try fixture.move(source)
        let unverified = TrashMove(plan: moved.plan, trashed: moved.trashed)
        XCTAssertThrowsError(try CleanupTrashSelection.capture(moves: [unverified]) { _ in fixture.trash })
    }

    func testOversizedReviewFallsBackWithoutChangingTheMovedItem() throws {
        let fixture = try CleanupFixture()
        defer { fixture.remove() }
        let file = try fixture.file("large/folder/file.bin")
        let move = try fixture.move(file.deletingLastPathComponent().deletingLastPathComponent())
        XCTAssertThrowsError(try CleanupTrashSelection.capture(moves: [move], budget: 1) { _ in fixture.trash }) { error in
            XCTAssertTrue(error.localizedDescription.contains("Undo still works"))
        }
        let restored = TrashUndo.putBack([move]) { try FileManager.default.moveItem(at: $0, to: $1) }
        XCTAssertEqual(restored.restored, [move])
        XCTAssertTrue(FileManager.default.fileExists(atPath: file.path))
    }

    func testRunnerReportsDiagnosticsAndStopsOnCancellation() async throws {
        let fixture = try CleanupFixture()
        defer { fixture.remove() }
        let runner = CleanupRunner()
        let script = try fixture.script("echo 'fixture diagnostic' >&2\nexit 1\n")
        do { _ = try await runner.analyze(binary: script, root: fixture.root); XCTFail("empty report succeeded") }
        catch { XCTAssertTrue(error.localizedDescription.contains("fixture diagnostic")) }
        let waiting = try fixture.script("exec /bin/sleep 30\n")
        let task = Task { try await runner.analyze(binary: waiting, root: fixture.root) }
        try await Task.sleep(for: .milliseconds(100))
        task.cancel()
        do { _ = try await task.value; XCTFail("cancelled inspection succeeded") }
        catch { XCTAssertTrue(error is CancellationError) }
        do { _ = try await runner.analyze(binary: script, root: fixture.root); XCTFail("empty report succeeded") }
        catch { XCTAssertTrue(error.localizedDescription.contains("fixture diagnostic")) }
    }

    func testRealScannerSharesItsClassifierWithTheNativeCleanupReport() async throws {
        let storage = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let binary = storage.appendingPathComponent("scanner/target/release/storage-scanner")
        guard FileManager.default.isExecutableFile(atPath: binary.path) else { throw XCTSkip("Build the Rust scanner first") }
        let fixture = try CleanupFixture()
        defer { fixture.remove() }
        let manifest = try fixture.file("project/package.json")
        let generated = try fixture.file("project/node_modules/module.bin")
        let report = try await CleanupRunner().analyze(binary: binary, root: manifest.deletingLastPathComponent())
        let candidate = try XCTUnwrap(report.candidates.first { URL(fileURLWithPath: $0.path).resolvingSymlinksInPath().path == generated.deletingLastPathComponent().path })
        XCTAssertEqual(candidate.risk, .rebuildable)
        XCTAssertFalse(candidate.caution.isEmpty)
        let batch = try report.trashBatch(paths: [candidate.path], home: fixture.root).get()
        XCTAssertEqual(batch.plans.map(\.target.path), [generated.deletingLastPathComponent().path])
        XCTAssertTrue(FileManager.default.fileExists(atPath: generated.path), "analysis never changes the files")
    }

    private func candidate(_ path: String, risk: String = "rebuildable", unreadable: Int = 0) -> [String: Any] {
        ["path": path, "allocatedBytes": 4096, "category": "build_output", "risk": risk, "reason": "Generated files", "caution": "Requires rebuilding", "nextStep": "Review first", "unreadableFolders": unreadable]
    }

    private func report(_ root: String, candidates: [[String: Any]]) throws -> Data {
        try JSONSerialization.data(withJSONObject: ["root": root, "startedAt": 1, "completedAt": 2,
            "summary": ["dirs": 1, "files": 1, "bytes": 8192, "errors": 0, "unreadable": ["protected": 0, "denied": 0, "other": 0],
                        "entryErrors": 0, "cloudOnly": ["files": 0, "bytes": 0, "folders": 0], "elapsedMs": 1, "engine": "bulk"],
            "candidates": candidates, "unreadableFolders": [], "guidance": "Review first"])
    }
}

private struct CleanupFixture {
    let root: URL
    var trash: URL { root.appendingPathComponent("trash") }

    init() throws {
        let made = FileManager.default.temporaryDirectory.appendingPathComponent("pith-cleanup-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: made.appendingPathComponent("trash"), withIntermediateDirectories: true)
        root = made.resolvingSymlinksInPath()
    }

    func remove() { try? FileManager.default.removeItem(at: root) }

    func file(_ path: String) throws -> URL {
        let target = root.appendingPathComponent(path)
        try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("original".utf8).write(to: target)
        return target
    }

    func plan(_ path: URL) -> TrashPlan {
        TrashPlan(target: path, name: path.lastPathComponent, size: 4096, files: 1, isFolder: (try? path.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true, consequences: [])
    }

    func move(_ source: URL) throws -> TrashMove {
        let batch = TrashBatch(plans: [plan(source)])
        let outcome = batch.move { from in
            let destination = trash.appendingPathComponent(from.lastPathComponent)
            try FileManager.default.moveItem(at: from, to: destination)
            return destination
        }
        return try XCTUnwrap(outcome.moved.first, outcome.problem ?? "fixture move failed")
    }

    func script(_ body: String) throws -> URL {
        let path = root.appendingPathComponent(UUID().uuidString)
        try Data(("#!/bin/sh\n" + body).utf8).write(to: path)
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: path.path)
        return path
    }
}
