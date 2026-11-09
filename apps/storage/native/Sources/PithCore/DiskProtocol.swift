import Foundation

/// A node of the scanner's pruned tree (`TreeNode` in scanner/src/model.rs).
public struct DiskNode: Codable, Sendable, Equatable {
    public enum Kind: String, Codable, Sendable {
        case dir, file
        /// The scanner's "(smaller items)": small files and folders folded into one node with no path on disk.
        case aggregate
        /// A folder the scan couldn't read. Its size is unknown, so it's 0.
        case unreadable
        /// Another volume mounted here. Its size is its used space when it shares the scanned disk, otherwise 0.
        case volume
    }

    /// Why a folder couldn't be read.
    public enum Reason: String, Codable, Sendable {
        /// macOS privacy protection; Full Disk Access lifts it for most folders.
        case protected
        /// The folder's permissions: another user's or the system's files.
        case denied
        case other
    }

    public let kind: Kind
    public let name: String
    public let path: String
    public let size: UInt64
    public let reason: Reason?
    public let sharesDisk: Bool?
    /// Files inside a folder or an aggregate; nil for a file, which is one.
    public let files: UInt64?
    /// An aggregate's bytes by file kind ("code", "image", …), so the map's legend counts grouped items as what they are.
    public let kinds: [String: UInt64]?
    /// A folder's or aggregate's APFS clones that `size` leaves out: another copy of each holds the shared blocks, and
    /// the scan counts them there. Nil when it has none.
    public let clones: UInt64?
    public let children: [DiskNode]?

    public init(kind: Kind, name: String, path: String, size: UInt64, reason: Reason? = nil, sharesDisk: Bool? = nil, files: UInt64? = nil,
                kinds: [String: UInt64]? = nil, clones: UInt64? = nil, children: [DiskNode]?) {
        self.kind = kind; self.name = name; self.path = path; self.size = size
        self.reason = reason; self.sharesDisk = sharesDisk; self.files = files; self.kinds = kinds; self.clones = clones; self.children = children
    }

    public var entries: [DiskNode] { [self] + (children ?? []).flatMap(\.entries) }

    /// A real file or folder: something to select, reveal and move to the Trash.
    public var isItem: Bool { kind == .dir || kind == .file }

    /// How many files this node stands for.
    public var fileCount: UInt64 { kind == .file ? 1 : files ?? 0 }

    func with(size: UInt64, files: UInt64?, clones: UInt64? = nil, children: [DiskNode]?) -> DiskNode {
        // A shrunken group's kinds shrink in proportion: which kind the removed file was isn't known here.
        let scaled = kinds.map { kinds in
            self.size > 0 ? kinds.mapValues { UInt64(Double($0) * Double(size) / Double(self.size)) } : kinds
        }
        let clones = (clones ?? self.clones).flatMap { $0 > 0 ? $0 : nil }
        return DiskNode(kind: kind, name: name, path: path, size: size, reason: reason, sharesDisk: sharesDisk, files: files, kinds: scaled,
                        clones: clones, children: children)
    }
}

public struct DiskFile: Codable, Sendable, Equatable {
    public let name: String
    public let path: String
    public let size: UInt64
    public init(name: String, path: String, size: UInt64) { self.name = name; self.path = path; self.size = size }
}

public struct DiskVolume: Codable, Sendable, Equatable {
    public let path: String
    public let name: String
    /// Used space, when the volume shares the scanned disk; otherwise 0.
    public let bytes: UInt64
    public let sharesDisk: Bool
    public init(path: String, name: String, bytes: UInt64, sharesDisk: Bool) { self.path = path; self.name = name; self.bytes = bytes; self.sharesDisk = sharesDisk }
}

public struct DiskUnreadableFolder: Codable, Sendable, Equatable {
    public let path: String
    public let reason: DiskNode.Reason
    public init(path: String, reason: DiskNode.Reason) { self.path = path; self.reason = reason }
}

public struct DiskSummary: Codable, Sendable, Equatable {
    public struct Unreadable: Codable, Sendable, Equatable {
        public let protected: UInt64
        public let denied: UInt64
        public let other: UInt64
        public init(protected: UInt64, denied: UInt64, other: UInt64) { self.protected = protected; self.denied = denied; self.other = other }
    }

    public struct CloudOnly: Codable, Sendable, Equatable {
        public let files: UInt64
        /// The files' full sizes, which they'd take once downloaded.
        public let bytes: UInt64
        /// Folders whose contents macOS hasn't listed.
        public let folders: UInt64
        public init(files: UInt64, bytes: UInt64, folders: UInt64) { self.files = files; self.bytes = bytes; self.folders = folders }
    }

    public let dirs: UInt64
    public let files: UInt64
    /// The scanned folder's size, volumes that share its disk included.
    public let bytes: UInt64
    /// Folders the scan couldn't read.
    public let errors: UInt64
    public let unreadable: Unreadable
    public let entryErrors: UInt64
    public let cloudOnly: CloudOnly
    /// Full clones counted once, at another copy of their group.
    public struct Clones: Codable, Sendable, Equatable {
        public let files: UInt64
        /// Their sizes, which `bytes` leaves out.
        public let bytes: UInt64
        public init(files: UInt64, bytes: UInt64) { self.files = files; self.bytes = bytes }
    }

    public let elapsedMs: UInt64
    public let engine: String
    public let clones: Clones?

    public init(dirs: UInt64, files: UInt64, bytes: UInt64, errors: UInt64, unreadable: Unreadable, entryErrors: UInt64, cloudOnly: CloudOnly, elapsedMs: UInt64, engine: String,
                clones: Clones? = nil) {
        self.dirs = dirs; self.files = files; self.bytes = bytes; self.errors = errors; self.unreadable = unreadable
        self.entryErrors = entryErrors; self.cloudOnly = cloudOnly; self.elapsedMs = elapsedMs; self.engine = engine; self.clones = clones
    }

    func with(bytes: UInt64, files: UInt64, errors: UInt64? = nil, unreadable: Unreadable? = nil) -> DiskSummary {
        DiskSummary(dirs: dirs, files: files, bytes: bytes, errors: errors ?? self.errors, unreadable: unreadable ?? self.unreadable, entryErrors: entryErrors, cloudOnly: cloudOnly, elapsedMs: elapsedMs, engine: engine,
                    clones: clones)
    }
}

public struct DiskResult: Codable, Sendable {
    /// `RESULT_VERSION` in scanner/src/output.rs.
    public static let version = 4
    public let type: String
    public let version: Int
    public let root: DiskNode
    public let topFiles: [DiskFile]
    public let volumes: [DiskVolume]
    public let unreadableFolders: [DiskUnreadableFolder]
    public let summary: DiskSummary

    public init(type: String = "result", version: Int = DiskResult.version, root: DiskNode, topFiles: [DiskFile], volumes: [DiskVolume] = [], unreadableFolders: [DiskUnreadableFolder] = [], summary: DiskSummary) {
        self.type = type; self.version = version; self.root = root; self.topFiles = topFiles
        self.volumes = volumes; self.unreadableFolders = unreadableFolders; self.summary = summary
    }

    public func validate() throws {
        if type == "result", version == Self.version, root.kind == .unreadable {
            let name = root.name.isEmpty ? root.path : root.name
            switch root.reason {
            case .protected?: throw DiskFailure("macOS protects \(name), so Pith can’t read it. Give Pith Full Disk Access, then scan again.", needsDiskAccess: true)
            case .denied?: throw DiskFailure("\(name)’s permissions don’t let you read it, so Pith can’t scan it.", isComplete: true)
            default: throw DiskFailure("Pith couldn’t read \(name).", isComplete: true)
            }
        }
        guard type == "result", version == Self.version, root.kind == .dir, root.path.hasPrefix("/"), ["bulk", "std"].contains(summary.engine) else {
            throw DiskFailure("Scanner result has an unsupported version or root.")
        }
    }

    /// The real file or folder at `path`, from the tree or the largest-files list.
    public func item(at path: String) -> DiskNode? {
        root.entries.first { $0.path == path && $0.isItem }
            ?? topFiles.first { $0.path == path }.map { DiskNode(kind: .file, name: $0.name, path: $0.path, size: $0.size, children: nil) }
    }

    /// The scan with the item at `path` gone, as after moving it to the Trash: every folder above it shrinks by its size
    /// and files. Nil when the tree doesn't hold the item.
    public func removing(_ path: String) -> DiskResult? {
        guard path != root.path, let (tree, removed) = Self.remove(path, from: root) else {
            // A file shown only in the largest-files list lies inside an aggregate, which already counts it.
            guard let file = topFiles.first(where: { $0.path == path }), let tree = Self.shrink(root, toward: path, size: file.size, files: 1) else { return nil }
            return DiskResult(root: tree, topFiles: topFiles.filter { $0.path != path }, volumes: volumes, unreadableFolders: unreadableFolders,
                              summary: summary.with(bytes: tree.size, files: summary.files.saturatingSubtract(1)))
        }
        let inside = { (other: String) in other == path || other.hasPrefix(path + "/") }
        let unreadable = unreadableFolders.filter { !inside($0.path) }
        return DiskResult(root: tree, topFiles: topFiles.filter { !inside($0.path) }, volumes: volumes.filter { !inside($0.path) }, unreadableFolders: unreadable,
                          summary: summary.with(bytes: tree.size, files: summary.files.saturatingSubtract(removed.fileCount)))
    }

    /// The scan with the folder at `path` replaced by a newer scan of that folder, whose detail is finer: the scanner
    /// prunes by the scanned folder's own size.
    public func replacing(_ path: String, with scan: DiskResult) -> DiskResult? {
        guard scan.root.path == path else { return nil }
        if path == root.path { return scan }
        guard let tree = Self.replace(path, in: root, with: scan.root) else { return nil }
        let inside = { (other: String) in other == path || other.hasPrefix(path + "/") }
        let old = root.entries.first { $0.path == path }
        let top = (topFiles.filter { !inside($0.path) } + scan.topFiles).sorted { $0.size > $1.size }.prefix(topFiles.count)
        let gone = unreadableFolders.filter { inside($0.path) }
        let unreadable = unreadableFolders.filter { !inside($0.path) } + scan.unreadableFolders
        let files = summary.files.saturatingSubtract(old?.fileCount ?? 0) + scan.summary.files
        // The old counts less the folders the newer scan covers, plus what it couldn't read.
        func count(_ reason: DiskNode.Reason, _ total: KeyPath<DiskSummary.Unreadable, UInt64>) -> UInt64 {
            summary.unreadable[keyPath: total].saturatingSubtract(UInt64(gone.filter { $0.reason == reason }.count)) + scan.summary.unreadable[keyPath: total]
        }
        let counts = DiskSummary.Unreadable(protected: count(.protected, \.protected), denied: count(.denied, \.denied), other: count(.other, \.other))
        return DiskResult(root: tree, topFiles: Array(top), volumes: volumes.filter { !inside($0.path) } + scan.volumes, unreadableFolders: unreadable,
                          summary: summary.with(bytes: tree.size, files: files, errors: counts.protected + counts.denied + counts.other, unreadable: counts))
    }

    private static func remove(_ path: String, from node: DiskNode) -> (DiskNode, removed: DiskNode)? {
        guard let children = node.children else { return nil }
        let without = { (removed: DiskNode) in (node.clones ?? 0).saturatingSubtract(removed.clones ?? 0) }
        if let index = children.firstIndex(where: { $0.path == path }) {
            let removed = children[index]
            var rest = children; rest.remove(at: index)
            return (node.with(size: node.size.saturatingSubtract(removed.size), files: node.files.map { $0.saturatingSubtract(removed.fileCount) },
                              clones: without(removed), children: rest), removed)
        }
        guard let index = children.firstIndex(where: { path.hasPrefix($0.path + "/") && $0.kind == .dir }),
              let (child, removed) = remove(path, from: children[index]) else { return nil }
        var updated = children; updated[index] = child
        return (node.with(size: node.size.saturatingSubtract(removed.size), files: node.files.map { $0.saturatingSubtract(removed.fileCount) },
                          clones: without(removed), children: updated), removed)
    }

    /// Shrinks the folders above `path` and the aggregate holding it, for an item the tree folded away.
    private static func shrink(_ node: DiskNode, toward path: String, size: UInt64, files: UInt64) -> DiskNode? {
        let children = node.children ?? []
        var updated = children
        if let index = children.firstIndex(where: { path.hasPrefix($0.path + "/") && $0.kind == .dir }), let child = shrink(children[index], toward: path, size: size, files: files) {
            updated[index] = child
        } else if let index = children.firstIndex(where: { $0.kind == .aggregate }) {
            let aggregate = children[index]
            updated[index] = aggregate.with(size: aggregate.size.saturatingSubtract(size), files: aggregate.files.map { $0.saturatingSubtract(files) }, children: nil)
        } else {
            return nil
        }
        return node.with(size: node.size.saturatingSubtract(size), files: node.files.map { $0.saturatingSubtract(files) }, children: updated)
    }

    private static func replace(_ path: String, in node: DiskNode, with fresh: DiskNode) -> DiskNode? {
        guard var children = node.children else { return nil }
        let index: Int
        let child: DiskNode
        if let found = children.firstIndex(where: { $0.path == path }) {
            index = found; child = fresh
        } else if let found = children.firstIndex(where: { path.hasPrefix($0.path + "/") && $0.kind == .dir }), let inner = replace(path, in: children[found], with: fresh) {
            index = found; child = inner
        } else { return nil }
        let old = children[index]
        children[index] = DiskNode(kind: child.kind, name: old.name, path: child.path, size: child.size, reason: child.reason, sharesDisk: child.sharesDisk,
                                   files: child.files, kinds: child.kinds, clones: child.clones, children: child.children)
        children.sort { $0.size > $1.size }
        let size = node.size.saturatingSubtract(old.size) + child.size
        let files = node.files.map { $0.saturatingSubtract(old.fileCount) + child.fileCount }
        let clones = (node.clones ?? 0).saturatingSubtract(old.clones ?? 0) + (child.clones ?? 0)
        return node.with(size: size, files: files, clones: clones, children: children)
    }
}

extension UInt64 {
    public func saturatingSubtract(_ other: UInt64) -> UInt64 { self >= other ? self - other : 0 }
}

public struct DiskFailure: LocalizedError, Sendable {
    public let message: String
    /// macOS's privacy protection caused it, so Full Disk Access is the fix to offer.
    public let needsDiskAccess: Bool
    /// The scanner said this itself, as a sentence for the user, so its exit code and log would only add noise.
    public let isComplete: Bool
    public init(_ message: String, needsDiskAccess: Bool = false, isComplete: Bool = false) {
        self.message = message; self.needsDiskAccess = needsDiskAccess; self.isComplete = isComplete || needsDiskAccess
    }
    public var errorDescription: String? { message }
}

public enum DiskEvent: Sendable {
    case progress(files: UInt64, bytes: UInt64, errors: UInt64)
    case result(DiskResult)
}

/// Splits a byte stream into its newline-ended lines, looking at each byte once. The scanner's map of a whole disk is
/// one 3 MB line that arrives 64 KB at a time: searching all that had arrived again with every read took a quarter of a
/// core while Disk was on screen.
public struct LineSplitter {
    private var buffer = Data()
    /// The bytes of `buffer` already searched, none of them a newline.
    private var searched = 0

    public init() {}

    /// The lines `bytes` completes, without their newlines.
    public mutating func feed(_ bytes: Data) -> [Data] {
        buffer.append(bytes)
        var lines: [Data] = []
        var start = 0
        buffer.withUnsafeBytes { raw in
            guard let base = raw.baseAddress else { return }
            var from = searched
            while from < raw.count, let newline = memchr(base + from, 10, raw.count - from) {
                let end = UnsafeRawPointer(newline) - base
                lines.append(Data(bytes: base + start, count: end - start))
                start = end + 1
                from = start
            }
        }
        if start > 0 { buffer.removeSubrange(0..<start) }
        searched = buffer.count
        return lines
    }

    /// What came after the last newline, as when a stream ends without one.
    public mutating func rest() -> Data {
        defer { buffer = Data(); searched = 0 }
        return buffer
    }
}

public struct DiskStreamDecoder {
    private var lines = LineSplitter()
    public init() {}
    public mutating func feed(_ bytes: Data) throws -> [DiskEvent] {
        try lines.feed(bytes).filter { !$0.isEmpty }.map(decode)
    }
    public mutating func finish() throws -> [DiskEvent] {
        let line = lines.rest()
        guard !line.isEmpty else { return [] }
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
        case "fatal": throw DiskFailure(tag.reason ?? "The scanner could not complete the scan.", isComplete: tag.reason != nil)
        default: throw DiskFailure("Unexpected scanner event: \(tag.type)")
        }
    }
}

/// What deleting an item frees now (`Frees` in scanner/src/frees.rs): the bytes no clone, hard link or snapshot
/// outside it shares. Moving it to the Trash frees them once the Trash is emptied.
public struct DiskFrees: Codable, Sendable, Equatable {
    public let bytes: UInt64
    /// Bytes clones or hard links outside it share, which they keep.
    public let shared: UInt64
    /// Bytes local snapshots hold until they're gone.
    public let snapshots: UInt64
    public let files: UInt64
    /// Folders inside it the scanner couldn't read.
    public let unreadable: UInt64
    public init(bytes: UInt64, shared: UInt64, snapshots: UInt64, files: UInt64, unreadable: UInt64) {
        self.bytes = bytes; self.shared = shared; self.snapshots = snapshots; self.files = files; self.unreadable = unreadable
    }

    /// One line of the scanner's `frees` output: the measurement, or the failure it reported.
    public static func decode(_ line: Data) throws -> DiskFrees {
        struct Tag: Decodable { let type: String; let reason: String? }
        let tag = try JSONDecoder().decode(Tag.self, from: line)
        switch tag.type {
        case "frees": return try JSONDecoder().decode(DiskFrees.self, from: line)
        case "fatal": throw DiskFailure(tag.reason ?? "The scanner couldn’t measure what deleting it frees.", isComplete: tag.reason != nil)
        default: throw DiskFailure("Unexpected scanner event: \(tag.type)")
        }
    }
}

/// What moving an item to the Trash will do, checked before Pith asks.
public struct TrashPlan: Sendable, Equatable {
    public enum Consequence: Sendable, Equatable {
        /// The item syncs with iCloud Drive, so the Trash takes it off the user's other devices too.
        case iCloud
        /// The item syncs with a cloud storage provider, such as Dropbox or Google Drive.
        case cloudStorage(provider: String)
        /// A Photos library: its photos and edits go with it.
        case photosLibrary
    }

    public let target: URL
    public let name: String
    public let size: UInt64
    public let files: UInt64
    public let isFolder: Bool
    public let consequences: [Consequence]
}

public enum TrashPolicy {
    /// Folders in the home folder that never go to the Trash whole (`VITAL_HOME_FOLDERS` in scanner/src/trash.rs).
    public static let vitalHomeFolders = [
        ".Trash", "Applications", "Desktop", "Documents", "Downloads", "Library", "Library/Application Support", "Library/CloudStorage",
        "Library/Containers", "Library/Group Containers", "Library/Mobile Documents", "Library/Mobile Documents/com~apple~CloudDocs",
        "Movies", "Music", "Pictures", "Public",
    ]
    /// Volume roots whose top-level folders hold the system: the startup disk as shown, and its data volume.
    public static let systemRoots = ["/", "/System/Volumes/Data"]

    public static func plan(_ input: String, result: DiskResult, home: URL) throws -> TrashPlan {
        guard input.hasPrefix("/"), !input.utf8.contains(0) else { throw DiskFailure("Select an absolute path from the current scan.") }
        guard let node = result.item(at: input), !input.split(separator: "/").contains("__other__") else {
            throw DiskFailure("This item isn’t a real entry in the current scan. Scan again before moving it to the Trash.")
        }
        let normalized = URL(fileURLWithPath: input).standardizedFileURL
        let target = normalized.deletingLastPathComponent().resolvingSymlinksInPath().appendingPathComponent(normalized.lastPathComponent)
        let root = URL(fileURLWithPath: result.root.path).resolvingSymlinksInPath().standardizedFileURL
        func inside(_ child: URL, _ parent: URL) -> Bool {
            child.path != parent.path && child.pathComponents.starts(with: parent.pathComponents)
        }
        guard inside(target, root) else { throw DiskFailure("This item is outside the scanned folder.") }
        guard let identity = identity(of: target.path, following: false) else {
            throw DiskFailure("The item no longer exists or can’t be read. Scan again and try again.")
        }
        // Paths can't decide this: the startup disk shows each firmlinked folder at two paths.
        if protectedIdentities(home: home).contains(identity) {
            throw DiskFailure("macOS or your account needs \(target.lastPathComponent), so Pith won’t move it to the Trash. You can still move items inside it.")
        }
        if node.kind == .dir, let parent = Self.identity(of: target.deletingLastPathComponent().path, following: true), parent.device != identity.device {
            throw DiskFailure("\(target.lastPathComponent) is a volume. Eject it in Finder instead.")
        }
        return TrashPlan(target: target, name: target.lastPathComponent, size: node.size, files: node.fileCount, isFolder: node.kind == .dir,
                         consequences: consequences(of: target, home: home.resolvingSymlinksInPath()))
    }

    /// Device and inode, which a folder keeps at every path that reaches it.
    public struct Identity: Hashable, Sendable {
        public let device: UInt64
        public let inode: UInt64
    }

    public static func identity(of path: String, following: Bool) -> Identity? {
        var info = stat()
        guard (following ? stat(path, &info) : lstat(path, &info)) == 0 else { return nil }
        return Identity(device: UInt64(bitPattern: Int64(info.st_dev)), inode: info.st_ino)
    }

    public static func protectedIdentities(home: URL) -> Set<Identity> {
        var protected = Set<Identity>()
        func add(_ path: String) { if let identity = identity(of: path, following: true) { protected.insert(identity) } }
        for root in systemRoots {
            add(root)
            for name in (try? FileManager.default.contentsOfDirectory(atPath: root)) ?? [] { add((root as NSString).appendingPathComponent(name)) }
        }
        var folder = home.standardizedFileURL
        while true {
            add(folder.path)
            if folder.path == "/" { break }
            folder.deleteLastPathComponent()
        }
        for vital in vitalHomeFolders { add(home.appendingPathComponent(vital).path) }
        return protected
    }

    static func consequences(of target: URL, home: URL) -> [TrashPlan.Consequence] {
        var found: [TrashPlan.Consequence] = []
        let components = target.pathComponents
        let library = home.appendingPathComponent("Library").pathComponents
        if components.starts(with: library + ["Mobile Documents"]) || (try? target.resourceValues(forKeys: [.isUbiquitousItemKey]).isUbiquitousItem) == true {
            found.append(.iCloud)
        } else if components.starts(with: library + ["CloudStorage"]), components.count > library.count + 1 {
            let folder = home.appendingPathComponent("Library/CloudStorage").appendingPathComponent(components[library.count + 1])
            found.append(.cloudStorage(provider: FileManager.default.displayName(atPath: folder.path)))
        }
        if components.contains(where: { $0.hasSuffix(".photoslibrary") }) { found.append(.photosLibrary) }
        return found
    }
}

public enum BridgePolicy {
    public static func allows(url: URL?, mainFrame: Bool) -> Bool {
        guard mainFrame, let url else { return false }
        return url.scheme == "pith" && url.host == "app" && url.path == "/index.html"
            && url.user == nil && url.password == nil && url.port == nil && url.query == nil
    }
}

/// Which of macOS's icons the disk map's page may load from Pith's own scheme, at
/// `pith://app/icon/<generation>/<appearance>/<points>@<scale>x/<key>.png`. The route shares the page's scheme and host,
/// so its images are the page's own and a canvas that draws them can read their pixels back.
public struct IconPolicy: Sendable {
    /// The start of every icon's URL, up to its size: `pith://app/icon/<generation>/<appearance>/`. WebKit keeps an
    /// image from Pith's scheme for as long as its URL stays the same, so a new generation loads every icon again.
    public static func base(generation: Int, appearance: IconAppearance) -> String {
        "pith://app/icon/\(generation)/\(appearance.rawValue)/"
    }

    private let map: DiskNode?
    private let places: KnownPlaces
    private let asking: Bool
    private let volumes: Set<String>
    private let apps: Set<String>

    /// - Parameters:
    ///   - map: the tree of the map the page shows.
    ///   - places: the known places, whose ids the page may ask for and which Pith's icon rule needs.
    ///   - asking: whether macOS may be holding some of the map's folders, as `KnownPlaces.iconKey(for:asking:)` takes it.
    ///   - volumes: the roots of the disks the disk menu lists.
    ///   - apps: the bundles of the apps the page names from Activity's history, under Wrote the most since.
    public init(map: DiskNode?, places: KnownPlaces, asking: Bool, volumes: Set<String>, apps: Set<String>) {
        self.map = map; self.places = places; self.asking = asking; self.volumes = volumes; self.apps = apps
    }

    /// The icon `url` asks for, or nil when Pith refuses it, as it does anything that isn't an icon's URL in its one
    /// spelling at a size the store draws. The key is read from the URL's path as it arrives, still escaped: decoding
    /// it first would turn an item path's escaped slashes into the URL's own.
    public func request(for url: URL) -> IconRequest? {
        guard url.scheme == "pith", url.host == "app", url.user == nil, url.password == nil, url.port == nil, url.query == nil, url.fragment == nil,
              let path = URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedPath,
              path.hasPrefix("/icon/"), path.hasSuffix(".png") else { return nil }
        let parts = path.dropFirst("/icon/".count).dropLast(".png".count).split(separator: "/", maxSplits: 3, omittingEmptySubsequences: false)
        guard parts.count == 4, Self.number(parts[0]) != nil, let appearance = IconAppearance(rawValue: String(parts[1])),
              let size = Self.size(parts[2]), let key = IconKey(string: String(parts[3])), allows(key) else { return nil }
        return IconRequest(key, size: size, appearance: appearance)
    }

    /// Whether the page may have `key`'s icon. A file type, the plain folder, the group and a known place need no path,
    /// so any of them may load. An item's own icon is looked up by its path, so it loads only for a folder, package, app
    /// or volume the map shows with that very key by Pith's icon rule, a disk the disk menu lists, or an app on the
    /// page. A folder the map couldn't read, one macOS may be holding, a known place or a path the map doesn't show
    /// never gets looked up by its path this way.
    private func allows(_ key: IconKey) -> Bool {
        switch key {
        case .type, .folder, .group: return true
        case .place(let id): return places.place(id: id) != nil
        case .item(let path):
            if volumes.contains(path) || apps.contains(path) { return true }
            return item(at: path).map { places.iconKey(for: $0, asking: asking) == key } ?? false
        }
    }

    /// The map's folder or volume at `path`, found by following the path down from the map's root.
    private func item(at path: String) -> DiskNode? {
        guard let map else { return nil }
        if let folder = map.folder(at: path) { return folder }
        // A volume mounted inside the map is a block of its own in the folder it's mounted in.
        return map.folder(at: (path as NSString).deletingLastPathComponent)?.children?.first { $0.kind == .volume && $0.path == path }
    }

    /// A size as `<points>@<scale>x`, such as `16@2x`, when the store draws it as it is.
    private static func size(_ text: Substring) -> IconSize? {
        guard text.hasSuffix("x") else { return nil }
        let parts = text.dropLast().split(separator: "@", omittingEmptySubsequences: false)
        guard parts.count == 2, let points = number(parts[0]), let scale = number(parts[1]) else { return nil }
        let (pixels, overflow) = points.multipliedReportingOverflow(by: scale)
        let size = IconSize(pixels: pixels, scale: scale)
        return !overflow && size.pixels == pixels && size.scale == scale ? size : nil
    }

    /// A whole number written as `String(_:)` writes it, so each has one spelling: no sign, leading zero or fraction.
    private static func number(_ text: Substring) -> Int? {
        Int(text).flatMap { $0 >= 0 && String($0) == text ? $0 : nil }
    }
}
