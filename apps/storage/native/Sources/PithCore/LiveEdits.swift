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

    /// The longest a change is held: the live map shows a change 4.5 to 5.7 s after it's made, FSEvents' second of latency
    /// and the scanner's three of settling (`SETTLE` in scanner/src/serve.rs) included (native/VERIFICATION.md,
    /// "Following the disk"), so a minute is about ten times the slowest. A change the index never lists, as a hard-linked
    /// file put back whose bytes it counts at another link, is dropped then.
    public static let longestHold: TimeInterval = 60

    /// Each change, with when the person made it.
    private var held: [(edit: Edit, made: Date)] = []

    public init() {}

    public static func == (lhs: LiveEdits, rhs: LiveEdits) -> Bool {
        lhs.held.map(\.edit) == rhs.held.map(\.edit) && lhs.held.map(\.made) == rhs.held.map(\.made)
    }

    /// The person's changes held, oldest first.
    public var edits: [Edit] { held.map(\.edit) }

    public var isEmpty: Bool { held.isEmpty }

    /// The items moved to the Trash, and those put back, to ask the scanner about with each map.
    public var gone: [String] { edits.compactMap { if case .gone(let node) = $0 { node.path } else { nil } } }
    public var back: [String] { edits.compactMap { if case .back(let restored) = $0 { restored.node.path } else { nil } } }

    /// Move to Trash took `items` off the map at `time`. Each replaces any change to the same item before it.
    public mutating func trashed(_ items: [DiskNode], at time: Date = Date()) { replace(items.map(Edit.gone), at: time) }

    /// Undo put `items` back at `time`.
    public mutating func putBack(_ items: [Restored], at time: Date = Date()) { replace(items.map(Edit.back), at: time) }

    private mutating func replace(_ new: [Edit], at time: Date) {
        let paths = Set(new.map(\.path))
        held.removeAll { paths.contains($0.edit.path) }
        held += new.map { ($0, time) }
    }

    /// Drops each change held longer than `longestHold` at `now`, and says which, in the order they were made.
    public mutating func expire(at now: Date) -> [Edit] {
        let expired = { (change: (edit: Edit, made: Date)) in now.timeIntervalSince(change.made) > Self.longestHold }
        let dropped = held.filter(expired).map(\.edit)
        held.removeAll(where: expired)
        return dropped
    }

    /// Drops each change the disk contradicts, of those whose paths were looked at (`checked`): an item moved to the
    /// Trash that's there again, as after Finder's Put Back, or one put back that's gone again. The index could take
    /// either for a change it hasn't listed yet. `onDisk` holds those of `checked` that are there.
    public mutating func keep(onDisk: Set<String>, of checked: Set<String>) {
        held.removeAll { change in
            let edit = change.edit
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
        held.removeAll { answer.asked.contains($0.edit.path) && !answer.unlisted.contains($0.edit.path) }
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
