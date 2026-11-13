import Foundation

public struct GrowthItem: Identifiable, Equatable, Sendable {
    public let path: String
    public let before: UInt64
    public let current: UInt64
    public let change: Int64
    public let isFolder: Bool
    public let isRemoved: Bool
    public var id: String { path }
    public var name: String { URL(fileURLWithPath: path).lastPathComponent }

    public init(path: String, before: UInt64, current: UInt64, change: Int64, isFolder: Bool, isRemoved: Bool) {
        self.path = path; self.before = before; self.current = current; self.change = change
        self.isFolder = isFolder; self.isRemoved = isRemoved
    }
}

/// Before and after figures only for changes established by comparable, readable maps.
public enum GrowthComparison {
    public static func items(baseline: ScanMemory, current: DiskResult, changes: [String: Int64]) -> [GrowthItem] {
        guard baseline.comparable(to: current) else { return [] }
        return changes.compactMap { path, change in
            guard change != 0 else { return nil }
            let node = current.item(at: path)
            guard node?.isItem != false else { return nil }
            if let node {
                return GrowthItem(path: path, before: baseline.sizes[path] ?? 0, current: node.size, change: change,
                                  isFolder: node.kind == .dir, isRemoved: false)
            }
            guard change < 0, let before = baseline.sizes[path] else { return nil }
            return GrowthItem(path: path, before: before, current: 0, change: change, isFolder: false, isRemoved: true)
        }.sorted {
            $0.change.magnitude == $1.change.magnitude ? $0.path < $1.path : $0.change.magnitude > $1.change.magnitude
        }
    }

    /// The outermost changed entries below a folder, so its children aren't counted again alongside it.
    public static func outermost(_ items: [GrowthItem], inside root: String) -> [GrowthItem] {
        let inside = items.filter { $0.path != root && DiskChanges.isInside($0.path, root) }
        let paths = Set(inside.map(\.path))
        return inside.filter { item in
            var parent = (item.path as NSString).deletingLastPathComponent
            while parent != root && DiskChanges.isInside(parent, root) {
                if paths.contains(parent) { return false }
                let next = (parent as NSString).deletingLastPathComponent
                if parent == next { break }
                parent = next
            }
            return true
        }
    }
}
