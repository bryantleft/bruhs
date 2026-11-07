import CryptoKit
import Foundation

/// The folder and file sizes of a finished scan, kept so the next scan of the same folder can say what grew. Only
/// sizes by path are kept, never contents, on this Mac only.
public struct ScanMemory: Codable, Sendable, Equatable {
    public let root: String
    public let date: Date
    public let sizes: [String: UInt64]

    public init(root: String, date: Date, sizes: [String: UInt64]) { self.root = root; self.date = date; self.sizes = sizes }

    /// Every folder and file the scan's tree holds by its own path.
    public init(_ result: DiskResult, date: Date) {
        var sizes: [String: UInt64] = [:]
        for node in result.root.entries where node.isItem { sizes[node.path] = node.size }
        self.init(root: result.root.path, date: date, sizes: sizes)
    }

    /// How much each item changed since this scan, largest change first, at most `limit` of them and none under
    /// `threshold` bytes either way. Items new since then count from zero; items gone count down to zero.
    public func changes(to result: DiskResult, threshold: UInt64 = 1_000_000, limit: Int = 2000) -> [String: Int64] {
        var changes: [String: Int64] = [:]
        let now = ScanMemory(result, date: date).sizes
        for (path, size) in now {
            let before = sizes[path] ?? 0
            let delta = Int64(bitPattern: size &- before)
            if delta.magnitude >= threshold { changes[path] = delta }
        }
        for (path, size) in sizes where now[path] == nil && size >= threshold {
            // Gone, unless the new tree just folded it into a group: then its parent's change says it.
            if result.root.entries.contains(where: { $0.path == (path as NSString).deletingLastPathComponent && $0.kind == .dir }) {
                changes[path] = -Int64(size)
            }
        }
        let kept = changes.sorted { $0.value.magnitude > $1.value.magnitude }.prefix(limit)
        return Dictionary(uniqueKeysWithValues: kept.map { ($0.key, $0.value) })
    }

    /// Where a root's last scan is kept: one file per scanned folder, named by a hash of its path.
    public static func file(for root: String, in folder: URL) -> URL {
        let digest = SHA256.hash(data: Data(root.utf8)).prefix(12).map { String(format: "%02x", $0) }.joined()
        return folder.appendingPathComponent("\(digest).json")
    }
}
