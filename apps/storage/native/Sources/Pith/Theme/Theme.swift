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

/// Type roles for Pith's content. Numbers and data are Monaspace with tabular digits; names,
/// labels and controls use the system font so they sit naturally next to macOS chrome.
@MainActor enum BruhsType {
    /// The headline value in the panel, e.g. "17%".
    static var readout: Font { .monaspace(size: 30, weight: .medium) }
    static var data: Font { .monaspace(size: 12.5) }
    static var dataSmall: Font { .monaspace(size: 11) }
    static var caption: Font { .monaspace(size: 11) }
    /// The name heading a panel, e.g. the inspector's app.
    static var title: Font { .system(size: 15, weight: .semibold) }
    static var label: Font { .system(size: 13, weight: .semibold) }
    static var body: Font { .system(size: 13) }
    /// Names and labels in dense rows, e.g. the inspector's process list.
    static var bodySmall: Font { .system(size: 12) }
    /// A short hint or description under or beside the content.
    static var note: Font { .system(size: 11) }
    static var sectionTitle: Font { .system(size: 11, weight: .semibold) }
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

/// Memory pressure as symbol, colour and word together, so it reads without colour.
struct StatusChip: View {
    let pressure: MemoryPressure
    var body: some View {
        Label {
            Text(pressure.label).foregroundStyle(BruhsColor.text)
        } icon: {
            Image(systemName: pressure.symbol).foregroundStyle(pressure.tint)
        }
        .font(.system(size: 12, weight: .medium))
        .help("Memory pressure: how easily macOS can meet memory demand. Cached files in RAM are useful, not a problem.")
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Memory pressure \(pressure.label)")
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

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(label).font(BruhsType.note).foregroundStyle(BruhsColor.textTertiary)
            Text(verbatim: value).font(BruhsType.caption).foregroundStyle(BruhsColor.textSecondary)
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
struct BruhsButtonStyle: ButtonStyle {
    enum Tone { case soft, ghost, softDanger }
    var tone: Tone = .soft
    @Environment(\.isEnabled) private var isEnabled
    @State private var hovering = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 12, weight: .medium))
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
                    .onHover { inside in if inside { NSCursor.resizeLeftRight.push() } else { NSCursor.pop() } }
                    .gesture(DragGesture(minimumDistance: 1, coordinateSpace: .global)
                        .onChanged { drag in
                            let start = dragStart ?? width
                            dragStart = start
                            width = min(widths.upperBound, max(widths.lowerBound, start - drag.translation.width))
                        }
                        .onEnded { _ in dragStart = nil })
                    .accessibilityHidden(true)
            }
    }
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
