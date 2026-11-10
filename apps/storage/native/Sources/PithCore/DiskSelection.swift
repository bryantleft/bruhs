import Foundation

/// The items selected on the disk map, in the order they were picked. A click selects one item; a ⌘-click adds one or,
/// already selected, takes it out, as in Finder. An item inside a folder that's also picked is dropped, since the folder
/// holds it: the selection never counts, measures or moves anything twice. Pith keeps it, and the map's page outlines
/// what Pith says is selected.
public struct DiskSelection: Equatable, Sendable {
    /// The items picked, by path, each outside every other.
    public private(set) var paths: [String]

    public init(_ paths: [String] = []) { self.paths = Self.normalized(paths) }

    public var isEmpty: Bool { paths.isEmpty }

    /// `paths` without an item inside another of them, nor one picked twice, in the order they were picked: a folder
    /// picked after what it holds takes their place at the end.
    public static func normalized(_ paths: [String]) -> [String] {
        var kept: [String] = []
        for path in paths where !kept.contains(where: { DiskChanges.isInside(path, $0) }) {
            kept.removeAll { DiskChanges.isInside($0, path) }
            kept.append(path)
        }
        return kept
    }

    /// A click: just `paths` are selected, or nothing.
    public mutating func select(_ paths: [String]) { self.paths = Self.normalized(paths) }

    /// A ⌘-click on `path`: it joins the selection, or leaves it when it's selected already. An item inside a folder
    /// already selected changes nothing.
    public mutating func toggle(_ path: String) {
        if paths.contains(path) { paths.removeAll { $0 == path } } else { paths = Self.normalized(paths + [path]) }
    }

    /// Keeps the items `keeps` says, as a newer map still has them.
    public mutating func keep(where keeps: (String) -> Bool) { paths = paths.filter(keeps) }

    /// Keeps the items still on the map once `folder` is open: those inside it. The folder itself is the map, not an
    /// item on it.
    public mutating func keep(inside folder: String) {
        keep { $0 != folder && DiskChanges.isInside($0, folder) }
    }
}

/// When Pith measures what deleting the selection frees (`ScannerRunner.frees`): once for each selection, and again
/// only when an item's size has moved by more than `threshold` since the measurement in hand began. One measurement
/// runs at a time, so a folder that changes all the time still gets its figure, a measurement's length apart.
public struct FreesSchedule: Sendable {
    /// A megabyte as Pith counts and shows sizes (`formatBytes`): 10^6 bytes.
    public static let threshold: UInt64 = 1_000_000

    /// The selected items' sizes, by path, when the measurement under way or the last one began; nil with nothing selected.
    private var basis: [String: UInt64]?
    private var measuring = false

    public init() {}

    /// Whether items of `sizes` differ from those `measured` was taken of: other items, or one whose size moved by
    /// more than `threshold`, either way.
    public static func moved(from measured: [String: UInt64], to sizes: [String: UInt64]) -> Bool {
        guard Set(measured.keys) == Set(sizes.keys) else { return true }
        return sizes.contains { path, size in
            let before = measured[path] ?? 0
            return (size > before ? size - before : before - size) > threshold
        }
    }

    /// The selection changed to items of `sizes`: whether to measure them, as for any selection but none. A measurement
    /// of the last one is the last one's, and is dropped.
    public mutating func selected(_ sizes: [String: UInt64]) -> Bool {
        guard !sizes.isEmpty else { basis = nil; measuring = false; return false }
        basis = sizes
        measuring = true
        return true
    }

    /// A newer map gives the same items `sizes`: whether to measure them again now.
    public mutating func mapChanged(_ sizes: [String: UInt64]) -> Bool {
        guard !measuring, let basis, !sizes.isEmpty, Self.moved(from: basis, to: sizes) else { return false }
        self.basis = sizes
        measuring = true
        return true
    }

    /// The measurement under way came, when the items are `now`: whether they moved meanwhile, so it's taken again.
    public mutating func landed(now sizes: [String: UInt64]) -> Bool {
        measuring = false
        return mapChanged(sizes)
    }

    /// The measurement under way failed. The next map whose items moved measures again; trying again at once would
    /// likely fail again.
    public mutating func failed() { measuring = false }
}
