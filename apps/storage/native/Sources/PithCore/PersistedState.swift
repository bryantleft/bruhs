import Foundation

/// The person's state that a run of Pith could change, as the smoke test reads it before its run and after, changing
/// nothing: Pith's defaults as saved, and when each file and folder Pith keeps for the person last changed, their
/// Activity history among them, with the other copies of Pith running then. The smoke test's own `read` fills it in.
public struct PersistedState {
    /// Pith's defaults domain as saved.
    public let defaults: NSDictionary
    /// When each file and folder last changed, by path.
    public let changed: [String: Date]
    /// Pith's folder in Application Support, `~/Library/Application Support/Pith`, where Activity's history is kept.
    public let support: String
    /// The other copies of Pith running when it was read, by process ID, as the person's own is while they use it.
    public let othersRunning: [Int32]

    public init(defaults: NSDictionary, changed: [String: Date], support: String, othersRunning: [Int32] = []) {
        self.defaults = defaults
        self.changed = changed
        self.support = support
        self.othersRunning = othersRunning
    }

    /// What another copy of Pith writes while it runs: its week of history, `history.json`, saved once a minute as a
    /// new file put in the old one's place, which changes the date of the folder that holds it too.
    var writtenByAnotherPith: Set<String> { [(support as NSString).appendingPathComponent("history.json"), support] }

    /// Whether `path` is the file Foundation's atomic save of `history.json` writes first, in a copy of Pith whose process
    /// ID is among `others`, while that save is under way. `Data.write(to:options: .atomic)` writes the new file whole
    /// beside the old one, as `.dat.nosync`, the saving process's ID in hexadecimal, a dot and six letters and digits,
    /// then renames it over `history.json`, so a reading in those milliseconds sees it there. Confirmed on macOS 26.3 by
    /// saving a 32 MB `history.json` ten times in a folder of the test's own, as Pith saves it, while another thread
    /// listed that folder: every other name it saw was of that form, with the saving process's ID (VERIFICATION.md).
    static func isAtomicSaveOfHistory(_ path: String, in support: String, by others: Set<Int32>) -> Bool {
        guard (path as NSString).deletingLastPathComponent == support else { return false }
        let name = (path as NSString).lastPathComponent, prefix = ".dat.nosync"
        guard name.hasPrefix(prefix) else { return false }
        let parts = name.dropFirst(prefix.count).split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 2, let process = Int32(parts[0], radix: 16), others.contains(process), parts[0].allSatisfy(\.isHexDigit) else { return false }
        return parts[1].count == 6 && parts[1].allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber) }
    }

    /// What differs from `earlier`: each default whose value changed, came or went, and each file or folder that did.
    /// While another copy of Pith ran, at either reading, exactly what it writes meanwhile is left out: its history and
    /// its folder's date (`writtenByAnotherPith`), and the file its atomic save of the history writes first
    /// (`isAtomicSaveOfHistory`). `leftOut` names what of it changed. Anything else that changed counts all the same.
    public func differences(from earlier: PersistedState) -> (changes: [String], leftOut: [String]) {
        let keys = Set((defaults.allKeys + earlier.defaults.allKeys).compactMap { $0 as? String })
        let settings = keys.filter { defaults[$0] as? NSObject != earlier.defaults[$0] as? NSObject }.map { "default \($0)" }
        let paths = Set(changed.keys).union(earlier.changed.keys).filter { changed[$0] != earlier.changed[$0] }
        let others = Set(othersRunning + earlier.othersRunning)
        let written = others.isEmpty ? [] : paths.filter { writtenByAnotherPith.contains($0) || Self.isAtomicSaveOfHistory($0, in: support, by: others) }
        return ((settings + paths.subtracting(written).map { "file \($0)" }).sorted(), written.map { "file \($0)" }.sorted())
    }

    /// Which of `roots` the person's Scans folder `scans`, Pith's own, holds a scan memory for (`ScanMemory.file(for:in:)`),
    /// as a run that kept its scans there would leave for each root it mapped. It only asks whether each one's file is
    /// there (`exists`), reading nothing and changing nothing.
    public static func scanMemories(of roots: [String], in scans: URL, exists: (String) -> Bool = { FileManager.default.fileExists(atPath: $0) }) -> [String] {
        roots.filter { exists(ScanMemory.file(for: $0, in: scans).path) }
    }
}
