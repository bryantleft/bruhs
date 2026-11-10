import Foundation

/// A folder as Disk's path bar shows it: the disk it's on, by the disk's own name, then each folder from the disk's
/// root down to it. The startup disk's root reads as its name, such as "Macintosh HD", never as "/".
public struct FolderPath: Equatable, Sendable {
    /// A mounted volume: where it's mounted and its name as Finder shows it.
    public struct Volume: Equatable, Sendable {
        public let path: String
        public let name: String
        public init(path: String, name: String) { self.path = path; self.name = name }
    }

    public let volume: Volume
    /// Each folder below the volume's root down to the folder itself, outermost first. Empty at the root.
    public let folders: [String]

    init(volume: Volume, folders: [String]) {
        self.volume = volume
        self.folders = folders
    }

    /// `path` on whichever of `volumes` is mounted deepest above it: the startup disk, at "/", unless another disk is
    /// mounted on the way. Nil for a path none of them holds.
    public init?(_ path: String, volumes: [Volume]) {
        guard path.hasPrefix("/"),
              let volume = volumes.filter({ DiskChanges.isInside(path, $0.path) }).max(by: { $0.path.count < $1.path.count }) else { return nil }
        var folder = volume.path == "/" ? "" : volume.path
        let below = path == volume.path ? "" : path.dropFirst(folder.count + 1)
        self.init(volume: volume, folders: below.split(separator: "/").map { name in
            folder += "/" + name
            return folder
        })
    }

    /// The width the path bar gives each of its parts in `width`: the disk first, then each folder, the open one last.
    /// Each starts `full`. While they're too wide, the folders between the disk and the open one give way, outermost
    /// first: to their icons alone, `icons`, then out of the bar, 0. Only then do the disk's name and the open folder's
    /// shorten, the disk's first, never below `minimum`. Parts are `spacing` apart; one left out takes none.
    public static func fit(full: [CGFloat], icons: [CGFloat], minimum: [CGFloat], spacing: CGFloat, width: CGFloat) -> [CGFloat] {
        var given = full
        func excess() -> CGFloat {
            let shown = given.filter { $0 > 0 }
            return shown.reduce(0, +) + spacing * CGFloat(max(0, shown.count - 1)) - width
        }
        let between = given.indices.dropFirst().dropLast()
        for index in between where excess() > 0 { given[index] = icons[index] }
        for index in between where excess() > 0 { given[index] = 0 }
        for index in [given.startIndex, given.endIndex - 1] where given.indices.contains(index) && excess() > 0 {
            given[index] = max(minimum[index], given[index] - excess())
        }
        return given
    }

    /// Each folder's node from the map whose tree is `root`. A folder the tree doesn't hold, such as one above the
    /// map's root, gets a node with nothing listed: the map has no listing of it, which Pith's icon rule needs before
    /// it looks up a folder by its path inside a location macOS guards.
    public func nodes(in root: DiskNode?) -> [DiskNode] {
        folders.map { path in
            root?.folder(at: path) ?? DiskNode(kind: .dir, name: (path as NSString).lastPathComponent, path: path, size: 0, children: nil)
        }
    }
}

extension DiskNode {
    /// The folder at `path` in this tree, found by following the path down from here (`Toward`). Nil when the tree
    /// doesn't hold it, or holds something else there.
    public func folder(at path: String) -> DiskNode? {
        if path == self.path { return kind == .dir ? self : nil }
        guard let children, let toward = Toward(path, from: self.path),
              let next = children.indices.first(where: { children[$0].kind == .dir && toward.leads(to: children[$0].path) }) else { return nil }
        return children[next].folder(at: path)
    }
}
