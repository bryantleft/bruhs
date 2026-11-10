import Foundation

/// The person's own changes to the live map, Move to Trash and its Undo, held over the maps the live map sends until its
/// index has them. Pith has each folder they changed listed again at once, but a map asked for before that listing
/// lands comes from the index as it was, with an item moved to the Trash still in it or one put back still missing,
/// and so can one whose folder's listing waits on another. The scanner says with each map which of the changes it was
/// asked about its index doesn't show yet (`unlisted` in a tree line, `Index::unlisted` in scanner/src/index.rs): those
/// are made on that map, and each one its index shows is done with.
public struct LiveEdits: Sendable, Equatable {
    public enum Edit: Sendable, Equatable {
        /// An item moved to the Trash, as the map had it.
        case gone(DiskNode)
        /// An item Undo put back, as the map had it before the move, with its largest files and the places it held.
        case back(Restored)

        public var path: String {
            switch self {
            case .gone(let node): node.path
            case .back(let restored): restored.node.path
            }
        }
    }

    /// An item Undo put back: what the map before the move had of it.
    public struct Restored: Sendable, Equatable {
        public let node: DiskNode
        /// The largest files inside it, which go back in Largest files.
        public let topFiles: [DiskFile]
        /// What the live map's index held at the places inside it, which go back in Places.
        public let places: [LivePlace]

        public init(node: DiskNode, topFiles: [DiskFile], places: [LivePlace]) {
            self.node = node; self.topFiles = topFiles; self.places = places
        }
    }

    /// What the scanner said of the changes with a map: which it was asked about, and which of those its index doesn't
    /// show yet.
    public struct Answer: Sendable, Equatable {
        public let asked: Set<String>
        public let unlisted: Set<String>

        public init(asked: Set<String>, unlisted: Set<String>) { self.asked = asked; self.unlisted = unlisted }
    }

    public private(set) var edits: [Edit] = []

    public init() {}

    public var isEmpty: Bool { edits.isEmpty }

    /// The items moved to the Trash, and those put back, to ask the scanner about with each map.
    public var gone: [String] { edits.compactMap { if case .gone(let node) = $0 { node.path } else { nil } } }
    public var back: [String] { edits.compactMap { if case .back(let restored) = $0 { restored.node.path } else { nil } } }

    /// Move to Trash took `items` off the map. Each replaces any change to the same item before it.
    public mutating func trashed(_ items: [DiskNode]) { replace(items.map(Edit.gone)) }

    /// Undo put `items` back.
    public mutating func putBack(_ items: [Restored]) { replace(items.map(Edit.back)) }

    private mutating func replace(_ new: [Edit]) {
        let paths = Set(new.map(\.path))
        edits.removeAll { paths.contains($0.path) }
        edits += new
    }

    /// Drops each change the disk contradicts, of those whose paths were looked at (`checked`): an item moved to the
    /// Trash that's there again, as after Finder's Put Back, or one put back that's gone again. The index could take
    /// either for a change it hasn't listed yet. `onDisk` holds those of `checked` that are there.
    public mutating func keep(onDisk: Set<String>, of checked: Set<String>) {
        edits.removeAll { edit in
            guard checked.contains(edit.path) else { return false }
            switch edit {
            case .gone: return onDisk.contains(edit.path)
            case .back: return !onDisk.contains(edit.path)
            }
        }
    }

    /// `map`, a newer map of the live map, and `places`, what its index holds at the places asked about, as the person's
    /// changes have them, with whether they changed anything. Each change `answer` says the index doesn't show yet is
    /// made on them, and each it says the index shows is done with and dropped. A change the scanner wasn't asked about
    /// with this map stays, and shows only where that can't count anything twice: an item moved to the Trash leaves the
    /// map when the map shows it.
    public mutating func apply(to map: DiskResult, places: [LivePlace], answer: Answer) -> (map: DiskResult, places: [LivePlace], changed: Bool) {
        var map = map, places = places, changed = false
        edits.removeAll { edit in answer.asked.contains(edit.path) && !answer.unlisted.contains(edit.path) }
        for edit in edits {
            let unlisted = answer.unlisted.contains(edit.path)
            switch edit {
            case .gone(let node):
                // An item the map folds into its folder's smaller items takes its size out of them while the index still
                // counts it there.
                if let without = map.removing(node.path, folded: unlisted ? node : nil) { map = without; changed = true }
                let kept = places.filter { !DiskChanges.isInside($0.path, node.path) }
                if kept != places { places = kept; changed = true }
            case .back(let restored) where unlisted:
                if let with = map.restoring(restored.node, topFiles: restored.topFiles) { map = with; changed = true }
                let missing = restored.places.filter { place in !places.contains { $0.path == place.path } }
                if !missing.isEmpty { places += missing; changed = true }
            case .back:
                break
            }
        }
        return (map, places, changed)
    }
}
