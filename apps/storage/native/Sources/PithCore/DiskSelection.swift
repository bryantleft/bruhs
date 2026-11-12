import Foundation

/// The items selected on the disk map, in the order they were picked. A click selects one item; a ⌘-click adds one or,
/// already selected, takes it out, as in Finder. An item inside a folder that's also picked is dropped, since the folder
/// holds it: the selection never counts, measures or moves anything twice. Pith keeps it, and the map's page outlines
/// what Pith says is selected.
///
/// It keeps what the map last showed of each item, its node and so its size: an item a newer map folds into its
/// folder's smaller items stays selected, with that size, for as long as it's on the disk, so the bar's count and Size
/// hold and Move to Trash takes it too. The map draws no outline for it.
public struct DiskSelection: Equatable, Sendable {
    /// The items picked, by path, each outside every other.
    public private(set) var paths: [String] {
        didSet {
            let picked = Set(paths)
            shown = shown.filter { picked.contains($0.key) }
        }
    }
    /// What the map last showed of each item, by its path: the node of the newest map that had it.
    public private(set) var shown: [String: DiskNode] = [:]

    public init(_ paths: [String] = []) { self.paths = Self.normalized(paths) }

    /// The items of `items`, as Undo puts them back, each with what the map had of it.
    public init(items: [DiskNode]) {
        self.init(items.map(\.path))
        for item in items where paths.contains(item.path) { shown[item.path] = item }
    }

    /// Whether `other` picks the same items, in the same order, whatever nodes each keeps: a newer map moves the nodes,
    /// and the items picked stay the same, which says whether to measure them again (`DiskModel.setSelection`). Two
    /// selections are equal only when their nodes are too, so a newer node set in their place is a change Observation
    /// tells its views of.
    public func picksSameItems(as other: DiskSelection) -> Bool { paths == other.paths }

    public var isEmpty: Bool { paths.isEmpty }

    /// The items as the map last showed each, in the order they were picked.
    public var items: [DiskNode] { paths.compactMap { shown[$0] } }

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

    /// Shift and an arrow key on `path`: it joins the selection, and an item selected already stays, since a held key
    /// asks for it again before the page shows it selected. An item inside a folder already selected changes nothing.
    public mutating func add(_ path: String) { paths = Self.normalized(paths + [path]) }

    /// Keeps the items `keeps` says, as a newer map still has them.
    public mutating func keep(where keeps: (String) -> Bool) { paths = paths.filter(keeps) }

    /// Keeps the items still on the map once `folder` is open: those inside it. The folder itself is the map, not an
    /// item on it.
    public mutating func keep(inside folder: String) {
        keep { $0 != folder && DiskChanges.isInside($0, folder) }
    }

    /// A newer map, `map`: each item it shows takes its node from it. The items it doesn't show, folded into their
    /// folders' smaller items or gone from the disk, keep the nodes they had, and their paths come back, for Pith to look
    /// at the disk for them (`drop`).
    public mutating func follow(_ map: DiskResult?) -> [String] {
        var unshown: [String] = []
        for path in paths {
            if let node = map?.item(at: path) { shown[path] = node } else { unshown.append(path) }
        }
        return unshown
    }

    /// Whether Pith may look at the disk for the selected item at `path`, which `map` no longer shows: not while a folder
    /// above it on the map, or the item itself, is one the map couldn't read, drawn or only in its list of them
    /// (`DiskResult.couldntRead(toward:)`), nor, inside a location macOS guards (`isGuarded`), while macOS may be holding
    /// some of the map's folders (`asking`, as the icon rule takes it). A look there could wait on macOS or bring its
    /// question, so the item stays selected until the map can read there again.
    public static func mayLook(for path: String, in map: DiskResult?, asking: Bool, isGuarded: (String) -> Bool) -> Bool {
        if asking && isGuarded(path) { return false }
        return map?.couldntRead(toward: path) != true
    }

    /// The items of `gone` are no longer on the disk: they leave the selection.
    public mutating func drop(_ gone: Set<String>) {
        keep { !gone.contains($0) }
    }
}
