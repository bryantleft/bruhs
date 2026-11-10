import Foundation

/// The selected items moved to the Trash as one action (`DiskSelection`): each planned by `TrashPolicy`, the whole move
/// refused when any can't go, one question for every item's consequences, and one Undo for every item that moved.
public struct TrashBatch: Sendable, Equatable {
    /// Each item's plan, in the order they were picked, none inside another.
    public let plans: [TrashPlan]

    /// Whether Pith asks before the move: an item's plan has consequences, as a synced item's or a Photos library's has.
    public var asks: Bool { plans.contains { !$0.consequences.isEmpty } }

    /// What the items take up on the map.
    public var size: UInt64 { plans.reduce(0) { $0 + $1.size } }

    /// The move of `paths` to the Trash, or why it can't go: an item alone says what it always said, and for several,
    /// one sentence names each that can't go, with why, and how to move the rest. `kept` holds what the map last showed of
    /// items it folds into their folders' smaller items since, as the selection keeps them (`DiskSelection.shown`).
    public static func plan(_ paths: [String], result: DiskResult, home: URL, kept: [String: DiskNode] = [:]) -> Result<TrashBatch, DiskFailure> {
        let paths = DiskSelection.normalized(paths)
        guard !paths.isEmpty else { return .failure(DiskFailure("Select an item to move to the Trash.")) }
        let protected = TrashPolicy.protectedIdentities(home: home)
        var plans: [TrashPlan] = [], refused: [(name: String, refusal: TrashRefusal)] = []
        for path in paths {
            switch TrashPolicy.check(path, result: result, home: home, protected: protected, kept: kept) {
            case .success(let plan): plans.append(plan)
            case .failure(let refusal): refused.append(((result.item(at: path) ?? kept[path])?.name ?? URL(fileURLWithPath: path).lastPathComponent, refusal))
            }
        }
        if paths.count == 1, let only = refused.first { return .failure(DiskFailure(only.refusal.message)) }
        guard refused.isEmpty else { return .failure(DiskFailure(refusal(refused, others: !plans.isEmpty))) }
        return .success(TrashBatch(plans: plans))
    }

    /// The sentence refusing the move: the items that can't go, those refused alike named together, each group with why,
    /// and, when `others` could go, how to move those. It names no gesture, since a click, a key and VoiceOver all take an
    /// item out of the selection.
    private static func refusal(_ refused: [(name: String, refusal: TrashRefusal)], others: Bool) -> String {
        var groups: [(refusal: TrashRefusal, names: [String])] = []
        for item in refused {
            let alike = { (group: (refusal: TrashRefusal, names: [String])) in group.refusal.reason(several: false) == item.refusal.reason(several: false) }
            if let index = groups.firstIndex(where: alike) { groups[index].names.append(item.name) } else { groups.append((item.refusal, [item.name])) }
        }
        let clauses = groups.enumerated().map { index, group in
            let because = "because \(group.refusal.reason(several: group.names.count > 1))"
            return index == 0 ? "\(names(group.names)) can’t go to the Trash \(because)" : "\(names(group.names)) \(because)"
        }
        let reasons = clauses.joined(separator: ", and ")
        guard others else { return reasons + "." }
        return reasons + ", so take \(refused.count == 1 ? "it" : "them") out of the selection and move the rest."
    }

    /// Items' names as a sentence lists them: "a", "a and b", "a, b, and c", or the first three and how many more.
    static func names(_ names: [String]) -> String {
        switch names.count {
        case 0: ""
        case 1: names[0]
        case 2: "\(names[0]) and \(names[1])"
        case 3: "\(names[0]), \(names[1]), and \(names[2])"
        default: "\(names[0]), \(names[1]), \(names[2]), and \((names.count - 3).formatted()) more"
        }
    }

    /// What Pith asks before a move that `asks`.
    public var question: String {
        plans.count == 1 ? "Move “\(plans[0].name)” to the Trash?" : "Move \(plans.count.formatted()) items to the Trash?"
    }

    /// What the move does to the items with consequences, each by name among several, and that they can come back.
    public var confirmation: String {
        let alone = plans.count == 1
        let effects = plans.flatMap { plan in plan.consequences.map { Self.effect($0, on: alone ? nil : plan.name) } }
        return (effects + ["You can put \(alone ? "it" : "them") back from the Trash until you empty it."]).joined(separator: " ")
    }

    /// What the Trash does to the item `name`, or to the item asked about alone.
    private static func effect(_ consequence: TrashPlan.Consequence, on name: String?) -> String {
        switch consequence {
        case .iCloud: "\(name ?? "It") syncs with iCloud Drive, so the Trash removes it from your other devices too."
        case .cloudStorage(let provider): "\(name ?? "It") syncs with \(provider), so the Trash removes it there and from your other devices too."
        case .photosLibrary: "\(name.map { "\($0) is" } ?? "It’s") a Photos library: its photos and edits go to the Trash with it."
        }
    }

    /// Moves each item in turn with `move`, which says where it went, and stops at the first it can't move: what moved
    /// stays moved, for one Undo to put back, and the rest stay where they are.
    public func move(with move: (URL) throws -> URL?) -> TrashOutcome {
        var moved: [TrashMove] = []
        for (index, plan) in plans.enumerated() {
            do {
                moved.append(TrashMove(plan: plan, trashed: try move(plan.target)))
            } catch {
                return TrashOutcome(moved: moved, failure: TrashOutcome.Failure(plan: plan, reason: Self.sentence(error)), untried: Array(plans[(index + 1)...]))
            }
        }
        return TrashOutcome(moved: moved, failure: nil, untried: [])
    }

    /// An error as a sentence that ends with a full stop.
    private static func sentence(_ error: Error) -> String {
        let text = (error as NSError).localizedDescription
        return text.hasSuffix(".") ? text : text + "."
    }
}

/// Why an item can't go to the Trash (`TrashPolicy.check`).
public enum TrashRefusal: Error, Equatable, Sendable {
    /// Not an absolute path.
    case notAPath
    /// Not a real file or folder of the map, such as its smaller items.
    case notInMap
    case outsideMap
    /// It isn't on the disk any more, or can't be looked at.
    case gone
    /// A folder macOS or the person's account needs, by its name: a top-level folder of the system, the home folder,
    /// a folder above it or one of its vital folders.
    case needed(String)
    /// A volume mounted here, by its name, which ejecting removes instead.
    case volume(String)

    /// What Pith says when the item is the only one to go.
    public var message: String {
        switch self {
        case .notAPath: "Select an absolute path from the current scan."
        case .notInMap: "This item isn’t a real entry in the current scan. Scan again before moving it to the Trash."
        case .outsideMap: "This item is outside the scanned folder."
        case .gone: "The item no longer exists or can’t be read. Scan again and try again."
        case .needed(let name): "macOS or your account needs \(name), so Pith won’t move it to the Trash. You can still move items inside it."
        case .volume(let name): "\(name) is a volume. Eject it in Finder instead."
        }
    }

    /// Why it can't go, said after "because" in a sentence that names the item, or several refused alike.
    public func reason(several: Bool) -> String {
        switch self {
        case .notAPath: several ? "they aren’t paths from the current scan" : "it isn’t a path from the current scan"
        case .notInMap: several ? "they aren’t real entries in the current scan" : "it isn’t a real entry in the current scan"
        case .outsideMap: several ? "they’re outside the scanned folder" : "it’s outside the scanned folder"
        case .gone: several ? "they no longer exist or can’t be read" : "it no longer exists or can’t be read"
        case .needed: several ? "macOS or your account needs them" : "macOS or your account needs it"
        case .volume: several ? "they’re volumes" : "it’s a volume"
        }
    }
}

/// An item moved to the Trash: its plan, which says where it was, and where it went, which Undo moves it back from. Nil
/// when the Trash didn't say, and then Undo can't.
public struct TrashMove: Sendable, Equatable {
    public let plan: TrashPlan
    public let trashed: URL?
}

/// What one move to the Trash did.
public struct TrashOutcome: Sendable, Equatable {
    /// The item Pith couldn't move, and why, as a sentence.
    public struct Failure: Sendable, Equatable {
        public let plan: TrashPlan
        public let reason: String
    }

    /// The items that moved, in order.
    public let moved: [TrashMove]
    /// The item the move stopped at, or nil when every item moved.
    public let failure: Failure?
    /// The items after it, which weren't tried, so they stayed where they were.
    public let untried: [TrashPlan]

    /// What the notice of the move says beside its Undo: which items moved, and what they take up, which comes back once
    /// the Trash is emptied. Nil when nothing moved.
    public var note: String? {
        guard !moved.isEmpty else { return nil }
        let size = formatBytes(moved.reduce(0) { $0 + $1.plan.size })
        return "Moved \(TrashBatch.names(moved.map(\.plan.name))) to the Trash. \(moved.count == 1 ? "Its" : "Their") \(size) comes back when you empty the Trash."
    }

    /// What went wrong when the move stopped at an item: which, what stayed where it was with it, and why, each item named
    /// once.
    public var problem: String? {
        guard let failure else { return nil }
        let name = failure.plan.name
        guard !untried.isEmpty else { return "Pith couldn’t move \(name) to the Trash. \(failure.reason)" }
        return "Pith couldn’t move \(name) to the Trash, so \(TrashBatch.names(["it"] + untried.map(\.name))) stayed where they were. \(failure.reason)"
    }
}

/// Undo of a move to the Trash: every item that moved goes back where it was.
public enum TrashUndo {
    /// Moves each of `moves` back with `move`, from where it went to where it was, the last moved first: which came back,
    /// and which are still in the Trash, each in that order.
    public static func putBack(_ moves: [TrashMove], with move: (_ from: URL, _ to: URL) throws -> Void) -> (restored: [TrashMove], stuck: [TrashMove]) {
        var restored: [TrashMove] = [], stuck: [TrashMove] = []
        for item in moves.reversed() {
            if let trashed = item.trashed, (try? move(trashed, item.plan.target)) != nil { restored.append(item) } else { stuck.append(item) }
        }
        return (restored, stuck)
    }

    /// What Pith says of the items Undo couldn't put back, or nil when it put back every one.
    public static func problem(stuck: [TrashMove]) -> String? {
        guard !stuck.isEmpty else { return nil }
        return "Pith couldn’t put \(TrashBatch.names(stuck.map(\.plan.name))) back. Open the Trash in Finder and drag \(stuck.count == 1 ? "it" : "them") out instead."
    }
}
