import XCTest
@testable import PithCore

final class DiskTests: XCTestCase {
    func testChunksPreserveUnicodeAndRejectWrongProtocolVersion() throws {
        var decoder = DiskStreamDecoder()
        let line = Data("{\"type\":\"fatal\",\"reason\":\"café failed\"}\n".utf8)
        let split = try XCTUnwrap(line.firstIndex(of: 0xC3)) + 1
        XCTAssertTrue(try decoder.feed(line.prefix(split)).isEmpty)
        XCTAssertThrowsError(try decoder.feed(line.suffix(from: split))) { error in
            XCTAssertTrue(error.localizedDescription.contains("café"))
        }
        XCTAssertThrowsError(try decoder.feed(Data("{\"type\":\"result\",\"version\":1}\n".utf8)))
    }

    func testBridgeRejectsRemotePagesAndSubframes() {
        XCTAssertFalse(BridgePolicy.allows(url: URL(string: "https://example.com/index.html"), mainFrame: true))
        XCTAssertFalse(BridgePolicy.allows(url: URL(string: "pith://app/index.html"), mainFrame: false))
        XCTAssertFalse(BridgePolicy.allows(url: URL(string: "pith://other/index.html"), mainFrame: true))
        XCTAssertTrue(BridgePolicy.allows(url: URL(string: "pith://app/index.html"), mainFrame: true))
    }

    func testTrashRequiresSnapshotMembershipAndProtectsRoot() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let file = folder.appendingPathComponent("sample.txt")
        try Data("test".utf8).write(to: file)
        let result = fixture(root: folder.resolvingSymlinksInPath().path, children: [DiskNode(kind: .file, name: "sample.txt", path: file.resolvingSymlinksInPath().path, size: 4, children: nil)])
        XCTAssertThrowsError(try TrashPolicy.resolve(folder.path, result: result, home: URL(fileURLWithPath: NSHomeDirectory())))
        XCTAssertThrowsError(try TrashPolicy.resolve(folder.appendingPathComponent("unscanned").path, result: result, home: URL(fileURLWithPath: NSHomeDirectory())))
        XCTAssertEqual(try TrashPolicy.resolve(file.resolvingSymlinksInPath().path, result: result, home: URL(fileURLWithPath: NSHomeDirectory())).path, file.resolvingSymlinksInPath().path)
    }

    func testParentSymlinkCannotEscapeButFinalSymlinkCanBeTrashed() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let outside = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        for url in [folder, outside] { try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true) }
        defer { for url in [folder, outside] { try? FileManager.default.removeItem(at: url) } }
        let link = folder.appendingPathComponent("link")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: outside)
        let escaped = link.appendingPathComponent("escape").path
        let canonicalLink = folder.resolvingSymlinksInPath().appendingPathComponent("link").path
        let result = fixture(root: folder.resolvingSymlinksInPath().path, children: [
            DiskNode(kind: .file, name: "link", path: canonicalLink, size: 0, children: nil),
            DiskNode(kind: .file, name: "escape", path: escaped, size: 0, children: nil)
        ])
        XCTAssertThrowsError(try TrashPolicy.resolve(escaped, result: result, home: URL(fileURLWithPath: NSHomeDirectory())))
        XCTAssertEqual(try TrashPolicy.resolve(canonicalLink, result: result, home: URL(fileURLWithPath: NSHomeDirectory())).path, canonicalLink)
    }

    func testWholeDiskScanStillProtectsHomeTopLevelAndSyntheticNodes() throws {
        let home = FileManager.default.homeDirectoryForCurrentUser.resolvingSymlinksInPath()
        let paths = [home.path, home.deletingLastPathComponent().path, "/System", "/__other__"]
        let result = fixture(root: "/", children: paths.map { DiskNode(kind: $0 == "/__other__" ? .aggregate : .dir, name: "protected", path: $0, size: 0, children: nil) })
        for path in paths { XCTAssertThrowsError(try TrashPolicy.resolve(path, result: result, home: home), path) }
        XCTAssertThrowsError(try TrashPolicy.resolve("relative", result: result, home: home))
    }

    private func fixture(root: String, children: [DiskNode]) -> DiskResult {
        DiskResult(type: "result", version: 2, root: DiskNode(kind: .dir, name: "test", path: root, size: 4, children: children), topFiles: [], summary: DiskSummary(dirs: 1, files: 1, bytes: 4, errors: 0, elapsedMs: 1, engine: "std"))
    }
}
