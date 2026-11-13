import CryptoKit
import Foundation

/// The folder and file sizes of a finished scan, kept so the next scan of the same folder can say what grew. Only
/// sizes by path are kept, never contents, on this Mac only.
public struct ScanMemory: Codable, Sendable, Equatable {
    public let root: String
    public let date: Date
    public let sizes: [String: UInt64]
    /// The scan result's version. Scans of version 4 count APFS clones once, so comparing one with an older scan
    /// would report every folder of clones as shrinking. Nil in files kept before the version was recorded.
    public let version: Int?
    /// Totals whose contents were not fully readable. Optional for maps saved before coverage was recorded.
    public let incomplete: Set<String>?
    /// Folders whose immediate entries were all shown, so a previously absent child can be established as new.
    public let listedChildren: Set<String>?

    public init(root: String, date: Date, sizes: [String: UInt64], version: Int? = DiskResult.version, incomplete: Set<String> = [], listedChildren: Set<String> = []) {
        self.root = root; self.date = date; self.sizes = sizes; self.version = version; self.incomplete = incomplete
        self.listedChildren = listedChildren
    }

    /// Every folder and file the scan's tree holds by its own path.
    public init(_ result: DiskResult, date: Date) {
        var sizes: [String: UInt64] = [:]
        let entries = result.root.entries
        for node in entries where node.isItem { sizes[node.path] = node.size }
        var incomplete = Set<String>()
        let unreadable = Set(entries.filter { $0.kind == .unreadable }.map(\.path) + result.unreadableFolders.map(\.path))
        for unreadablePath in unreadable {
            var path = unreadablePath
            while DiskChanges.isInside(path, result.root.path) {
                incomplete.insert(path)
                if path == result.root.path { break }
                let parent = (path as NSString).deletingLastPathComponent
                if path == parent { break }
                path = parent
            }
        }
        if result.summary.entryErrors > 0 || result.summary.errors > UInt64(unreadable.count) {
            incomplete.formUnion(sizes.keys)
        }
        let listed = Set(entries.filter { node in
            guard node.kind == .dir, !incomplete.contains(node.path), let children = node.children,
                  !children.contains(where: { $0.kind == .aggregate || $0.kind == .unreadable }) else { return false }
            return children.reduce(UInt64(0)) { $0 + $1.size } == node.size
                && children.reduce(UInt64(0)) { $0 + $1.fileCount } == node.fileCount
        }.map(\.path))
        self.init(root: result.root.path, date: date, sizes: sizes, version: result.version, incomplete: incomplete, listedChildren: listed)
    }

    /// Whether this kept scan counted sizes the same way as `result`, so their differences are real changes.
    public func comparable(to result: DiskResult) -> Bool {
        version == result.version && root == result.root.path && incomplete != nil && listedChildren != nil
    }

    /// Whether `result`, made at `now`, is compared with this kept map: it counted sizes the same way, and it was kept
    /// before `now`, less than `age` before. One dated after `now`, as one kept before the clock went back, is no
    /// baseline: nothing grew since a time still to come, and the stretch from it to now would end before it began.
    public func isBaseline(of result: DiskResult, at now: Date, within age: TimeInterval = .infinity) -> Bool {
        comparable(to: result) && date <= now && now.timeIntervalSince(date) < age
    }

    /// How much each item changed since this scan, largest change first, at most `limit` of them and none under
    /// `threshold` bytes either way. Items new since then count from zero, unless `countingNew` is off, as for the live
    /// map, whose finer detail around the open folder holds items this one never could; items gone count down to zero.
    public func changes(to result: DiskResult, threshold: UInt64 = 1_000_000, limit: Int = 2000, countingNew: Bool = true) -> [String: Int64] {
        var changes: [String: Int64] = [:]
        let current = ScanMemory(result, date: date), now = current.sizes
        let unknown = (incomplete ?? []).union(current.incomplete ?? [])
        for (path, size) in now {
            let parent = (path as NSString).deletingLastPathComponent
            let newlyPresent = countingNew && listedChildren?.contains(parent) == true
            guard !unknown.contains(path), let before = sizes[path] ?? (newlyPresent ? 0 : nil) else { continue }
            let delta = Int64(bitPattern: size &- before)
            if delta.magnitude >= threshold { changes[path] = delta }
        }
        let folders = Dictionary(result.root.entries.filter { $0.kind == .dir }.map { ($0.path, $0) }, uniquingKeysWith: { first, _ in first })
        for (path, size) in sizes where now[path] == nil && size >= threshold {
            // A smaller map or lost access is not evidence of deletion. Only a fully shown parent can say it's gone.
            if !unknown.contains(path), let parent = folders[(path as NSString).deletingLastPathComponent],
               parent.children?.contains(where: { $0.kind == .aggregate }) != true {
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
