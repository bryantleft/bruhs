import Foundation

/// Activity's search, with filters for what words can't say: `cpu>10`, `mem>1gb`, `power>2`, `kind:tool` and
/// `path:homebrew`, as macmon's filter language has them. Words that aren't filters search names, versions,
/// descriptions, helpers and PIDs, as before.
public struct ActivityQuery: Equatable, Sendable {
    public var words: [String] = []
    /// Percent of the Mac.
    public var cpuAbove: Double?
    public var memoryAbove: UInt64?
    /// Watts.
    public var powerAbove: Double?
    public var kind: ProcessKind?
    public var path: String?

    public var isEmpty: Bool { words.isEmpty && cpuAbove == nil && memoryAbove == nil && powerAbove == nil && kind == nil && path == nil }
    /// The words as one search string, for the name match.
    public var text: String { words.joined(separator: " ") }

    public init(_ search: String) {
        for token in search.split(whereSeparator: \.isWhitespace).map(String.init) {
            let lower = token.lowercased()
            if let value = Self.number(after: "cpu>", in: lower) { cpuAbove = value }
            else if let value = Self.number(after: "power>", in: lower) { powerAbove = value }
            else if lower.hasPrefix("mem>"), let bytes = Self.bytes(String(lower.dropFirst(4))) { memoryAbove = bytes }
            else if lower.hasPrefix("kind:") {
                switch lower.dropFirst(5) {
                case "app", "apps": kind = .app
                case "tool", "tools", "cli": kind = .commandLineTool
                case "system", "macos": kind = .system
                default: words.append(token)
                }
            } else if lower.hasPrefix("path:"), lower.count > 5 { path = String(token.dropFirst(5)) }
            else { words.append(token) }
        }
    }

    /// Whether a row's figures and identity pass the filters. Words are matched separately, by the listing.
    public func passes(kind rowKind: ProcessKind, executable: String, values: ActivityListing.Values) -> Bool {
        if let kind, rowKind != kind { return false }
        if let path, !executable.localizedCaseInsensitiveContains(path) { return false }
        if let cpuAbove, (values.cpu ?? -1) <= cpuAbove { return false }
        if let memoryAbove, (values.memory ?? 0) <= memoryAbove { return false }
        if let powerAbove, (values.power ?? -1) <= powerAbove { return false }
        return true
    }

    private static func number(after prefix: String, in token: String) -> Double? {
        guard token.hasPrefix(prefix) else { return nil }
        return Double(token.dropFirst(prefix.count).trimmingCharacters(in: CharacterSet(charactersIn: "%w")))
    }

    /// "500mb", "1.5gb", "800" (megabytes when there's no unit): binary units, as memory is counted.
    static func bytes(_ text: String) -> UInt64? {
        let gib = 1_073_741_824.0, mib = 1_048_576.0, kib = 1024.0
        let units: [(String, Double)] = [("gb", gib), ("g", gib), ("mb", mib), ("m", mib), ("kb", kib), ("k", kib)]
        for (suffix, scale) in units where text.hasSuffix(suffix) {
            return Double(text.dropLast(suffix.count)).map { UInt64($0 * scale) }
        }
        return Double(text).map { UInt64($0 * mib) }
    }
}

extension ActivityListing {
    /// The rows as CSV, for File > Export Activity: one line per app, then each of System's processes, with the
    /// figures as numbers (percent, bytes, watts, bytes per second) so a spreadsheet can sort them.
    public func csv() -> String {
        func field(_ text: String) -> String {
            text.contains(where: { $0 == "," || $0 == "\"" || $0.isNewline }) ? "\"" + text.replacingOccurrences(of: "\"", with: "\"\"") + "\"" : text
        }
        func number(_ value: Double?) -> String { value.map { String(format: "%.2f", $0) } ?? "" }
        var lines = ["Name,Kind,PIDs,CPU %,Memory bytes,Power W,Read bytes/s,Written bytes/s,Network bytes/s,Path"]
        for app in apps + (system?.apps ?? []) {
            lines.append([field(app.identity.displayName), field(app.identity.kind.label), app.members.map { String($0.pid) }.joined(separator: " "),
                          number(app.values.cpu), app.values.memory.map(String.init) ?? "", number(app.values.power),
                          number(app.values.read), number(app.values.written), number(app.values.network), field(app.executable)].joined(separator: ","))
        }
        return lines.joined(separator: "\n") + "\n"
    }
}
