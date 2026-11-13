import AppKit
import SwiftUI

/// A live reading that crossfades in place. Core Animation handles the fade, keeping SwiftUI out of per-frame layout.
/// VoiceOver receives the latest value immediately; Reduce Motion replaces the text without a transition.
struct FlowText: View {
    let text: String
    let face: NSFont
    let color: NSColor
    let animates: Bool
    let duration: TimeInterval

    init(_ text: String, face: NSFont, color: NSColor, animates: Bool = true, duration: TimeInterval = ReadingMotion.standard) {
        self.text = text
        self.face = face
        self.color = color
        self.animates = animates
        self.duration = duration
    }

    var body: some View {
        let baseline = CTFontGetAscent(face)
        FlowLayers(text: text, face: face, color: color, animates: animates, duration: duration)
            .alignmentGuide(.firstTextBaseline) { _ in baseline }
            .alignmentGuide(.lastTextBaseline) { _ in baseline }
    }
}

private struct FlowLayers: NSViewRepresentable {
    let text: String
    let face: NSFont
    let color: NSColor
    let animates: Bool
    let duration: TimeInterval

    func makeNSView(context: Context) -> FlowView { FlowView() }

    func updateNSView(_ view: FlowView, context: Context) {
        view.show(text, face: face, color: color, moves: animates && !context.environment.accessibilityReduceMotion, duration: duration)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, nsView view: FlowView, context: Context) -> CGSize? { view.size }
}

/// One text image, redrawn only when its value or appearance changes. Values never travel through other digits.
final class FlowView: NSView {
    private(set) var size: CGSize = .zero
    private let reading = CALayer()
    private var text = ""
    private var face: NSFont?
    private var color: NSColor?

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        reading.name = "Pith reading"
        reading.contentsGravity = .bottomLeft
        layer?.addSublayer(reading)
        setAccessibilityElement(true)
        setAccessibilityRole(.staticText)
    }

    required init?(coder: NSCoder) { fatalError("FlowView is created in code") }

    override var firstBaselineOffsetFromTop: CGFloat { face.map { CTFontGetAscent($0) } ?? 0 }
    override var lastBaselineOffsetFromBottom: CGFloat { size.height - firstBaselineOffsetFromTop }
    override var intrinsicContentSize: NSSize { size }

    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        drawReading()
    }

    override func viewDidChangeBackingProperties() {
        super.viewDidChangeBackingProperties()
        drawReading()
    }

    func show(_ text: String, face: NSFont, color: NSColor, moves: Bool, duration: TimeInterval = ReadingMotion.standard) {
        let changed = text != self.text
        let restyled = face != self.face || color != self.color
        if changed { setAccessibilityLabel(text) }
        // A Reduce Motion change must stop an existing fade even if the reading itself has not changed.
        if !moves { reading.removeAnimation(forKey: ReadingMotion.fadeKey) }
        guard changed || restyled else { return }
        self.text = text
        self.face = face
        self.color = color
        drawReading(moves: moves && !restyled && window != nil, duration: duration)
    }

    private func drawReading(moves: Bool = false, duration: TimeInterval = ReadingMotion.standard) {
        guard let face, let color else { return }
        let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: [
            .font: face, NSAttributedString.Key(kCTForegroundColorFromContextAttributeName as String): true
        ]))
        let fitted = CGSize(width: CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil)),
                            height: (CTFontGetAscent(face) + CTFontGetDescent(face)).rounded(.up))
        let scale = window?.backingScaleFactor ?? NSScreen.main?.backingScaleFactor ?? 2
        var image: CGImage?
        let width = Int((fitted.width * scale).rounded(.up)), height = Int((fitted.height * scale).rounded(.up))
        if width > 0, height > 0, let space = CGColorSpace(name: CGColorSpace.sRGB),
           let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                                   bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) {
            context.scaleBy(x: scale, y: scale)
            context.setAllowsFontSmoothing(true)
            context.setShouldSmoothFonts(true)
            effectiveAppearance.performAsCurrentDrawingAppearance { context.setFillColor(color.cgColor) }
            context.textPosition = CGPoint(x: 0, y: fitted.height - CTFontGetAscent(face))
            CTLineDraw(line, context)
            image = context.makeImage()
        }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        if moves { ReadingMotion.fade(reading, duration: duration) }
        else { reading.removeAnimation(forKey: ReadingMotion.fadeKey) }
        reading.frame = CGRect(origin: .zero, size: fitted)
        reading.contentsScale = scale
        reading.contents = image
        CATransaction.commit()
        if fitted != size {
            size = fitted
            invalidateIntrinsicContentSize()
        }
    }
}
