import AppKit
import PithCore
import SwiftUI

/// Each SwiftUI row keeps its host while Core Animation moves it. A SwiftUI layout animation would lay out the
/// entire panel on every frame, including its charts and live readouts (see FlowText).
struct PanelAppList: NSViewRepresentable {
    let apps: PanelSummary.Apps
    let growth: [String: Int64]
    let open: (String?) -> Void

    func makeNSView(context: Context) -> PanelRankingView { PanelRankingView() }

    func updateNSView(_ view: PanelRankingView, context: Context) {
        var rows = apps.top.map { app in
            PanelRankingView.Row(id: .app(app.id), content: AnyView(
                PanelAppRow(app: app, details: PanelSummary.details(app, among: apps.top), ranking: apps.ranking,
                            growth: apps.ranking == .memory ? growth[app.id] : nil) { open(app.id) }
            ))
        }
        if apps.otherCount > 0 {
            rows.append(.init(id: .other, content: AnyView(
                PanelSummaryRow(title: "Other \(apps.otherCount) \(apps.otherCount == 1 ? "app" : "apps")", ranking: apps.ranking,
                                cpu: apps.otherCPU, memory: apps.otherMemory, help: "The other apps and tools Pith can measure, together.")
            )))
        }
        if apps.systemCount > 0 {
            rows.append(.init(id: .system, content: AnyView(
                PanelSummaryRow(title: "System", detail: processCount(apps.systemCount), ranking: apps.ranking,
                                cpu: apps.systemCPU, memory: apps.systemMemory,
                                help: "macOS's own processes, together. Activity lists them under System.")
            )))
        }
        view.show(rows, reduceMotion: context.environment.accessibilityReduceMotion, enabled: context.environment.isEnabled)
    }
}

final class PanelRankingView: NSView {
    enum ID: Hashable { case app(String), other, system }
    struct Row { let id: ID; let content: AnyView }
    private var hosts: [ID: HostedRow] = [:]
    private var order: [ID] = []

    override var isFlipped: Bool { true }
    override var intrinsicContentSize: NSSize {
        NSSize(width: NSView.noIntrinsicMetric, height: PanelAppsSection.rowHeight * CGFloat(PanelAppsSection.rows + 2))
    }

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        addTrackingArea(NSTrackingArea(rect: .zero, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self, userInfo: nil))
    }

    required init?(coder: NSCoder) { fatalError("PanelRankingView is created in code") }

    override func mouseEntered(with event: NSEvent) {
        // A pointer arriving mid-slide must see buttons at their hit targets before it can click. The section's
        // hover hold then keeps that order until the pointer leaves.
        settleRanks()
    }

    func settleRanks() {
        for host in hosts.values { host.layer?.removeAnimation(forKey: "rank") }
    }

    func show(_ rows: [Row], reduceMotion: Bool, enabled: Bool = true) {
        let moves = !reduceMotion && !order.isEmpty && window?.isVisible == true
        let wanted = Set(rows.map(\.id))
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        if reduceMotion {
            for case let host as HostedRow in subviews where host.departing { host.removeFromSuperview() }
        }
        for id in order where !wanted.contains(id) {
            guard let host = hosts.removeValue(forKey: id) else { continue }
            host.departing = true
            host.rootView = AnyView(host.rootView.disabled(true))
            host.setAccessibilityHidden(true)
            if moves, let layer = host.layer {
                fade(layer, from: layer.presentation()?.opacity ?? 1, to: 0)
                Task { @MainActor in
                    try? await Task.sleep(for: .seconds(BruhsMotion.fast))
                    host.removeFromSuperview()
                }
            } else { host.removeFromSuperview() }
        }
        let reordered = order != rows.map(\.id)
        order = rows.map(\.id)
        for (index, row) in rows.enumerated() {
            let existing = hosts[row.id]
            let host = existing ?? HostedRow(rootView: AnyView(EmptyView()))
            let target = rowFrame(index)
            let moved = existing != nil && host.frame.origin.y != target.origin.y
            let from = host.layer?.presentation()?.position.y ?? host.layer?.position.y
            host.rootView = AnyView(row.content.padding(.horizontal, 6).tint(BruhsColor.accent).disabled(!enabled))
            if existing == nil {
                host.sizingOptions = []
                host.wantsLayer = true
                hosts[row.id] = host
                addSubview(host)
            }
            host.frame = target
            if !moves {
                host.layer?.removeAnimation(forKey: "rank")
                host.layer?.removeAnimation(forKey: "membership")
            } else if existing == nil, let layer = host.layer {
                fade(layer, from: 0, to: 1)
            } else if moved, let from, let layer = host.layer {
                let slide = CABasicAnimation(keyPath: "position.y")
                slide.fromValue = from
                slide.toValue = layer.position.y
                slide.duration = BruhsMotion.standard
                slide.timingFunction = BruhsMotion.standardTiming
                layer.add(slide, forKey: "rank")
            }
        }
        if reordered {
            // Native accessibility and Tab traversal follow subview order, not layer positions.
            subviews = subviews.filter { ($0 as? HostedRow)?.departing == true } + order.compactMap { hosts[$0] }
            window?.recalculateKeyViewLoop()
        }
        CATransaction.commit()
    }

    override func layout() {
        super.layout()
        for (index, id) in order.enumerated() { hosts[id]?.frame = rowFrame(index) }
    }

    private func rowFrame(_ index: Int) -> NSRect {
        NSRect(x: 0, y: CGFloat(index) * PanelAppsSection.rowHeight, width: bounds.width, height: PanelAppsSection.rowHeight)
    }

    private func fade(_ layer: CALayer, from: Float, to: Float) {
        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = from
        fade.toValue = to
        fade.duration = BruhsMotion.fast
        fade.timingFunction = BruhsMotion.exitTiming
        layer.opacity = to
        layer.add(fade, forKey: "membership")
    }

    private final class HostedRow: NSHostingView<AnyView> {
        var departing = false
        override func hitTest(_ point: NSPoint) -> NSView? { departing ? nil : super.hitTest(point) }
    }
}
