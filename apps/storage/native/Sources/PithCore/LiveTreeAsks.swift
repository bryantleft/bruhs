import Foundation

/// Which of the live map's trees answer the person's own action. The page shows a map that does at once, though the
/// pointer or a click would hold a newer map still (`DiskModel.mapAnswersPerson`), and the live map's own refreshes
/// wait. The map after the person's Check Again has landed answers them. So does the scan a failed tree falls back on,
/// but only when that tree was asked for by their own action: opening a folder, or Check Again. A refresh that fails
/// falls back on a scan that waits too.
///
/// The live map keeps only its latest tree, so a tree it asks for after the person's takes the place of theirs, and
/// answers them in its stead: the person's ask holds until a tree comes or fails.
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

    /// A tree on its way answers the person's own action.
    private var persons = false
    /// The map on its way answers the person's Check Again, so it shows at once.
    private var atOnce = false

    public init() {}

    /// A tree was asked for, for `ask`.
    public mutating func asked(_ ask: Ask) {
        switch ask {
        case .refresh: break
        case .opening: persons = true
        case .checkAgain: persons = true; atOnce = true
        }
    }

    /// The tree asked for came, and its map goes out: whether it shows at once.
    public mutating func arrived() -> Bool {
        defer { persons = false; atOnce = false }
        return atOnce
    }

    /// The tree asked for couldn't be made: whether the scan it falls back on answers the person's own action.
    public mutating func failed() -> Bool {
        defer { persons = false; atOnce = false }
        return persons
    }
}
