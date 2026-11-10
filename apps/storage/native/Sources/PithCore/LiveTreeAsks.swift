import Foundation

/// Which of the live map's trees answer the person's own action. The page shows a map that does at once, though the
/// pointer or a click would hold a newer map still (`DiskModel.mapAnswersPerson`), and the live map's own refreshes
/// wait. The map after the person's Check Again has landed answers them. So does the scan a failed tree falls back on,
/// but only when that tree was asked for by their own action: opening a folder, or Check Again. A refresh that fails
/// falls back on a scan that waits too.
///
/// The live map keeps only its latest tree, so a tree it asks for after the person's takes the place of theirs, and
/// answers them in its stead: the person's ask holds until a tree comes or fails. A tree asked for before theirs, which
/// came and was still being measured when they asked, goes out after it and says nothing of it: each tree is known by the
/// request that asked for it.
public struct LiveTreeAsks: Sendable, Equatable {
    /// Why a tree was asked for.
    public enum Ask: Sendable, Equatable {
        /// The live map's own refresh as it follows the disk, or as Disk comes on screen.
        case refresh
        /// A folder the person opened, or chose to show.
        case opening
        /// The person's Check Again, once the scanner has listed the folder again, everything in it.
        case checkAgain
    }

    /// The first tree asked for by the person's own action, and the first asked for by their Check Again, while neither
    /// has been answered. A tree asked for after either answers it too, as the live map keeps only its latest tree; one
    /// asked for before, still on its way when they asked, says nothing of it.
    private var persons: Int?
    private var atOnce: Int?

    public init() {}

    /// The tree asked for by `request`, numbered in order, is for `ask`.
    public mutating func asked(_ ask: Ask, request: Int) {
        switch ask {
        case .refresh: break
        case .opening: persons = persons ?? request
        case .checkAgain: persons = persons ?? request; atOnce = atOnce ?? request
        }
    }

    /// The tree asked for by `request` came, and its map goes out: whether it shows at once.
    public mutating func arrived(request: Int) -> Bool {
        let shows = answers(atOnce, request)
        if shows { atOnce = nil }
        if answers(persons, request) { persons = nil }
        return shows
    }

    /// The tree asked for by `request` couldn't be made: whether the scan it falls back on answers the person's own
    /// action.
    public mutating func failed(request: Int) -> Bool {
        let theirs = answers(persons, request)
        if theirs { persons = nil }
        if answers(atOnce, request) { atOnce = nil }
        return theirs
    }

    /// Whether the tree asked for by `request` answers the ask its first tree was asked for by, `first`.
    private func answers(_ first: Int?, _ request: Int) -> Bool { first.map { request >= $0 } ?? false }
}
