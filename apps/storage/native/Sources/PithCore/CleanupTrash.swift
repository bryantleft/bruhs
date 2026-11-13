import Darwin
import Foundation

/// A checked snapshot of only the items Pith moved. This never enumerates or empties the rest of the person's Trash.
/// Capture it just after moving, off the main thread; retain it until the person explicitly confirms deletion.
public struct CleanupTrashSelection: Sendable {
    private struct Entry: Sendable {
        let move: TrashMove
        let root: String
        let rootIdentity: TrashPolicy.Identity
        let components: [String]
        let tree: CleanupTrashTree
    }

    private let entries: [Entry]
    public let accountedBytes: Int
    public var moves: [TrashMove] { entries.map(\.move) }
    public var paths: [String] { moves.compactMap { $0.trashed?.path } }

    /// `trashRoot` is injectable for disposable tests. The app uses the system's Trash for the moved item's volume.
    public static func capture(moves: [TrashMove], budget: Int = TrashUndoStack.defaultBudget,
                               trashRoot: (TrashMove) throws -> URL = systemTrashRoot) throws -> Self {
        guard !moves.isEmpty else { throw DiskFailure("There are no moved items to finish cleaning up.") }
        var entries: [Entry] = [], seen = Set<String>()
        var remaining = CleanupCaptureBudget(bytes: budget)
        for move in moves {
            try Task.checkCancellation()
            guard let trashed = move.trashed, let expected = move.identity else {
                throw DiskFailure("Pith can’t verify where \(move.plan.name) went. Review it in Finder’s Trash instead.")
            }
            let proposed = try trashRoot(move)
            var rootInfo = stat()
            guard lstat(proposed.path, &rootInfo) == 0, rootInfo.st_mode & S_IFMT == S_IFDIR,
                  rootInfo.st_uid == getuid() else {
                throw DiskFailure("Pith can’t verify this volume’s Trash folder. Review the moved items in Finder instead.")
            }
            let root = try canonical(proposed.path)
            let parent = try canonical(trashed.deletingLastPathComponent().path)
            let target = (parent as NSString).appendingPathComponent(trashed.lastPathComponent)
            guard target != root, DiskChanges.isInside(target, root) else {
                throw DiskFailure("\(move.plan.name) is no longer inside its Trash folder. Nothing was permanently deleted.")
            }
            let components = Array(target.dropFirst(root.count + 1).split(separator: "/").map(String.init))
            guard !components.isEmpty, !components.contains(where: { $0 == "." || $0 == ".." }) else {
                throw DiskFailure("Pith won’t permanently delete a Trash folder itself.")
            }
            let descriptor = try openRoot(root)
            defer { close(descriptor) }
            let parentFD = try openParent(components, at: descriptor)
            defer { close(parentFD) }
            let tree = try CleanupTrashTree.read(components.last ?? "", at: parentFD, device: expected.device, budget: &remaining)
            guard tree.stamp.identity == expected else {
                throw DiskFailure("\(move.plan.name) changed after Pith moved it. Review it in Finder’s Trash instead.")
            }
            guard seen.insert(target).inserted else {
                throw DiskFailure("The cleanup selection contains the same item more than once. Review the moved items again.")
            }
            entries.append(Entry(move: move, root: root, rootIdentity: CleanupTrashStamp(rootInfo).identity, components: components, tree: tree))
        }
        return Self(entries: entries, accountedBytes: budget - remaining.bytes)
    }

    public static func systemTrashRoot(_ move: TrashMove) throws -> URL {
        try FileManager.default.url(for: .trashDirectory, in: .userDomainMask, appropriateFor: move.plan.target.deletingLastPathComponent(), create: false)
    }

    /// Revalidates all items before changing any. The descriptor-based traversal never follows links or crosses disks.
    /// If a filesystem error stops deletion partway, `attempted` identifies every move whose Undo must be discarded.
    public func remove() throws -> CleanupTrashOutcome {
        for entry in entries {
            try inspect(entry) { parent, name in
                try entry.tree.validate(name, at: parent)
            }
        }
        var removed: [TrashMove] = [], attempted: [TrashMove] = []
        for (index, entry) in entries.enumerated() {
            do {
                try Task.checkCancellation()
                attempted.append(entry.move)
                try inspect(entry) { parent, name in
                    try entry.tree.remove(name, at: parent) {}
                }
                removed.append(entry.move)
            } catch {
                let reason = error is CancellationError ? "Cleanup was cancelled." : error.localizedDescription
                return CleanupTrashOutcome(removed: removed, attempted: attempted,
                                           unfinished: entries[index...].map(\.move),
                                           problem: "Pith couldn’t finish deleting \(entry.move.plan.name). \(reason) Review the remaining items in Finder’s Trash.")
            }
        }
        return CleanupTrashOutcome(removed: removed, attempted: attempted, unfinished: [], problem: nil)
    }

    private func inspect(_ entry: Entry, work: (Int32, String) throws -> Void) throws {
        let root = try Self.openRoot(entry.root)
        defer { close(root) }
        var metadata = stat()
        guard fstat(root, &metadata) == 0, CleanupTrashStamp(metadata).identity == entry.rootIdentity else {
            throw DiskFailure("The Trash folder changed. Review the moved items again before finishing cleanup.")
        }
        let parent = try Self.openParent(entry.components, at: root)
        defer { close(parent) }
        try work(parent, entry.components.last ?? "")
    }

    private static func canonical(_ path: String) throws -> String {
        guard let resolved = realpath(path, nil) else { throw CleanupTrashTree.failure("inspect", path) }
        defer { free(resolved) }
        return String(cString: resolved)
    }

    private static func openRoot(_ path: String) throws -> Int32 {
        let descriptor = open(path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW_ANY | O_CLOEXEC)
        guard descriptor >= 0 else { throw CleanupTrashTree.failure("open the Trash folder", path) }
        return descriptor
    }

    private static func openParent(_ components: [String], at root: Int32) throws -> Int32 {
        var parent = fcntl(root, F_DUPFD_CLOEXEC, 0)
        guard parent >= 0 else { throw CleanupTrashTree.failure("inspect the Trash folder", "") }
        do {
            for name in components.dropLast() {
                let next = openat(parent, name, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
                guard next >= 0 else { throw CleanupTrashTree.failure("inspect", name) }
                close(parent)
                parent = next
            }
            return parent
        } catch { close(parent); throw error }
    }
}

public struct CleanupTrashOutcome: Sendable {
    public let removed: [TrashMove]
    /// Invalidate Undo for these moves even if one folder was only partly removed.
    public let attempted: [TrashMove]
    public let unfinished: [TrashMove]
    public let problem: String?
}

private struct CleanupTrashStamp: Equatable, Sendable {
    let identity: TrashPolicy.Identity
    let mode: mode_t
    let size: Int64
    let modifiedSeconds: Int
    let modifiedNanoseconds: Int
    let bornSeconds: Int
    let bornNanoseconds: Int
    let changedSeconds: Int
    let changedNanoseconds: Int
    let flags: UInt32
    let owner: uid_t
    let group: gid_t

    init(_ info: stat) {
        identity = TrashPolicy.Identity(device: UInt64(bitPattern: Int64(info.st_dev)), inode: info.st_ino)
        mode = info.st_mode
        size = info.st_size
        modifiedSeconds = info.st_mtimespec.tv_sec; modifiedNanoseconds = info.st_mtimespec.tv_nsec
        bornSeconds = info.st_birthtimespec.tv_sec; bornNanoseconds = info.st_birthtimespec.tv_nsec
        changedSeconds = info.st_ctimespec.tv_sec; changedNanoseconds = info.st_ctimespec.tv_nsec
        flags = info.st_flags
        owner = info.st_uid; group = info.st_gid
    }

    var isDirectory: Bool { mode & S_IFMT == S_IFDIR }

    /// Unlinking another selected hard link changes this inode's ctime too. Preflight compares that timestamp; once
    /// deletion begins, check content metadata and identity while allowing the ctime changes our own unlinks cause.
    func matchesForRemoval(_ other: Self) -> Bool {
        identity == other.identity && mode == other.mode && size == other.size
            && modifiedSeconds == other.modifiedSeconds && modifiedNanoseconds == other.modifiedNanoseconds
            && bornSeconds == other.bornSeconds && bornNanoseconds == other.bornNanoseconds
            && flags == other.flags && owner == other.owner && group == other.group
    }
}

private struct CleanupTrashTree: Equatable, Sendable {
    let stamp: CleanupTrashStamp
    let children: [String: CleanupTrashTree]

    static func read(_ name: String, at parent: Int32, device: UInt64, budget: inout CleanupCaptureBudget, depth: Int = 0) throws -> Self {
        try Task.checkCancellation()
        try budget.take(name)
        // A legal PATH_MAX-sized path contains at most PATH_MAX / 2 nonempty components. Use that platform bound for
        // review too, declining deeper descriptor-only trees before exhausting the traversal stack.
        guard depth <= Int(PATH_MAX) / 2 else {
            throw DiskFailure("This folder’s hierarchy is too deep to review for permanent deletion. Use Finder’s Trash instead; Undo still works.")
        }
        let stamp = try metadata(name, at: parent)
        guard stamp.identity.device == device else {
            throw DiskFailure("\(name) contains another mounted volume. Eject it in Finder before finishing cleanup.")
        }
        guard stamp.isDirectory else { return Self(stamp: stamp, children: [:]) }
        let directory = try openDirectory(name, at: parent, expected: stamp.identity)
        defer { close(directory) }
        var children: [String: Self] = [:]
        try eachName(at: directory) { child in children[child] = try read(child, at: directory, device: device, budget: &budget, depth: depth + 1) }
        guard try metadata(name, at: parent) == stamp else { throw changed(name) }
        return Self(stamp: stamp, children: children)
    }

    func validate(_ name: String, at parent: Int32) throws {
        try Task.checkCancellation()
        guard try Self.metadata(name, at: parent) == stamp else { throw Self.changed(name) }
        guard stamp.isDirectory else { return }
        let directory = try Self.openDirectory(name, at: parent, expected: stamp.identity)
        defer { close(directory) }
        var count = 0
        try Self.eachName(at: directory) { child in
            guard let expected = children[child] else { throw Self.changed(name) }
            try expected.validate(child, at: directory)
            count += 1
        }
        guard count == children.count, try Self.metadata(name, at: parent) == stamp else { throw Self.changed(name) }
    }

    func remove(_ name: String, at parent: Int32, ancestorsStillHere: () throws -> Void) throws {
        try Task.checkCancellation()
        try ancestorsStillHere()
        guard stamp.matchesForRemoval(try Self.metadata(name, at: parent)) else { throw Self.changed(name) }
        if stamp.isDirectory {
            let directory = try Self.openDirectory(name, at: parent, expected: stamp.identity)
            defer { close(directory) }
            var count = 0
            try Self.eachName(at: directory) { child in
                guard children[child] != nil else { throw Self.changed(name) }
                count += 1
            }
            guard count == children.count else { throw Self.changed(name) }
            for child in children.keys.sorted() {
                guard let tree = children[child] else { continue }
                try tree.remove(child, at: directory) {
                    try ancestorsStillHere()
                    guard try Self.metadata(name, at: parent).identity == stamp.identity else { throw Self.changed(name) }
                }
            }
        }
        try ancestorsStillHere()
        // Our own child removals changed a directory's mtime, so recheck its identity rather than its old size/time.
        let current = try Self.metadata(name, at: parent)
        guard stamp.isDirectory ? current.identity == stamp.identity : stamp.matchesForRemoval(current) else { throw Self.changed(name) }
        guard unlinkat(parent, name, stamp.isDirectory ? AT_REMOVEDIR : 0) == 0 else { throw Self.failure("delete", name) }
    }

    private static func metadata(_ name: String, at parent: Int32) throws -> CleanupTrashStamp {
        var info = stat()
        guard fstatat(parent, name, &info, AT_SYMLINK_NOFOLLOW) == 0 else { throw failure("inspect", name) }
        return CleanupTrashStamp(info)
    }

    private static func openDirectory(_ name: String, at parent: Int32, expected: TrashPolicy.Identity) throws -> Int32 {
        let descriptor = openat(parent, name, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard descriptor >= 0 else { throw failure("open", name) }
        var info = stat()
        guard fstat(descriptor, &info) == 0, CleanupTrashStamp(info).identity == expected else {
            close(descriptor)
            throw changed(name)
        }
        return descriptor
    }

    private static func eachName(at descriptor: Int32, work: (String) throws -> Void) throws {
        // A fresh open file description starts at the beginning even after an earlier listing of this directory.
        let duplicate = openat(descriptor, ".", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard duplicate >= 0 else { throw failure("list", "the moved folder") }
        guard let directory = fdopendir(duplicate) else { close(duplicate); throw failure("list", "the moved folder") }
        defer { closedir(directory) }
        while true {
            errno = 0
            guard let entry = readdir(directory) else {
                guard errno == 0 else { throw failure("list", "the moved folder") }
                return
            }
            let name = withUnsafePointer(to: entry.pointee.d_name) { pointer in
                pointer.withMemoryRebound(to: CChar.self, capacity: Int(entry.pointee.d_namlen) + 1) { String(validatingCString: $0) }
            }
            guard let name else { throw DiskFailure("A moved item’s name can’t be represented safely. Review it in Finder’s Trash instead.") }
            if name != ".", name != ".." { try work(name) }
        }
    }

    static func failure(_ operation: String, _ name: String) -> DiskFailure {
        let reason = String(cString: strerror(errno))
        return DiskFailure("Pith couldn’t \(operation) \(name): \(reason).")
    }

    private static func changed(_ name: String) -> DiskFailure {
        DiskFailure("\(name) changed or moved after review. Pith left it in place.")
    }
}

private struct CleanupCaptureBudget {
    var bytes: Int

    mutating func take(_ name: String) throws {
        // Four slots per entry cover a Dictionary's bucket slack, its key/tree value and allocator bookkeeping,
        // plus UTF-8 name storage. The shared 16 MiB Undo budget bounds the retained review tree conservatively;
        // validation streams against it rather than building a second copy. An oversized selection stays undoable.
        let cost = 4 * (MemoryLayout<CleanupTrashTree>.stride + MemoryLayout<String>.stride + name.utf8.count + MemoryLayout<UInt>.stride)
        guard bytes >= cost else {
            throw DiskFailure("These items need more cleanup-review memory than Pith keeps. Review and delete them in Finder’s Trash instead; Undo still works.")
        }
        bytes -= cost
    }
}
