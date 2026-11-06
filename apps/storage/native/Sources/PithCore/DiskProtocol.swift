import Foundation

public struct DiskNode: Codable, Sendable {
    public enum Kind: String, Codable, Sendable { case dir, file, aggregate }
    public let kind: Kind
    public let name: String
    public let path: String
    public let size: UInt64
    public let children: [DiskNode]?
    public var entries: [DiskNode] { [self] + (children ?? []).flatMap(\.entries) }
}

public struct DiskFile: Codable, Sendable {
    public let name: String
    public let path: String
    public let size: UInt64
}

public struct DiskSummary: Codable, Sendable {
    public let dirs: UInt64
    public let files: UInt64
    public let bytes: UInt64
    public let errors: UInt64
    public let elapsedMs: UInt64
    public let engine: String
}

public struct DiskResult: Codable, Sendable {
    public let type: String
    public let version: Int
    public let root: DiskNode
    public let topFiles: [DiskFile]
    public let summary: DiskSummary
    public func validate() throws {
        guard type == "result", version == 2, root.kind == .dir, root.path.hasPrefix("/"), ["bulk", "std"].contains(summary.engine) else {
            throw DiskFailure("Scanner result has an unsupported version or root.")
        }
    }
}

public struct DiskFailure: LocalizedError, Sendable {
    public let message: String
    public init(_ message: String) { self.message = message }
    public var errorDescription: String? { message }
}

public enum DiskEvent: Sendable {
    case progress(files: UInt64, bytes: UInt64, errors: UInt64)
    case result(DiskResult)
}

public struct DiskStreamDecoder {
    private var pending = Data()
    public init() {}
    public mutating func feed(_ bytes: Data) throws -> [DiskEvent] {
        pending.append(bytes)
        var events: [DiskEvent] = []
        while let end = pending.firstIndex(of: 10) {
            let line = Data(pending[..<end])
            pending.removeSubrange(...end)
            if !line.isEmpty { events.append(try decode(line)) }
        }
        return events
    }
    public mutating func finish() throws -> [DiskEvent] {
        guard !pending.isEmpty else { return [] }
        let line = pending; pending.removeAll()
        return [try decode(line)]
    }
    private func decode(_ data: Data) throws -> DiskEvent {
        struct Tag: Decodable { let type: String; let reason: String? }
        let decoder = JSONDecoder()
        let tag = try decoder.decode(Tag.self, from: data)
        switch tag.type {
        case "progress":
            struct Progress: Decodable { let files: UInt64; let bytes: UInt64; let errors: UInt64 }
            let p = try decoder.decode(Progress.self, from: data)
            return .progress(files: p.files, bytes: p.bytes, errors: p.errors)
        case "result":
            let result = try decoder.decode(DiskResult.self, from: data)
            try result.validate()
            return .result(result)
        case "fatal": throw DiskFailure(tag.reason ?? "The scanner could not complete the scan.")
        default: throw DiskFailure("Unexpected scanner event: \(tag.type)")
        }
    }
}

public enum TrashPolicy {
    public static func resolve(_ input: String, result: DiskResult, home: URL) throws -> URL {
        guard input.hasPrefix("/"), !input.utf8.contains(0) else { throw DiskFailure("Select an absolute path from the current scan.") }
        let entries = result.root.entries
        let node = entries.first(where: { $0.path == input }) ?? result.topFiles.first(where: { $0.path == input }).map {
            DiskNode(kind: .file, name: $0.name, path: $0.path, size: $0.size, children: nil)
        }
        guard let node, node.kind != .aggregate,
              !input.split(separator: "/").contains("__other__") else {
            throw DiskFailure("This item is not a real entry in the current scan. Rescan before moving it to Trash.")
        }
        let normalized = URL(fileURLWithPath: input).standardizedFileURL
        let target = normalized.deletingLastPathComponent().resolvingSymlinksInPath().appendingPathComponent(normalized.lastPathComponent)
        let root = URL(fileURLWithPath: result.root.path).resolvingSymlinksInPath().standardizedFileURL
        let home = home.resolvingSymlinksInPath().standardizedFileURL
        func inside(_ child: URL, _ parent: URL) -> Bool {
            child.path != parent.path && child.pathComponents.starts(with: parent.pathComponents)
        }
        guard inside(target, root), target.deletingLastPathComponent().path != "/",
              target.path != home.path, !inside(home, target) else {
            throw DiskFailure("This path is protected or is outside the scanned folder.")
        }
        var statInfo = stat()
        guard lstat(target.path, &statInfo) == 0 else { throw DiskFailure("The item no longer exists or cannot be read. Rescan and try again.") }
        return target
    }
}

public enum BridgePolicy {
    public static func allows(url: URL?, mainFrame: Bool) -> Bool {
        guard mainFrame, let url else { return false }
        return url.scheme == "pith" && url.host == "app" && url.path == "/index.html"
            && url.user == nil && url.password == nil && url.port == nil && url.query == nil
    }
}
