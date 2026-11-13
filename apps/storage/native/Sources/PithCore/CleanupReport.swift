import Foundation

/// The scanner's metadata-only `analyze` report. Recommendations use the same classifier as Pith's MCP server.
public struct CleanupReport: Decodable, Sendable {
    public let root: String
    public let startedAt: UInt64
    public let completedAt: UInt64
    public let summary: DiskSummary
    public let candidates: [CleanupCandidate]
    public let unreadableFolders: [DiskUnreadableFolder]
    public let guidance: String

    public var measuredAt: Date { Date(timeIntervalSince1970: Double(completedAt)) }

    /// Only the report's complete, directly actionable candidates can enter a cleanup move. The normal Trash policy
    /// still checks containment, protected identities and current existence, including items the live map pruned.
    public func trashBatch(paths: [String], home: URL) -> Result<TrashBatch, DiskFailure> {
        let allowed = candidates.reduce(into: [String: CleanupCandidate]()) { $0[$1.path] = $1 }
        guard allowed.count == candidates.count else {
            return .failure(DiskFailure("The cleanup report contains duplicate items. Check Again before cleaning up."))
        }
        var kept: [String: DiskNode] = [:]
        for path in DiskSelection.normalized(paths) {
            guard let item = allowed[path], item.canMoveToTrash else {
                return .failure(DiskFailure("This selection includes an item that needs review in its own app or wasn’t fully measured. Select readable cleanup recommendations instead."))
            }
            var metadata = stat()
            guard lstat(path, &metadata) == 0 else {
                return .failure(DiskFailure("\(item.name) no longer exists or can’t be inspected. Check Again before cleaning up."))
            }
            let folder = metadata.st_mode & S_IFMT == S_IFDIR
            kept[path] = DiskNode(kind: folder ? .dir : .file, name: item.name, path: path, size: item.allocatedBytes,
                                 files: folder ? nil : 1, children: folder ? [] : nil)
        }
        let node = DiskNode(kind: .dir, name: URL(fileURLWithPath: root).lastPathComponent, path: root, size: summary.bytes, children: [])
        return TrashBatch.plan(paths, result: DiskResult(root: node, topFiles: [], summary: summary), home: home, kept: kept)
    }

    public static func decode(_ data: Data, root: URL) throws -> CleanupReport {
        struct Tag: Decodable { let type: String?; let reason: String? }
        let tag = try JSONDecoder().decode(Tag.self, from: data)
        if tag.type == "fatal" { throw DiskFailure(tag.reason ?? "Pith couldn’t inspect this folder for cleanup.", isComplete: true) }
        let report = try JSONDecoder().decode(Self.self, from: data)
        // Foundation and Rust can spell /private/var and /var differently on the startup disk.
        let expected = root.resolvingSymlinksInPath().standardizedFileURL.path
        let actual = URL(fileURLWithPath: report.root).resolvingSymlinksInPath().standardizedFileURL.path
        guard report.root.hasPrefix("/"), actual == expected, report.startedAt <= report.completedAt else {
            throw DiskFailure("The cleanup report belongs to a different folder or has invalid measurement times. Check Again before cleaning up.")
        }
        var paths = Set<String>()
        for item in report.candidates {
            guard item.path.hasPrefix("/"), !item.path.utf8.contains(0),
                  !item.path.split(separator: "/").contains(where: { $0 == "." || $0 == ".." }),
                  DiskChanges.isInside(item.path, report.root), item.allocatedBytes > 0,
                  paths.insert(item.path).inserted else {
                throw DiskFailure("The cleanup report contains an invalid item. Check Again before cleaning up.")
            }
        }
        for path in paths {
            var ancestor = (path as NSString).deletingLastPathComponent
            while DiskChanges.isInside(ancestor, report.root) {
                guard !paths.contains(ancestor) else {
                    throw DiskFailure("The cleanup report contains overlapping items. Check Again before cleaning up.")
                }
                let parent = (ancestor as NSString).deletingLastPathComponent
                if parent == ancestor { break }
                ancestor = parent
            }
        }
        return report
    }
}

public struct CleanupCandidate: Decodable, Sendable, Identifiable, Equatable {
    public enum Risk: String, Decodable, Sendable, CaseIterable {
        case rebuildable, review, managed

        public var title: String {
            switch self {
            case .rebuildable: "Rebuildable"
            case .review: "Review first"
            case .managed: "Manage in its app"
            }
        }
    }

    public let path: String
    public let allocatedBytes: UInt64
    public let category: String
    public let risk: Risk
    public let reason: String
    public let caution: String
    public let nextStep: String
    public let unreadableFolders: UInt64

    public var id: String { path }
    public var name: String { URL(fileURLWithPath: path).lastPathComponent }
    public var canMoveToTrash: Bool { risk != .managed && category != "trash" && unreadableFolders == 0 }

    public init(path: String, allocatedBytes: UInt64, category: String, risk: Risk, reason: String, caution: String, nextStep: String, unreadableFolders: UInt64) {
        self.path = path; self.allocatedBytes = allocatedBytes; self.category = category; self.risk = risk
        self.reason = reason; self.caution = caution; self.nextStep = nextStep; self.unreadableFolders = unreadableFolders
    }
}
