import XCTest
@testable import PithCore

final class ScannerTests: XCTestCase {
    func testEmptySuccessIsFailureWithActionableDiagnostics() async throws {
        let folder = try temporaryFolder()
        defer { try? FileManager.default.removeItem(at: folder) }
        let executable = try script("echo 'test diagnostic' >&2\nexit 1\n", in: folder)
        do {
            _ = try await ScannerRunner().scan(binary: executable, root: folder) { _ in }
            XCTFail("An exit without a result cannot become a successful scan")
        } catch { XCTAssertTrue(error.localizedDescription.contains("test diagnostic")) }
    }

    func testCancellationTerminatesTheWorkerAndAllowsAnotherScan() async throws {
        let folder = try temporaryFolder()
        defer { try? FileManager.default.removeItem(at: folder) }
        let executable = try script("exec /bin/sleep 30\n", in: folder)
        let runner = ScannerRunner()
        let task = Task { try await runner.scan(binary: executable, root: folder) { _ in } }
        try await Task.sleep(for: .milliseconds(100))
        task.cancel()
        do { _ = try await task.value; XCTFail("Cancelled scan returned a result") } catch { }
        let next = try script("exit 0\n", in: folder)
        do { _ = try await runner.scan(binary: next, root: folder) { _ in }; XCTFail("Empty scan returned a result") }
        catch { XCTAssertTrue(error.localizedDescription.contains("without a result")) }
    }

    func testRealScannerHandlesUnicodeAndPassesTheNativeProtocol() async throws {
        let storage = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let binary = storage.appendingPathComponent("scanner/target/release/storage-scanner")
        guard FileManager.default.isExecutableFile(atPath: binary.path) else { throw XCTSkip("Build the Rust scanner before running integration tests") }
        let folder = try temporaryFolder().resolvingSymlinksInPath()
        defer { try? FileManager.default.removeItem(at: folder) }
        let file = folder.appendingPathComponent("café 🫖.txt")
        try Data("hello".utf8).write(to: file)
        let result = try await ScannerRunner().scan(binary: binary, root: folder) { _ in }
        XCTAssertEqual(result.summary.files, 1)
        XCTAssertTrue(result.root.entries.contains { $0.path == file.path })
        XCTAssertEqual(try TrashPolicy.plan(file.path, result: result, home: FileManager.default.homeDirectoryForCurrentUser).target.path, file.path)
    }

    func testRealScannerCountsClonesOnceAndMeasuresWhatDeletingFrees() async throws {
        let storage = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let binary = storage.appendingPathComponent("scanner/target/release/storage-scanner")
        guard FileManager.default.isExecutableFile(atPath: binary.path) else { throw XCTSkip("Build the Rust scanner before running integration tests") }
        let folder = try temporaryFolder().resolvingSymlinksInPath()
        defer { try? FileManager.default.removeItem(at: folder) }
        let original = folder.appendingPathComponent("original.bin"), copies = folder.appendingPathComponent("copies")
        try Data((0..<2_000_000).map { UInt8(truncatingIfNeeded: $0 &* 31) }).write(to: original)
        try FileManager.default.createDirectory(at: copies, withIntermediateDirectories: true)
        // On APFS a copy within one volume is a clone, sharing every block with the original.
        try FileManager.default.copyItem(at: original, to: copies.appendingPathComponent("copy.bin"))

        let result = try await ScannerRunner().scan(binary: binary, root: folder) { _ in }
        let size = try XCTUnwrap(result.root.entries.first { $0.path == original.path }?.size)
        XCTAssertEqual(result.root.size, size, "the copy adds nothing")
        XCTAssertEqual(result.summary.clones, DiskSummary.Clones(files: 1, bytes: size))
        XCTAssertEqual(result.root.clones, size)
        // A folder of copies holds no space of its own, so the map folds it into the group of smaller items.
        XCTAssertEqual(result.root.children?.first { $0.kind == .aggregate }?.clones, size)

        let one = try await ScannerRunner.frees(binary: binary, paths: [copies.path])
        XCTAssertEqual(one.bytes, 0, "the original keeps the copy's blocks")
        XCTAssertEqual(one.shared, size)
        let both = try await ScannerRunner.frees(binary: binary, paths: [folder.path])
        XCTAssertEqual(both.bytes, size, "with both copies gone, their blocks go once")
        XCTAssertEqual(both.files, 2)
    }

    private func temporaryFolder() throws -> URL {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("pith-test-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }
    private func script(_ body: String, in folder: URL) throws -> URL {
        let file = folder.appendingPathComponent(UUID().uuidString)
        try Data(("#!/bin/sh\n" + body).utf8).write(to: file)
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: file.path)
        return file
    }
}
