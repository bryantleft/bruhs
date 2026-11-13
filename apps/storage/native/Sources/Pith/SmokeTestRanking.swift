import AppKit
import PithCore
import SwiftUI

extension AppDelegate {
    /// Deterministic samples exercise rank changes without depending on what other apps happen to be doing.
    func checkRankedLists() async -> [String: Bool] {
        var checks: [String: Bool] = [:]
        let state = RankingState()
        func table(_ snapshot: ActivitySnapshot, moves: Bool = true) -> ActivityTable {
            var history = SessionHistory()
            history.append(snapshot)
            let listing = ActivityListing(history: history, latest: snapshot, range: nil, search: "", includeExited: false, sort: state.sort)
            return ActivityTable(listing: listing, opensSystem: false, animates: moves,
                                 selection: Binding(get: { state.selection }, set: { state.selection = $0 }),
                                 expanded: Binding(get: { state.expanded }, set: { state.expanded = $0 }),
                                 sort: Binding(get: { state.sort }, set: { state.sort = $0 }))
        }
        let host = NSHostingView(rootView: table(Self.rankingSample()))
        let window = NSWindow(contentRect: NSRect(x: -8000, y: -8000, width: 1000, height: 360), styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = host
        window.orderFrontRegardless()
        defer { window.orderOut(nil); window.contentView = nil }
        guard await eventually({ self.firstView(NSOutlineView.self, in: host)?.numberOfRows == 8 }),
              let outline = firstView(NSOutlineView.self, in: host) else { return ["activity_rank_moves_keep_selection_and_disclosure": false] }
        func ids() -> [ActivityRowID] { (0..<outline.numberOfRows).compactMap { (outline.item(atRow: $0) as? ActivityNode)?.id } }
        func row(_ id: ActivityRowID) -> Int { ids().firstIndex(of: id) ?? -1 }
        func selected() -> ActivityRowID? { (outline.item(atRow: outline.selectedRow) as? ActivityNode)?.id }
        let alpha = outline.item(atRow: row(.app("alpha"))) as? ActivityNode
        let alphaView = outline.rowView(atRow: row(.app("alpha")), makeIfNecessary: true)
        let selectedHelper = state.selection
        host.rootView = table(Self.rankingSample(reversed: true))
        let reordered = await eventually {
            ids() == [.appsHeader, .app("beta"), .app("alpha"), .helper(app: "alpha", name: "Alpha Worker"),
                      .helper(app: "alpha", name: "Alpha"), .system, .app("systemB"), .app("systemA")]
        }
        checks["activity_rank_moves_keep_selection_and_disclosure"] = reordered && selected() == selectedHelper
            && state.selection == selectedHelper && outline.isItemExpanded(alpha)
            && outline.rowView(atRow: row(.app("alpha")), makeIfNecessary: true) === alphaView
        let cpu = outline.tableColumns.firstIndex { $0.identifier.rawValue == ActivityColumn.cpu.rawValue } ?? 1
        host.rootView = table(Self.rankingSample(reversed: true, alphaCPU: 22))
        checks["activity_stationary_rows_refresh_figures"] = await eventually {
            (outline.view(atColumn: cpu, row: row(.app("alpha")), makeIfNecessary: true) as? ActivityNumberCell)?.textField?.stringValue == percent(22)
        }
        // Helpers disappear, a new app arrives, and System is removed in the same refresh.
        state.selection = .app("alpha")
        host.rootView = table(Self.rankingSample(reversed: true, helpers: false, system: false, extra: 1))
        checks["activity_rank_membership_updates"] = await eventually {
            ids() == [.appsHeader, .app("beta"), .app("alpha"), .app("extra0")]
                && selected() == .app("alpha") && !outline.isExpandable(alpha)
        }
        host.rootView = table(Self.rankingSample(helpers: true, system: true, extra: 45))
        let restored = await eventually { outline.numberOfRows == 53 && outline.isItemExpanded(alpha) }
        try? await Task.sleep(for: .seconds(BruhsMotion.standard))
        outline.scrollRowToVisible(outline.numberOfRows - 1)
        let scrollY = outline.enclosingScrollView?.contentView.bounds.origin.y
        host.rootView = table(Self.rankingSample(reversed: true, extra: 45), moves: false)
        let reduced = await eventually { row(.app("beta")) == 1 }
        checks["activity_ranking_keeps_scroll_position"] = restored && reduced
            && outline.enclosingScrollView?.contentView.bounds.origin.y == scrollY && selected() == .app("alpha")

        // Panel rows use the actual buttons and figures, hosted independently as in the menu panel.
        let panel = PanelRankingView(frame: NSRect(x: 0, y: 0, width: 360, height: 168))
        let panelWindow = NSWindow(contentRect: panel.frame.offsetBy(dx: -8000, dy: -8000), styleMask: [.borderless], backing: .buffered, defer: false)
        panelWindow.isReleasedWhenClosed = false
        panelWindow.contentView = panel
        panelWindow.orderFrontRegardless()
        defer { panelWindow.orderOut(nil); panelWindow.contentView = nil }
        func panelRows(_ reversed: Bool, extra: Int = 0) -> [PanelRankingView.Row] {
            let apps = PanelSummary.apps(Self.rankingSample(reversed: reversed, system: false, extra: extra).apps, ownPID: -1, limit: 4).top
            return apps.map { app in
                .init(id: .app(app.id), content: AnyView(PanelAppRow(app: app, details: []) {}))
            }
        }
        panel.show(panelRows(false), reduceMotion: false)
        try? await Task.sleep(for: .seconds(BruhsMotion.standard))
        let first = panel.subviews.first
        panel.show(panelRows(true), reduceMotion: false)
        let slide = first?.layer?.animation(forKey: "rank") as? CABasicAnimation
        checks["panel_ranks_slide_on_layers"] = panel.subviews.last === first && first?.frame.minY == PanelAppsSection.rowHeight
            && slide?.keyPath == "position.y" && slide?.duration == BruhsMotion.standard
        let accessible = panel.accessibilityChildren()?.compactMap { $0 as? NSView } ?? []
        checks["panel_accessibility_follows_rank_order"] = panel.subviews.map(\.frame.minY) == [0, PanelAppsSection.rowHeight]
            && accessible.count == 2 && zip(accessible, panel.subviews).allSatisfy { $0 === $1 }
        // An update during a slide must start from its presentation position instead of jumping back to the old rank.
        try? await Task.sleep(for: .seconds(BruhsMotion.standard / 3))
        let inFlight = first?.layer?.presentation()?.position.y
        panel.show(panelRows(false), reduceMotion: false)
        let retarget = (first?.layer?.animation(forKey: "rank") as? CABasicAnimation)?.fromValue as? Double
        checks["panel_ranks_retarget_in_flight"] = inFlight != nil && retarget != nil && abs((inFlight ?? 0) - (retarget ?? 0)) < 2
        panel.settleRanks()
        checks["panel_hover_settles_click_targets"] = panel.subviews.allSatisfy { $0.layer?.animation(forKey: "rank") == nil }
        panel.show(panelRows(true), reduceMotion: false)
        panel.show(panelRows(true), reduceMotion: true)
        checks["panel_rank_reduce_motion_is_immediate"] = first?.layer?.animation(forKey: "rank") == nil
            && first?.frame.minY == PanelAppsSection.rowHeight
        panel.show(panelRows(true, extra: 1), reduceMotion: false)
        checks["panel_new_rank_fades_in"] = panel.subviews.last?.layer?.animation(forKey: "membership") != nil
        panel.show(panelRows(false), reduceMotion: false)
        try? await Task.sleep(for: .seconds(BruhsMotion.standard))
        checks["panel_departed_rows_are_removed"] = panel.subviews.count == 2
        print("ranked lists: \(checks.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: ", "))")
        return checks
    }

    private static func rankingSample(reversed: Bool = false, alphaCPU: Double = 20, helpers: Bool = true, system: Bool = true, extra: Int = 0) -> ActivitySnapshot {
        func app(_ id: String, _ name: String, _ cpu: Double, _ pid: Int32, system: Bool = false, helpers: Bool = false) -> AppSample {
            AppSample(id: id, identity: ProcessIdentity(path: system ? "/usr/libexec/\(id)" : "/Applications/\(name).app", processName: name, bundleName: system ? nil : name),
                      executable: "", members: [ProcessKey(pid: pid, started: 1)] + (helpers ? [ProcessKey(pid: pid + 1, started: 1)] : []),
                      cpu: cpu, memory: 100_000_000, read: 0, written: 0, restricted: false, openedBy: nil)
        }
        var apps = [app("alpha", "Alpha", reversed ? alphaCPU : 40, 10, helpers: helpers), app("beta", "Beta", reversed ? 60 : 10, 20)]
        if system { apps += [app("systemA", "System A", reversed ? 1 : 4, 30, system: true), app("systemB", "System B", reversed ? 4 : 1, 40, system: true)] }
        apps += (0..<extra).map { app("extra\($0)", "Extra \($0)", 0, Int32(100 + $0)) }
        let processes: [ProcessSample] = helpers ? [
            ProcessSample(key: ProcessKey(pid: 10, started: 1), name: "Alpha", path: "", parent: 1, cpu: reversed ? 1 : 9, memory: 50_000_000, read: 0, written: 0),
            ProcessSample(key: ProcessKey(pid: 11, started: 1), name: "Alpha Worker", path: "", parent: 10, cpu: reversed ? 9 : 1, memory: 50_000_000, read: 0, written: 0),
        ] : []
        return ActivitySnapshot(date: Date(), uptime: reversed ? 2 : 1, cpu: 50, pressure: .normal, apps: apps, error: nil, processes: processes)
    }
}

@MainActor private final class RankingState {
    var selection: ActivityRowID? = .helper(app: "alpha", name: "Alpha Worker")
    var expanded: Set<ActivityRowID> = [.app("alpha"), .system]
    var sort = ActivitySort.cpuDescending
}
