import AppKit
import PithCore
import SwiftUI

/// A live figure whose digits spin to each new reading, as NumberFlow draws them on the web. Each digit is a wheel of 0
/// to 9 that turns through the digits between, the way the number moved, and wraps from 9 to 0 as an odometer does. A
/// place the number gains spins in a beat later, one it loses fades out, words around the number crossfade, and the
/// wheels fade at their top and bottom edges. VoiceOver reads the figure whole; with Reduce Motion it changes in place.
///
/// Core Animation turns the wheels, outside the app. Any animation SwiftUI runs in a Pith window lays the whole window out
/// again every frame: a single rolling figure cost the open panel 45% of a core, against 3% standing still.
struct FlowText: View {
    let text: String
    /// The number behind the text: whether it rose or fell sets which way the wheels turn.
    let amount: Double?
    let face: NSFont
    let color: NSColor

    init(_ text: String, amount: Double?, face: NSFont, color: NSColor) {
        self.text = text
        self.amount = amount
        self.face = face
        self.color = color
    }

    // SwiftUI aligns a hosted AppKit view by its bottom edge, so the baselines are given: the face's ascent from the
    // top, where the view draws them, as SwiftUI's own text of the face has them.
    var body: some View {
        let baseline = CTFontGetAscent(face)
        FlowLayers(text: text, amount: amount, face: face, color: color)
            .alignmentGuide(.firstTextBaseline) { _ in baseline }
            .alignmentGuide(.lastTextBaseline) { _ in baseline }
    }
}

private struct FlowLayers: NSViewRepresentable {
    let text: String
    let amount: Double?
    let face: NSFont
    let color: NSColor

    func makeNSView(context: Context) -> FlowView { FlowView() }

    func updateNSView(_ view: FlowView, context: Context) {
        view.show(text, amount: amount, face: face, color: color, moves: !context.environment.accessibilityReduceMotion)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, nsView view: FlowView, context: Context) -> CGSize? { view.size }
}

/// The figure as layers: a masked slot per digit holding a column of digits that springs to the reading, and an image
/// of each run of other text. Each column is one image per face and colour, shared by every wheel that uses it.
final class FlowView: NSView {
    /// The figure's size as SwiftUI lays out the same text: its exact width, and the face's height.
    private(set) var size: CGSize = .zero
    private var text = ""
    private var figure = FlowFigure("")
    private var shownAmount: Double?
    private var face: NSFont?
    private var color: NSColor?
    private var metrics = Metrics(digit: 0, ascent: 0, descent: 0)
    /// Each wheel's turn in digits, between 0 and 10 at rest. A spin counts on past 9 or back past 0 within the column's
    /// repeats, and once it settles the wheel moves to the same digit in the middle repeat, which looks the same.
    private var wheels: [String: Double] = [:]
    private var slots: [String: CALayer] = [:]
    private var columns: [String: CALayer] = [:]
    private var literals: [String: CALayer] = [:]
    private var literalTexts: [String: String] = [:]
    /// Which change is playing, so a settle scheduled for an older one leaves a newer spin alone.
    private var generation = 0

    private struct Metrics {
        /// A digit's advance: Monaspace's digits are all one width.
        var digit: CGFloat
        var ascent: CGFloat
        var descent: CGFloat
        var height: CGFloat { (ascent + descent).rounded(.up) }
        /// The distance between neighbouring digits on a wheel: far enough that a resting digit's neighbours sit wholly
        /// outside the fade, wherever the face places digits in its line (1.25 lines left slivers showing).
        var pitch: CGFloat { height * 1.5 }
        /// How far the fade reaches past the line, above and below. A resting digit is never faded.
        var reach: CGFloat { height * 0.3 }
    }

    /// The column's positions on a wheel: 0 to 9 three times over, from -10 up to 20, so a wheel at rest in the middle
    /// repeat can turn nine steps either way.
    private static let positions = -10..<20
    /// The wheels settle on a spring, as NumberFlow's do. NumberFlow's take 0.9 s; these land within half a second, well
    /// before the next reading while someone is watching.
    private static let spinDuration = 0.45
    private static let spinBounce = 0.12
    /// A place the number gains waits this long, so it doesn't land on the digits making room for it.
    private static let arrivalDelay = 0.08
    /// A place the number loses goes at once: the figure has already closed up around it.
    private static let departure = 0.1
    private static var columnImages: [String: CGImage] = [:]

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        setAccessibilityElement(true)
        setAccessibilityRole(.staticText)
    }

    required init?(coder: NSCoder) { fatalError("FlowView is created in code") }

    override var firstBaselineOffsetFromTop: CGFloat { metrics.ascent }
    override var lastBaselineOffsetFromBottom: CGFloat { metrics.height - metrics.ascent }
    override var intrinsicContentSize: NSSize { size }

    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        rebuild()
    }

    override func viewDidChangeBackingProperties() {
        super.viewDidChangeBackingProperties()
        rebuild()
    }

    func show(_ text: String, amount: Double?, face: NSFont, color: NSColor, moves: Bool) {
        setAccessibilityLabel(text)
        let restyled = face != self.face || color != self.color
        guard restyled || text != self.text else { return }
        let next = FlowFigure(text)
        let trend = amount.flatMap { now in shownAmount.map { now > $0 ? 1 : now < $0 ? -1 : 0 } } ?? 0
        self.text = text
        shownAmount = amount
        if restyled || !moves || window == nil {
            self.face = face
            self.color = color
            figure = next
            wheels = Self.atRest(next)
            rebuild()
        } else {
            flow(to: next, trend: trend)
        }
    }

    // MARK: Changes

    private func flow(to next: FlowFigure, trend: Int) {
        guard let face, let color else { return }
        var turned: [String: Double] = [:]
        for part in next.parts {
            guard case .digit(let place, let value) = part else { continue }
            if let turn = wheels[place], let was = figure.digit(at: place) {
                let steps = Double(FlowFigure.steps(from: was, to: value, trend: trend))
                // A change that lands before the last one settled could run off the column: it starts from the middle
                // repeat instead, a jump no one sees at a second a reading.
                turned[place] = Self.holds(turn + steps) ? turn + steps : Self.middle(turn) + steps
            } else {
                turned[place] = Double(value)
            }
        }
        let staying = Set(next.parts.map(\.id))
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for part in figure.parts where !staying.contains(part.id) { depart(part.id) }
        var x: CGFloat = 0
        for part in next.parts {
            switch part {
            case .digit(let place, _):
                let turn = turned[place] ?? 0
                if let slot = slots[place], let column = columns[place] {
                    slot.frame.origin.x = x
                    spin(column, to: turn, delay: 0)
                } else {
                    let (slot, column) = makeWheel(face: face, color: color)
                    slot.frame.origin.x = x
                    // It turns in from where the other wheels' digits come from: below while rising, above while falling.
                    column.position.y = columnY(trend >= 0 ? turn - 1 : turn + 1)
                    spin(column, to: turn, delay: Self.arrivalDelay)
                    fadeIn(slot, delay: Self.arrivalDelay)
                    slots[place] = slot
                    columns[place] = column
                }
                x += metrics.digit
            case .literal(let place, let words):
                let width = Self.width(words, face: face)
                if let layer = literals[place] {
                    layer.frame.origin.x = x
                    if literalTexts[place] != words {
                        let crossfade = CATransition()
                        crossfade.type = .fade
                        crossfade.duration = 0.15
                        layer.add(crossfade, forKey: "words")
                        layer.contents = image(words, width: width, face: face, color: color)
                        layer.frame.size.width = width
                        literalTexts[place] = words
                    }
                } else {
                    let layer = makeLiteral(words, width: width, face: face, color: color)
                    layer.frame.origin.x = x
                    fadeIn(layer, delay: 0)
                    literals[place] = layer
                    literalTexts[place] = words
                }
                x += width
            }
        }
        CATransaction.commit()
        figure = next
        wheels = turned
        resize(width: x)
        generation += 1
        let playing = generation
        // Once the springs settle, each wheel moves to its middle repeat, where its next spin has room either way.
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(Self.spinDuration * 3 + Self.arrivalDelay))
            guard let self, generation == playing else { return }
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            for (place, turn) in wheels where columns[place]?.animation(forKey: "spin") == nil {
                wheels[place] = Self.middle(turn)
                columns[place]?.position.y = columnY(Self.middle(turn))
            }
            CATransaction.commit()
        }
    }

    private func spin(_ column: CALayer, to turn: Double, delay: Double) {
        let from = (column.presentation() ?? column).position.y
        let to = columnY(turn)
        column.position.y = to
        guard from != to else { return }
        let spring = CASpringAnimation(perceptualDuration: Self.spinDuration, bounce: Self.spinBounce)
        spring.keyPath = "position.y"
        spring.fromValue = from
        spring.toValue = to
        spring.duration = spring.settlingDuration
        if delay > 0 {
            spring.beginTime = CACurrentMediaTime() + delay
            spring.fillMode = .backwards
        }
        column.add(spring, forKey: "spin")
    }

    private func fadeIn(_ layer: CALayer, delay: Double) {
        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = 0
        fade.toValue = 1
        fade.duration = 0.2
        fade.timingFunction = CAMediaTimingFunction(controlPoints: 0.23, 1, 0.32, 1)
        if delay > 0 {
            fade.beginTime = CACurrentMediaTime() + delay
            fade.fillMode = .backwards
        }
        layer.add(fade, forKey: "arrive")
    }

    private func depart(_ place: String) {
        guard let layer = slots.removeValue(forKey: place) ?? literals.removeValue(forKey: place) else { return }
        columns[place] = nil
        literalTexts[place] = nil
        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = 1
        fade.toValue = 0
        fade.duration = Self.departure
        layer.opacity = 0
        layer.add(fade, forKey: "depart")
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(Self.departure))
            layer.removeFromSuperlayer()
        }
    }

    // MARK: Layers

    /// Every layer again, at rest: for a new face, colour, appearance or scale, or a change made without motion.
    private func rebuild() {
        guard let face, let color, let layer else { return }
        layer.sublayers?.forEach { $0.removeFromSuperlayer() }
        slots = [:]
        columns = [:]
        literals = [:]
        literalTexts = [:]
        metrics = Self.metrics(face)
        wheels = wheels.isEmpty ? Self.atRest(figure) : wheels.mapValues(Self.middle)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        var x: CGFloat = 0
        for part in figure.parts {
            switch part {
            case .digit(let place, let value):
                let (slot, column) = makeWheel(face: face, color: color)
                slot.frame.origin.x = x
                column.position.y = columnY(wheels[place] ?? Double(value))
                slots[place] = slot
                columns[place] = column
                x += metrics.digit
            case .literal(let place, let words):
                let width = Self.width(words, face: face)
                let literal = makeLiteral(words, width: width, face: face, color: color)
                literal.frame.origin.x = x
                literals[place] = literal
                literalTexts[place] = words
                x += width
            }
        }
        CATransaction.commit()
        resize(width: x)
    }

    private func makeWheel(face: NSFont, color: NSColor) -> (slot: CALayer, column: CALayer) {
        let height = metrics.height, reach = metrics.reach
        let slot = CALayer()
        slot.frame = CGRect(x: 0, y: 0, width: metrics.digit, height: height)
        let fade = CAGradientLayer()
        fade.frame = CGRect(x: 0, y: -reach, width: metrics.digit, height: height + 2 * reach)
        let edge = reach / (height + 2 * reach)
        fade.colors = [NSColor.clear.cgColor, NSColor.black.cgColor, NSColor.black.cgColor, NSColor.clear.cgColor]
        fade.locations = [0, NSNumber(value: Double(edge)), NSNumber(value: Double(1 - edge)), 1]
        slot.mask = fade
        let column = CALayer()
        column.bounds = CGRect(x: 0, y: 0, width: metrics.digit, height: metrics.pitch * CGFloat(Self.positions.count))
        column.position.x = metrics.digit / 2
        column.contents = columnImage(face: face, color: color)
        column.contentsScale = scale
        // Pinned, not stretched: an image rounded up to whole pixels would otherwise scale its baselines off by a hair.
        column.contentsGravity = .bottomLeft
        slot.addSublayer(column)
        layer?.addSublayer(slot)
        return (slot, column)
    }

    private func makeLiteral(_ words: String, width: CGFloat, face: NSFont, color: NSColor) -> CALayer {
        let literal = CALayer()
        literal.frame = CGRect(x: 0, y: 0, width: width, height: metrics.height)
        literal.contents = image(words, width: width, face: face, color: color)
        literal.contentsScale = scale
        literal.contentsGravity = .bottomLeft
        layer?.addSublayer(literal)
        return literal
    }

    /// Where a column sits so its digit at `turn` fills the slot, its baseline on the slot's: the view isn't flipped, so
    /// a column moves up as its turn grows and the next digit rises from below.
    private func columnY(_ turn: Double) -> CGFloat {
        let column = metrics.pitch * CGFloat(Self.positions.count)
        let row = CGFloat(turn) - CGFloat(Self.positions.lowerBound)
        return metrics.height - column + row * metrics.pitch + column / 2
    }

    private func resize(width: CGFloat) {
        // Unrounded, as SwiftUI lays text out: rounded up, a row of right-aligned figures stood a point to the left.
        let fitted = CGSize(width: width, height: metrics.height)
        guard fitted != size else { return }
        size = fitted
        invalidateIntrinsicContentSize()
    }

    // MARK: Drawing

    private var scale: CGFloat { window?.backingScaleFactor ?? NSScreen.main?.backingScaleFactor ?? 2 }

    /// The column for a face and colour: each position's digit on its own line, `pitch` apart, drawn once and shared.
    private func columnImage(face: NSFont, color: NSColor) -> CGImage? {
        let resolved = resolve(color)
        let key = "\(face.fontName) \(face.pointSize) \(scale) \(resolved.components ?? [])"
        if let cached = Self.columnImages[key] { return cached }
        let height = metrics.pitch * CGFloat(Self.positions.count)
        let lines = Self.positions.enumerated().map { row, position in
            (String((position % 10 + 10) % 10), CGPoint(x: 0, y: height - CGFloat(row) * metrics.pitch - metrics.ascent))
        }
        let image = Self.draw(lines, size: CGSize(width: metrics.digit, height: height), face: face, color: resolved, scale: scale)
        Self.columnImages[key] = image
        return image
    }

    private func image(_ words: String, width: CGFloat, face: NSFont, color: NSColor) -> CGImage? {
        Self.draw([(words, CGPoint(x: 0, y: metrics.height - metrics.ascent))], size: CGSize(width: width, height: metrics.height),
                  face: face, color: resolve(color), scale: scale)
    }

    /// The colour as this view's appearance shows it: a layer keeps the colour it's drawn with.
    private func resolve(_ color: NSColor) -> CGColor {
        var resolved = color.cgColor
        effectiveAppearance.performAsCurrentDrawingAppearance { resolved = color.cgColor }
        return resolved
    }

    /// Text drawn at baselines measured from the bottom, as Core Text draws.
    private static func draw(_ lines: [(String, CGPoint)], size: CGSize, face: NSFont, color: CGColor, scale: CGFloat) -> CGImage? {
        let width = Int((size.width * scale).rounded(.up)), height = Int((size.height * scale).rounded(.up))
        guard width > 0, height > 0, let space = CGColorSpace(name: CGColorSpace.sRGB),
              let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        context.scaleBy(x: scale, y: scale)
        // Smoothed as SwiftUI smooths its text, which thickens light strokes on dark at small sizes.
        context.setAllowsFontSmoothing(true)
        context.setShouldSmoothFonts(true)
        context.setFillColor(color)
        let attributes: [NSAttributedString.Key: Any] = [.font: face, NSAttributedString.Key(kCTForegroundColorFromContextAttributeName as String): true]
        for (words, baseline) in lines {
            context.textPosition = baseline
            CTLineDraw(CTLineCreateWithAttributedString(NSAttributedString(string: words, attributes: attributes)), context)
        }
        return context.makeImage()
    }

    // MARK: Measures

    private static func metrics(_ face: NSFont) -> Metrics {
        let digit = CTLineGetTypographicBounds(CTLineCreateWithAttributedString(NSAttributedString(string: "0", attributes: [.font: face])), nil, nil, nil)
        return Metrics(digit: CGFloat(digit), ascent: CTFontGetAscent(face), descent: CTFontGetDescent(face))
    }

    private static func width(_ words: String, face: NSFont) -> CGFloat {
        CGFloat(CTLineGetTypographicBounds(CTLineCreateWithAttributedString(NSAttributedString(string: words, attributes: [.font: face])), nil, nil, nil))
    }

    private static func holds(_ turn: Double) -> Bool { turn >= Double(positions.lowerBound) && turn <= Double(positions.upperBound - 1) }

    /// The same digit's place in a wheel's middle repeat, from 0 up to 10.
    private static func middle(_ turn: Double) -> Double { turn - 10 * (turn / 10).rounded(.down) }

    private static func atRest(_ figure: FlowFigure) -> [String: Double] {
        var wheels: [String: Double] = [:]
        for part in figure.parts {
            if case .digit(let place, let value) = part { wheels[place] = Double(value) }
        }
        return wheels
    }
}
