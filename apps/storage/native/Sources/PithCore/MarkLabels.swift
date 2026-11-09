import CoreGraphics

/// Names for marks along a chart's time axis, such as where apps opened, placed so none covers another. Each starts
/// just after its mark, or ends just before it where the plot's trailing edge leaves no room. Marks too close to name
/// apart share one label, beside all of them, with the first's name and how many more, as "Blender +2". Several apps
/// opening within moments otherwise piled their names into one unreadable smear.
public enum MarkLabels {
    public struct Mark: Equatable, Sendable {
        /// Where the mark falls, in points from the plot's leading edge.
        public let x: CGFloat
        public let name: String

        public init(x: CGFloat, name: String) {
            self.x = x
            self.name = name
        }
    }

    public struct Label: Equatable, Sendable {
        /// Where the label starts, in points from the plot's leading edge.
        public let x: CGFloat
        public let width: CGFloat
        public let text: String
        /// The marks it names.
        public let count: Int
    }

    /// Labels for `marks` on a plot `width` points wide, given how wide a text is set. A label sits `spacing` after
    /// its last mark, or before its first where it would cross the plot's trailing edge, so no mark's line runs
    /// through it, and at least `gap` from the one before.
    public static func place(_ marks: [Mark], width: CGFloat, spacing: CGFloat = 3, gap: CGFloat = 6, measure: (String) -> CGFloat) -> [Label] {
        // Lines closer than the narrowest label, "+9", with its spacing, can't be named apart, whichever side of
        // them their label ends up on.
        let crowded = spacing + measure("+9") + gap
        var groups: [[Mark]] = []
        for mark in marks.sorted(by: { $0.x < $1.x }) {
            if let previous = groups.last?.last, mark.x - previous.x < crowded {
                groups[groups.count - 1].append(mark)
            } else {
                groups.append([mark])
            }
        }
        var placed: [(marks: [Mark], label: Label)] = []
        var next = 0
        while next < groups.count {
            var group = groups[next]
            next += 1
            while true {
                let text = group.count == 1 ? group[0].name : "\(group[0].name) +\(group.count - 1)"
                let textWidth = measure(text)
                let after = group[group.count - 1].x + spacing
                let x: CGFloat
                if after + textWidth <= width {
                    // A line the label would cross joins it.
                    if next < groups.count, groups[next][0].x < after + textWidth + gap {
                        group += groups[next]
                        next += 1
                        continue
                    }
                    x = after
                } else {
                    x = max(0, group[0].x - spacing - textWidth)
                }
                // Reaching the label before, or across its lines: the two become one, which may then reach the one
                // before that.
                if let last = placed.last, x < last.label.x + last.label.width + gap || x < last.marks[last.marks.count - 1].x {
                    group = last.marks + group
                    placed.removeLast()
                    continue
                }
                placed.append((group, Label(x: x, width: textWidth, text: text, count: group.count)))
                break
            }
        }
        return placed.map(\.label)
    }
}
