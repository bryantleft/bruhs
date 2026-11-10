import Foundation

/// The disk map's click hints the person has learned: the hover card says how to select and open an item until they've
/// done each once on the map. Pith keeps them in its settings, through `read` and `write`, so they stay learned when
/// the window closes and when Pith opens again. The page gets them once it's ready, and says when it learns one.
public struct MapHints {
    /// The hints the map learns, by the names the page gives them (`HintStep` in src/lib/map-hints.ts), in order.
    public static let all = ["opened", "selected"]

    private let read: () -> Any?
    private let write: ([String]) -> Void

    /// Hints kept where `read` finds them and `write` puts them: Pith's settings, or a test's.
    public init(read: @escaping () -> Any?, write: @escaping ([String]) -> Void) {
        self.read = read
        self.write = write
    }

    /// The hints learned so far, each once, in order. A kept value of another type, or a name the map doesn't learn,
    /// counts as none.
    public var learned: [String] {
        let kept = read() as? [String] ?? []
        return Self.all.filter(kept.contains)
    }

    /// Keeps `hint` learned. A name the map doesn't learn, or a hint learned already, writes nothing.
    public func learn(_ hint: String) {
        let learned = learned
        guard Self.all.contains(hint), !learned.contains(hint) else { return }
        write(Self.all.filter { learned.contains($0) || $0 == hint })
    }
}
