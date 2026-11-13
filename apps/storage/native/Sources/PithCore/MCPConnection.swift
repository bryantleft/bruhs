import Foundation

/// A connection grants metadata access only inside the folder in its launch arguments. Copying configuration
/// doesn't install it, start a server, or change the assistant's settings.
public enum MCPConnection {
    public static let toolNames: Set<String> = ["pith_status", "pith_scan", "pith_cleanup_candidates", "pith_inspect_path", "pith_estimate_cleanup"]

    public static func configuration(binary: URL, root: URL) throws -> String {
        struct Server: Encodable { let command: String; let args: [String] }
        struct Configuration: Encodable { let mcpServers: [String: Server] }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        let data = try encoder.encode(Configuration(mcpServers: ["pith": Server(command: binary.path, args: ["mcp", "--root", root.path])]))
        return String(decoding: data, as: UTF8.self)
    }

    /// Checks the real stdio handshake, advertised tools and scope. No disk scan or cleanup runs.
    public static func validateProbe(_ data: Data, root: URL) throws -> Int {
        struct Tool: Decodable { let name: String }
        struct Status: Decodable { let configuredRoot: String; let readOnly: Bool }
        struct Result: Decodable { let protocolVersion: String?; let tools: [Tool]?; let structuredContent: Status?; let isError: Bool? }
        struct Reply: Decodable { let id: Int; let result: Result? }
        let replies = try data.split(separator: 10).map { try JSONDecoder().decode(Reply.self, from: Data($0)) }
        guard replies.count == 3,
              replies.first(where: { $0.id == 1 })?.result?.protocolVersion == "2025-11-25",
              let tools = replies.first(where: { $0.id == 2 })?.result?.tools,
              Set(tools.map(\.name)) == toolNames,
              tools.count == toolNames.count,
              let status = replies.first(where: { $0.id == 3 })?.result,
              status.isError == false, status.structuredContent?.readOnly == true,
              let configuredRoot = status.structuredContent?.configuredRoot,
              let chosen = TrashPolicy.identity(of: root.path, following: true),
              TrashPolicy.identity(of: configuredRoot, following: true) == chosen else {
            throw DiskFailure("The MCP connection did not confirm its tools and chosen folder. Rebuild or reinstall Pith and try again.")
        }
        return tools.count
    }
}
