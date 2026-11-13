import Foundation
import XCTest
@testable import PithCore

final class MCPConnectionTests: XCTestCase {
    func testConfigurationPreservesPathsAsArgumentsWithoutShellInterpolation() throws {
        let root = URL(fileURLWithPath: "/Users/person/Space \" quotes $(no) \\ files")
        let binary = URL(fileURLWithPath: "/Applications/Pith Test.app/Contents/MacOS/storage-scanner")
        struct Server: Decodable { let command: String; let args: [String] }
        struct Configuration: Decodable { let mcpServers: [String: Server] }
        let json = try MCPConnection.configuration(binary: binary, root: root)
        let configuration = try JSONDecoder().decode(Configuration.self, from: Data(json.utf8))
        XCTAssertEqual(configuration.mcpServers["pith"]?.command, binary.path)
        XCTAssertEqual(configuration.mcpServers["pith"]?.args, ["mcp", "--root", root.path])
    }

    func testProbeRejectsAnIncompleteConnection() {
        XCTAssertThrowsError(try MCPConnection.validateProbe(Data("{\"id\":1,\"result\":{\"protocolVersion\":\"2025-11-25\"}}\n".utf8), root: URL(fileURLWithPath: "/tmp")))
    }

    func testRealBundledProtocolCheckDoesNotScanOrWrite() async throws {
        let storage = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let binary = storage.appendingPathComponent("scanner/target/release/storage-scanner")
        guard FileManager.default.isExecutableFile(atPath: binary.path) else { throw XCTSkip("Build the Rust scanner before running integration tests") }
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("pith-mcp-check \(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let count = try await ScannerRunner.checkMCP(binary: binary, root: root)
        XCTAssertEqual(count, 5)
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: root.path), [])
    }
}
