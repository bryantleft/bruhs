import Foundation

/// A live figure split as a rolling counter shows it, as NumberFlow does on the web: each digit keyed by the place it
/// holds, counted out from the decimal point, so a digit keeps its wheel as the number gains or loses places; and the
/// text around the number as literals. "3.11 GB" is ones 3, the point, tenths 1, hundredths 1 and " GB".
public struct FlowFigure: Equatable, Sendable {
    public enum Part: Equatable, Sendable, Identifiable {
        /// A digit and its place: "i0" the ones, "i1" the tens and so on; "f1" the tenths, "f2" the hundredths.
        case digit(place: String, value: Int)
        /// Text that isn't a digit, keyed by where it stands: "." the point, "g3" a separator before the thousands, "s"
        /// whatever follows the number.
        case literal(place: String, text: String)

        public var id: String {
            switch self {
            case .digit(let place, _), .literal(let place, _): place
            }
        }
    }

    public let parts: [Part]

    /// Pith formats its figures with `String(format:)`, so "." is the point and a figure has no sign. Text that doesn't
    /// start with a digit is one literal.
    public init(_ text: String) {
        var index = text.startIndex
        var integer: [Character] = []
        while index < text.endIndex, Self.isDigit(text[index]) || (text[index] == "," && !integer.isEmpty) {
            integer.append(text[index])
            index = text.index(after: index)
        }
        // A comma after the last digit belongs to the words that follow, as in "82, charging".
        while integer.last == "," {
            integer.removeLast()
            index = text.index(before: index)
        }
        guard !integer.isEmpty else {
            parts = text.isEmpty ? [] : [.literal(place: "s", text: text)]
            return
        }
        var parts: [Part] = []
        var placesToTheRight = 0
        for character in integer.reversed() {
            if character == "," {
                parts.append(.literal(place: "g\(placesToTheRight)", text: ","))
            } else {
                parts.append(.digit(place: "i\(placesToTheRight)", value: character.wholeNumberValue ?? 0))
                placesToTheRight += 1
            }
        }
        parts.reverse()
        let afterPoint = index < text.endIndex && text[index] == "." ? text.index(after: index) : nil
        if let afterPoint, afterPoint < text.endIndex, Self.isDigit(text[afterPoint]) {
            parts.append(.literal(place: ".", text: "."))
            index = afterPoint
            var place = 1
            while index < text.endIndex, Self.isDigit(text[index]) {
                parts.append(.digit(place: "f\(place)", value: text[index].wholeNumberValue ?? 0))
                place += 1
                index = text.index(after: index)
            }
        }
        if index < text.endIndex { parts.append(.literal(place: "s", text: String(text[index...]))) }
        self.parts = parts
    }

    /// The digit at `place`, or nil when the figure has no digit there.
    public func digit(at place: String) -> Int? {
        for part in parts { if case .digit(place, let value) = part { return value } }
        return nil
    }

    /// How far a wheel turns from `old` to `new`, in steps of one digit: the way the number moved, up when `trend` is
    /// above zero and down when it's below, round through 9 and 0 if it must; the short way when the number held still.
    public static func steps(from old: Int, to new: Int, trend: Int) -> Int {
        let up = ((new - old) % 10 + 10) % 10
        guard up != 0 else { return 0 }
        if trend > 0 { return up }
        if trend < 0 { return up - 10 }
        return up <= 5 ? up : up - 10
    }

    private static func isDigit(_ character: Character) -> Bool { character.isASCII && character.isWholeNumber }
}
