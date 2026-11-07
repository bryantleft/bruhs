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
