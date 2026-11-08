import AppKit
import Charts
import CoreText
import PithCore
import SwiftUI
import UniformTypeIdentifiers

// Pith's half of the bruhs theme: macOS owns the chrome (menu bar item, glass, toolbars,
// menus, alerts, Settings), bruhs owns the content. Colours come from the generated
// BruhsTokens.swift; numbers and data use Monaspace; control and prose labels stay in the
// system font.

/// Monaspace ships inside the app next to the disk map (Resources/web/fonts). Registering it
/// for this process lets SwiftUI and AppKit use it by family name.
enum BruhsFonts {
    enum Family: String {
        case neon = "Monaspace Neon Var"
        case argon = "Monaspace Argon Var"
        case krypton = "Monaspace Krypton Var"
    }

    @MainActor private(set) static var isAvailable = false

    @MainActor static func register() {
        guard !isAvailable else { return }
        let folder = Bundle.main.resourceURL?.appendingPathComponent("web/fonts")
        let files = folder.flatMap { try? FileManager.default.contentsOfDirectory(at: $0, includingPropertiesForKeys: nil) } ?? []
        for url in files where url.pathExtension == "woff2" && url.lastPathComponent.hasPrefix("Monaspace") {
            var error: Unmanaged<CFError>?
            if !CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error), let error = error?.takeRetainedValue() {
                NSLog("Pith: could not register \(url.lastPathComponent): \(error.localizedDescription)")
            }
        }
        isAvailable = NSFont(name: "MonaspaceNeonVar-Regular", size: 12) != nil
        if !isAvailable {
            // `swift run` has no bundle resources; the packaged app always does, and the smoke test checks it.
            NSLog("Pith: Monaspace is not in the app bundle, so data falls back to the system monospaced font.")
        }
    }
}

extension Font {
    @MainActor static func monaspace(_ family: BruhsFonts.Family = .neon, size: CGFloat, weight: Font.Weight = .regular) -> Font {
        BruhsFonts.isAvailable
            ? .custom(family.rawValue, size: size).weight(weight)
            : .system(size: size, weight: weight, design: .monospaced)
    }
}

/// The View menu's Bigger and Smaller Text. macOS has no Dynamic Type, so Pith scales its own type roles; the window
/// chrome, menus and alerts follow the system as they always do.
@MainActor @Observable final class TextSize {
    static let shared = TextSize()
    /// Steps either side of the default, as Mail and Notes offer. Past 1.4 the panel no longer fits under the menu bar.
    static let steps: [Double] = [0.85, 1, 1.15, 1.3, 1.4]
    private static let key = "textScale"
    private(set) var scale: Double

    private init() {
        let saved = UserDefaults.standard.double(forKey: Self.key)
        scale = Self.steps.contains(saved) ? saved : 1
    }

    var canGrow: Bool { scale < Self.steps[Self.steps.count - 1] }
    var canShrink: Bool { scale > Self.steps[0] }

    func step(_ direction: Int) {
        guard let index = Self.steps.firstIndex(of: scale) else { return reset() }
        set(Self.steps[min(Self.steps.count - 1, max(0, index + direction))])
    }

    func reset() { set(1) }

    private func set(_ value: Double) {
        scale = value
        UserDefaults.standard.set(value, forKey: Self.key)
    }

    /// A point size at the current scale.
    func size(_ points: CGFloat) -> CGFloat { (points * scale).rounded(.toNearestOrAwayFromZero) }
}

/// Type roles for Pith's content. Numbers and data are Monaspace with tabular digits; names, labels, sentences and
/// controls use the system font so they sit naturally next to macOS chrome. Every role follows the View menu's text size.
@MainActor enum BruhsType {
    private static func size(_ points: CGFloat) -> CGFloat { TextSize.shared.size(points) }
    /// The headline value in the panel, e.g. "17%".
    static var readout: Font { .monaspace(size: size(30), weight: .medium) }
    static var data: Font { .monaspace(size: size(12.5)) }
    static var dataSmall: Font { .monaspace(size: size(11)) }
    /// A small figure under or beside content, e.g. a chart's axis times. Sentences use `note`.
    static var caption: Font { .monaspace(size: size(11)) }
    /// The name heading a panel, e.g. the inspector's app.
    static var title: Font { .system(size: size(15), weight: .semibold) }
    static var label: Font { .system(size: size(13), weight: .semibold) }
    static var body: Font { .system(size: size(13)) }
    /// Names and labels in dense rows, e.g. the inspector's process list.
    static var bodySmall: Font { .system(size: size(12)) }
    /// A short hint, description or sentence under or beside the content.
    static var note: Font { .system(size: size(11)) }
    static var sectionTitle: Font { .system(size: size(11), weight: .semibold) }
    /// Chips and buttons, which sit beside macOS's own controls.
    static var control: Font { .system(size: size(12), weight: .medium) }
}

extension MemoryPressure {
    /// Never colour alone: pair with `symbol` and `label`.
    var tint: Color {
        switch self {
        case .normal: BruhsColor.statusNormal
        case .warning: BruhsColor.statusWarning
        case .critical: BruhsColor.statusCritical
        case .unknown: BruhsColor.textTertiary
        }
    }
}

/// Memory pressure as symbol, colour and word together, so it reads without colour. Paused, it says so in a neutral
/// tone: a stale reading must never look healthy.
struct StatusChip: View {
    let pressure: MemoryPressure
    var paused = false
    var body: some View {
        Label {
            Text(paused ? "Paused" : pressure.label).foregroundStyle(paused ? BruhsColor.textSecondary : BruhsColor.text)
        } icon: {
            Image(systemName: paused ? "pause.circle" : pressure.symbol).foregroundStyle(paused ? BruhsColor.textTertiary : pressure.tint)
        }
        .font(BruhsType.control)
        .help(paused ? "Monitoring is paused, so there's no current reading." : "Memory pressure: how easily macOS can meet memory demand. Cached files in RAM are useful, not a problem.")
        .accessibilityElement(children: .combine)
        .accessibilityLabel(paused ? "Memory pressure paused" : "Memory pressure \(pressure.label)")
    }
}

extension ThermalPressure {
    var symbol: String { self >= .critical ? "thermometer.high" : "thermometer.medium" }
    var tint: Color { self >= .critical ? BruhsColor.statusCritical : self >= .serious ? BruhsColor.statusWarning : BruhsColor.textTertiary }
}

/// Shown only while macOS slows the Mac to cool it: symbol, colour and word, like memory pressure.
struct ThermalChip: View {
    let thermal: ThermalPressure
    var body: some View {
        Label {
            Text(thermal.label).foregroundStyle(BruhsColor.text)
        } icon: {
            Image(systemName: thermal.symbol).foregroundStyle(thermal.tint)
        }
        .font(BruhsType.control)
        .help("The Mac is \(thermal.label.lowercased()), so macOS is slowing it down to cool it. Apps run slower until it cools.")
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Thermal state \(thermal.label)")
    }
}

/// Low Power Mode is on, which slows the Mac on purpose.
struct LowPowerChip: View {
    var body: some View {
        Label("Low Power", systemImage: "leaf")
            .font(BruhsType.control)
            .foregroundStyle(BruhsColor.textSecondary)
            .help("Low Power Mode is on, so macOS runs the Mac slower to save energy.")
            .accessibilityLabel("Low Power Mode on")
    }
}

/// A short tag in a rounded box: what kind of process something is, a version or a count. It's the web theme's soft
/// badge in its neutral tone, so a category reads as its own element instead of text joined by a separator.
struct BruhsBadge: View {
    let text: String
    /// Set counts and versions in Monaspace, like other data.
    var isData = false

    var body: some View {
        Text(verbatim: text)
            .font(isData ? BruhsType.dataSmall : BruhsType.note)
            .foregroundStyle(BruhsColor.textSecondary)
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(BruhsColor.text.opacity(0.06), in: RoundedRectangle(cornerRadius: BruhsRadius.grape, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: BruhsRadius.grape, style: .continuous).strokeBorder(BruhsColor.hairline, lineWidth: 1))
    }
}

/// A figure led by its name, as in "Peak 40%": the name in the tertiary tone, the value in data type. Several sit in a
/// row with space between them rather than a separator character.
struct LabeledFigure: View {
    let label: String
    let value: String
    /// The number behind a live value, so a new reading rolls in; nil for one that holds still.
    var amount: Double? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(label).font(BruhsType.note).foregroundStyle(BruhsColor.textTertiary)
            Text(verbatim: value).font(BruhsType.caption).foregroundStyle(BruhsColor.textSecondary).rolls(amount)
        }
        .lineLimit(1)
        .fixedSize()
        .accessibilityElement(children: .combine)
    }
}

/// Marks a process macOS won't let Pith read. Its figures are left empty, so this says why once per row.
struct ProtectedMark: View {
    var body: some View {
        Image(systemName: "lock.fill")
            .font(.system(size: 9, weight: .semibold))
            .foregroundStyle(BruhsColor.textTertiary)
            .help("Protected by macOS, so Pith can't read its CPU, memory or disk activity")
            .accessibilityLabel("Protected by macOS")
    }
}

/// bruhs button tones for Pith's content. Toolbars and menus keep standard controls.
extension View {
    /// A live figure rolls to each new reading as a live price does: only the digits that change move, up as the number
    /// rises and down as it falls, starting at once and settling within a quarter second. Reduce Motion crossfades.
    func rolls(_ amount: Double?) -> some View { modifier(RollingFigure(amount: amount)) }
}

private struct RollingFigure: ViewModifier {
    let amount: Double?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .contentTransition(reduceMotion ? .opacity : .numericText(value: amount ?? 0))
            .animation(BruhsMotion.entrance(duration: BruhsMotion.standard), value: amount)
    }
}

/// The bruhs spinner, as the design system's `.spinner` draws it on the web: a ring with a quarter gone, turning once
/// every 0.6 s, since a quicker turn makes a wait feel shorter. Reduce Motion slows it to 1.2 s, as the web's does.
/// macOS's own spinner turns at a speed Pith can't set. Core Animation turns this one in the render server, so a long
/// scan costs Pith nothing to show it.
struct BruhsSpinner: NSViewRepresentable {
    var diameter: CGFloat = 16
    var lineWidth: CGFloat = 2

    func makeNSView(context: Context) -> SpinnerView { SpinnerView(diameter: diameter, lineWidth: lineWidth) }
    func updateNSView(_ view: SpinnerView, context: Context) {}
    func sizeThatFits(_ proposal: ProposedViewSize, nsView: SpinnerView, context: Context) -> CGSize? {
        CGSize(width: diameter, height: diameter)
    }

    final class SpinnerView: NSView {
        private let ring = CAShapeLayer()

        init(diameter: CGFloat, lineWidth: CGFloat) {
            super.init(frame: NSRect(x: 0, y: 0, width: diameter, height: diameter))
            wantsLayer = true
            ring.frame = bounds
            ring.path = CGPath(ellipseIn: bounds.insetBy(dx: lineWidth / 2, dy: lineWidth / 2), transform: nil)
            ring.fillColor = nil
            ring.lineWidth = lineWidth
            ring.lineCap = .round
            ring.strokeEnd = 0.75
            layer?.addSublayer(ring)
            setAccessibilityElement(true)
            setAccessibilityRole(.progressIndicator)
        }

        required init?(coder: NSCoder) { fatalError("BruhsSpinner is created in code") }

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            spin()
        }

        override func viewDidChangeEffectiveAppearance() {
            super.viewDidChangeEffectiveAppearance()
            paint()
        }

        /// A layer's colour doesn't follow the appearance by itself, so it's resolved for this view's.
        private func paint() {
            effectiveAppearance.performAsCurrentDrawingAppearance { ring.strokeColor = BruhsNSColor.textSecondary.cgColor }
        }

        private func spin() {
            paint()
            ring.removeAnimation(forKey: "spin")
            guard window != nil else { return }
            let turn = CABasicAnimation(keyPath: "transform.rotation.z")
            // Clockwise, as the web's turns: a negative angle in AppKit's unflipped layers.
            turn.fromValue = 0
            turn.toValue = -2 * Double.pi
            turn.duration = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion ? 1.2 : 0.6
            turn.repeatCount = .infinity
            ring.add(turn, forKey: "spin")
        }
    }
}

struct BruhsButtonStyle: ButtonStyle {
    enum Tone { case soft, ghost, softDanger }
    var tone: Tone = .soft
    @Environment(\.isEnabled) private var isEnabled
    @State private var hovering = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(BruhsType.control)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .foregroundStyle(foreground)
            .background(background(pressed: configuration.isPressed), in: RoundedRectangle(cornerRadius: BruhsRadius.grape, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: BruhsRadius.grape, style: .continuous))
            .opacity(isEnabled ? 1 : 0.5)
            .onHover { hovering = $0 }
    }

    private var foreground: Color {
        switch tone {
        case .soft: BruhsColor.accentSoftText
        case .ghost: BruhsColor.text
        case .softDanger: BruhsColor.dangerSoftText
        }
    }

    private func background(pressed: Bool) -> Color {
        let lift = pressed ? 0.12 : hovering && isEnabled ? 0.06 : 0
        switch tone {
        case .soft: return BruhsColor.accentSoft.opacity(1 + lift * 4)
        case .softDanger: return BruhsColor.dangerSoft.opacity(1 + lift * 4)
        case .ghost: return BruhsColor.text.opacity(lift)
        }
    }
}

extension ButtonStyle where Self == BruhsButtonStyle {
    static var bruhsSoft: BruhsButtonStyle { BruhsButtonStyle(tone: .soft) }
    static var bruhsGhost: BruhsButtonStyle { BruhsButtonStyle(tone: .ghost) }
    static var bruhsSoftDanger: BruhsButtonStyle { BruhsButtonStyle(tone: .softDanger) }
}

extension View {
    /// A recessed content surface: one tone step plus a hairline ring, never a shadow.
    func bruhsWell(radius: CGFloat = BruhsRadius.lychee) -> some View {
        background(BruhsColor.well, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(BruhsColor.hairline, lineWidth: 1))
    }
}

/// App icons by executable path. `.app` bundles get their own icon; anything else gets the
/// generic executable icon, so command-line tools and daemons still have a consistent mark.
@MainActor final class AppIconCache {
    static let shared = AppIconCache()
    private var icons: [String: NSImage] = [:]
    private lazy var executable = NSWorkspace.shared.icon(for: .unixExecutable)

    func icon(for path: String) -> NSImage {
        let key = SystemSampler.bundlePath(path) ?? (path.hasSuffix(".app") ? path : "")
        guard !key.isEmpty else { return executable }
        if let cached = icons[key] { return cached }
        let icon = NSWorkspace.shared.icon(forFile: key)
        icons[key] = icon
        return icon
    }
}

struct AppIconView: View {
    let executable: String
    var size: CGFloat = 16
    var body: some View {
        Image(nsImage: AppIconCache.shared.icon(for: executable))
            .resizable()
            .interpolation(.high)
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

/// A glanceable 0–100% trend over the session window: fixed axes, no labels, gaps stay gaps.
struct MiniTrend: View {
    struct Point: Identifiable {
        let time: Double
        let value: Double
        let segment: Int
        var id: Double { time }
    }

    let points: [Point]
    let window: ClosedRange<Double>
    var height: CGFloat = 56
    var tint: Color = BruhsColor.accent
    var fill: Color = BruhsColor.chartFill
    /// A ranked range to shade, as the Activity chart does, so figures for it read against the right stretch.
    var highlight: ClosedRange<Double>?
    var label: String

    /// Splits samples into segments wherever a gap is longer than `maxGap` seconds.
    static func points(_ samples: [(time: Double, value: Double?)], maxGap: Double) -> [Point] {
        var result: [Point] = []
        var segment = 0
        var previous: Double?
        for sample in samples {
            guard let value = sample.value else { previous = nil; continue }
            if let previous, sample.time - previous > maxGap { segment += 1 } else if previous == nil, !result.isEmpty { segment += 1 }
            result.append(Point(time: sample.time, value: min(100, max(0, value)), segment: segment))
            previous = sample.time
        }
        return result
    }

    var body: some View {
        Chart {
            // Conditionals inside a Chart builder need macOS 27's conformances, so the optional mark is a 0- or 1-element ForEach.
            ForEach(highlight.map { [$0] } ?? [], id: \.self) { range in
                RectangleMark(xStart: .value("Start", range.lowerBound), xEnd: .value("End", range.upperBound))
                    .foregroundStyle(BruhsColor.selection)
            }
            // The baseline spans the whole window, so a young session's first samples read as the latest
            // stretch of the timeline rather than a stray mark.
            RuleMark(y: .value("Zero", 0))
                .foregroundStyle(BruhsColor.hairline)
                .lineStyle(StrokeStyle(lineWidth: 1))
            ForEach(points) { point in
                AreaMark(x: .value("Time", point.time), yStart: .value("Zero", 0), yEnd: .value("Value", point.value), series: .value("Segment", point.segment))
                    .foregroundStyle(fill)
                LineMark(x: .value("Time", point.time), y: .value("Value", point.value), series: .value("Segment", point.segment))
                    .foregroundStyle(tint)
                    .lineStyle(StrokeStyle(lineWidth: 1.5, lineJoin: .round))
            }
        }
        .chartXScale(domain: window)
        .chartYScale(domain: 0...100)
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .frame(height: height)
        .transaction { $0.animation = nil }
        .accessibilityLabel(label)
    }
}

/// Details beside the content, in a rounded card on `surface` with a hairline ring. The caller insets it from the
/// window's edges and the toolbar, so toolbar items never sit on it. The user resizes it by dragging its leading edge
/// and closes it with the button in its corner. It stands in for SwiftUI's inspector, which macOS 26 draws as a glass
/// panel joined to the window's edge, with one rounded corner that shows as a notch against the canvas.
struct BruhsSidePanel<Content: View>: View {
    @Binding var width: Double
    let widths: ClosedRange<Double>
    let close: () -> Void
    @ViewBuilder var content: Content
    @State private var dragStart: Double?
    /// Whether this panel pushed the resize cursor, so it pops exactly once: on leaving the edge, when a drag that
    /// left the edge ends, or when the panel goes away mid-hover.
    @State private var cursorPushed = false
    @State private var hoveringEdge = false

    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: BruhsRadius.lychee, style: .continuous) }

    var body: some View {
        content
            .frame(width: min(widths.upperBound, max(widths.lowerBound, width)))
            .frame(maxHeight: .infinity)
            .background(BruhsColor.surface, in: shape)
            .clipShape(shape)
            .overlay(shape.strokeBorder(BruhsColor.hairline, lineWidth: 1).accessibilityHidden(true))
            .overlay(alignment: .topTrailing) {
                Button(action: close) { Image(systemName: "xmark") }
                    .buttonStyle(.bruhsGhost)
                    .padding(8)
                    .help("Close (Escape)")
                    .accessibilityLabel("Close")
            }
            .overlay(alignment: .leading) {
                // A wider target than the edge, centred on it. Global coordinates, because the edge moves while dragging.
                Color.clear
                    .frame(width: 9)
                    .contentShape(Rectangle())
                    .offset(x: -5)
                    .onHover { inside in
                        hoveringEdge = inside
                        if inside { pushCursor() } else if dragStart == nil { popCursor() }
                    }
                    .gesture(DragGesture(minimumDistance: 1, coordinateSpace: .global)
                        .onChanged { drag in
                            let start = dragStart ?? width
                            dragStart = start
                            width = min(widths.upperBound, max(widths.lowerBound, start - drag.translation.width))
                        }
                        .onEnded { _ in
                            dragStart = nil
                            if !hoveringEdge { popCursor() }
                        })
                    .onDisappear { popCursor() }
                    .accessibilityHidden(true)
            }
    }
}

extension BruhsSidePanel {
    private func pushCursor() {
        guard !cursorPushed else { return }
        NSCursor.resizeLeftRight.push()
        cursorPushed = true
    }

    private func popCursor() {
        guard cursorPushed else { return }
        NSCursor.pop()
        cursorPushed = false
    }
}

/// A scroll bar in the web theme's style: a thin, fully rounded thumb in the `scrollbar` role on no track, in
/// `scrollbarHover` while the pointer is over it or dragging it. AppKit still runs it, so it keeps overlay fading,
/// paging and the user's Show scroll bars setting.
final class BruhsScroller: NSScroller {
    /// The web theme's 10 px scrollbar less its 2 px clear border on each side.
    private static let thickness: CGFloat = 6
    private var hoverArea: NSTrackingArea?
    private var isHovering = false {
        didSet { if isHovering != oldValue { needsDisplay = true } }
    }

    override class var isCompatibleWithOverlayScrollers: Bool { true }
    override var isOpaque: Bool { false }

    /// Gives a scroll view these scroll bars in place of the system's. `inset` keeps them clear of a rounded
    /// container's corners: that far from the top and bottom, and half of it from the trailing edge.
    static func install(in scrollView: NSScrollView, inset: CGFloat = 0) {
        if !(scrollView.verticalScroller is BruhsScroller) { scrollView.verticalScroller = BruhsScroller() }
        if !(scrollView.horizontalScroller is BruhsScroller) { scrollView.horizontalScroller = BruhsScroller() }
        if inset > 0 { scrollView.scrollerInsets = NSEdgeInsets(top: inset, left: 0, bottom: inset, right: inset / 2) }
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let hoverArea { removeTrackingArea(hoverArea) }
        let area = NSTrackingArea(rect: .zero, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self)
        addTrackingArea(area)
        hoverArea = area
    }

    override func mouseEntered(with event: NSEvent) { super.mouseEntered(with: event); isHovering = true }
    override func mouseExited(with event: NSEvent) { super.mouseExited(with: event); isHovering = false }

    /// The track stays clear, as on the web.
    override func drawKnobSlot(in slotRect: NSRect, highlight flag: Bool) {}

    // AppKit draws with the view's appearance current, so the dynamic roles resolve for light, dark and Increase Contrast here.
    override func drawKnob() {
        let knob = rect(for: .knob)
        guard knob.width > 0, knob.height > 0 else { return }
        let vertical = bounds.height >= bounds.width
        let thickness = min(Self.thickness, vertical ? knob.width : knob.height)
        let thumb = vertical
            ? NSRect(x: knob.midX - thickness / 2, y: knob.minY + 2, width: thickness, height: max(thickness, knob.height - 4))
            : NSRect(x: knob.minX + 2, y: knob.midY - thickness / 2, width: max(thickness, knob.width - 4), height: thickness)
        (isHovering || hitPart == .knob ? BruhsNSColor.scrollbarHover : BruhsNSColor.scrollbar).setFill()
        NSBezierPath(roundedRect: thumb, xRadius: thickness / 2, yRadius: thickness / 2).fill()
    }
}

extension View {
    /// Gives a SwiftUI ScrollView bruhs scroll bars. Apply it to the scroll view's content: SwiftUI has no API for a
    /// scroll bar's look, so a probe inside the content finds the AppKit scroll view that hosts it. Pass the
    /// container's corner clearance as `inset` when the scroll view fills a rounded card or popover.
    func bruhsScrollers(inset: CGFloat = 0) -> some View { background(BruhsScrollerProbe(inset: inset)) }
}

private struct BruhsScrollerProbe: NSViewRepresentable {
    let inset: CGFloat

    final class Probe: NSView {
        var inset: CGFloat = 0

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            if let scrollView = enclosingScrollView { BruhsScroller.install(in: scrollView, inset: inset) }
        }
    }

    func makeNSView(context: Context) -> Probe {
        let probe = Probe()
        probe.inset = inset
        return probe
    }

    func updateNSView(_ view: Probe, context: Context) {}
}

/// Used-versus-total capacity, e.g. the startup disk.
struct CapacityBar: View {
    let used: Double
    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(BruhsColor.hairline)
                Capsule().fill(BruhsColor.textTertiary).frame(width: proxy.size.width * min(1, max(0, used)))
            }
        }
        .frame(height: 6)
        .accessibilityHidden(true)
    }
}
