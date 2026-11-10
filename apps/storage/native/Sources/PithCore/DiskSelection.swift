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
