import AppKit
import PithCore
import SwiftUI

/// The Activity tab: the CPU chart as the time control, a scope bar while a range is ranked,
/// the table, and the inspector. Its title, subtitle, search and toolbar items reach the
/// window's toolbar through scene bridging.
struct ActivityView: View {
    let model: ActivityModel
    @Bindable var state: ActivityState
    /// The inspector's width, a setting kept as it changes (`Setting.inspectorWidth`).
    @State private var inspectorWidth = UserDefaults.standard.object(forKey: Setting.inspectorWidth.rawValue) as? Double ?? 300
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let range = rankedRange
        let listing = state.longRange.map {
            ActivityListing(longHistory: model.longHistory, range: $0, span: state.span, latest: model.snapshot, search: state.search, sort: state.sort)
        } ?? ActivityListing(history: model.history, latest: model.snapshot, range: range, search: state.search, includeExited: state.includeExited, sort: state.sort)
        let inspecting = inspects(listing)
        HStack(spacing: 12) {
            content(listing, range: range)
            // The inspector shows only while a row is selected: a card inset from the window's edges and the toolbar.
            if inspecting { inspector(listing, range: range) }
        }
        // The inspector reflows the chart and table. Keep that geometry change immediate so their measurements
        // cannot keep invalidating one another during an animated resize.
        .animation(nil, value: inspecting)
        .modifier(QuitConfirmation(state: state, run: run))
        .navigationSubtitle(subtitle)
        // Short enough for the field at the window's narrowest; the full prompt was cut off even at the default width.
        .searchable(text: $state.search, placement: .toolbar, prompt: "Search, or cpu>10 mem>1gb")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Toggle("Include Exited Apps", isOn: $state.includeExited)
                } label: {
                    Label("Filter", systemImage: state.includeExited ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                }
                .help(state.includeExited ? "Including apps that quit in the last 10 minutes" : "Filter the list")
            }
        }
        // Escape from the table or chart arrives as the exit command: it leaves a ranked range first, then closes the
        // inspector. The scope bar's button covers Escape when nothing has focus.
        .onExitCommand {
            if state.range != nil || state.longRange != nil {
                state.backToLive()
            } else {
                // A key closes the inspector at once: an action taken from the keyboard shouldn't wait on an animation.
                withTransaction(\.disablesAnimations, true) { state.selection = nil }
            }
        }
        .onAppear(perform: applyFocus)
        .onChange(of: model.focusAppID) { applyFocus() }
        .onChange(of: inspectorWidth) { _, width in UserDefaults.standard.set(width, for: .inspectorWidth) }
        .onChange(of: model.snapshot?.uptime) {
            // A ranked range that has aged out of the ten-minute history has nothing left to rank.
            if state.range != nil && rankedRange == nil { state.backToLive() }
        }
    }

    /// The selected row's details, in a card beside the table.
    private func inspector(_ listing: ActivityListing, range: ClosedRange<Double>?) -> some View {
        BruhsSidePanel(width: $inspectorWidth, widths: 260...420, close: { state.selection = nil }) {
            ActivityInspector(model: model, listing: listing, selection: state.selection, range: range,
                              quit: { state.quitRequest = $0 })
        }
        .padding([.top, .trailing, .bottom], 12)
    }

    /// The chart, the scope bar while a range is ranked, and the table.
    private func content(_ listing: ActivityListing, range: ClosedRange<Double>?) -> some View {
        VStack(spacing: 0) {
            Group {
                if state.span == .tenMinutes || !model.keepsHistory {
                    ActivityChart(model: model, state: state, range: range)
                } else {
                    ActivityHistoryChart(model: model, state: state)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            if range != nil || state.longRange != nil {
                ActivityScopeBar(model: model, state: state, range: range)
                    .padding(.horizontal, 16)
                    .padding(.top, 10)
            }
            if let error = model.snapshot?.error {
                Label {
                    Text(error).foregroundStyle(BruhsColor.textSecondary)
                } icon: {
                    Image(systemName: "exclamationmark.triangle").foregroundStyle(BruhsColor.statusWarning)
                }
                .font(BruhsType.body)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
            if let outcome = state.quitOutcome {
                QuitOutcomeBar(outcome: outcome, forceQuit: { forceQuit(outcome.appID) }, dismiss: { state.quitOutcome = nil })
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
            }
            ActivityTable(listing: listing, opensSystem: !query.isEmpty, ranged: range != nil || state.longRange != nil, textScale: TextSize.shared.scale,
                          animates: !reduceMotion && query.isEmpty && range == nil && state.longRange == nil,
                          selection: $state.selection, expanded: $state.expanded, sort: $state.sort,
                          quit: { app in state.quitRequest = QuitRequest(appID: app.id, name: app.identity.displayName, kind: app.identity.kind, members: app.members) })
                .overlay { emptyState(listing, range: range) }
                .padding(.top, 10)
        }
    }

    private var query: String { state.search.trimmingCharacters(in: .whitespacesAndNewlines) }

    /// Whether the selected row has details to show: System, or an app still in the session's history.
    private func inspects(_ listing: ActivityListing) -> Bool {
        switch state.selection {
        case .system: listing.system != nil
        case .app(let id), .helper(app: let id, name: _): model.history.apps[id] != nil
        case .appsHeader, nil: false
        }
    }

    /// The ranked range, clipped to the history that still exists; nil while live or once it has expired.
    private var rankedRange: ClosedRange<Double>? {
        guard let range = state.range else { return nil }
        let oldest = model.history.system.first?.uptime ?? range.lowerBound
        guard range.upperBound >= oldest else { return nil }
        return max(range.lowerBound, oldest)...range.upperBound
    }

    /// Said only while sampling is paused: otherwise Activity is always live, ranked range or not, and the chart's
    /// axis says when a young session's readings began.
    private var subtitle: String {
        model.paused ? "Sampling paused" : ""
    }

    @ViewBuilder private func emptyState(_ listing: ActivityListing, range: ClosedRange<Double>?) -> some View {
        if listing.apps.isEmpty && listing.system == nil {
            VStack(spacing: 8) {
                Text(model.snapshot == nil ? "Collecting activity…" : !query.isEmpty ? "No apps match your search" : range != nil || state.longRange != nil ? "No apps ran in this range" : "No activity")
                    .font(BruhsType.body)
                    .foregroundStyle(BruhsColor.textSecondary)
                if model.snapshot != nil, !query.isEmpty {
                    Text("Try another name or remove a filter.")
                        .font(BruhsType.note)
                        .foregroundStyle(BruhsColor.textTertiary)
                    Button("Clear Search") { state.search = "" }
                        .buttonStyle(.bruhsGhost)
                        .help("Show all apps and processes")
                }
            }
            .multilineTextAlignment(.center)
            .padding(.horizontal, 24)
        }
    }

    /// Runs a quit and, when it was a polite one, checks back in a few seconds: an app that's still running gets Force Quit.
    private func run(_ outcome: QuitOutcome, for request: QuitRequest) {
        state.quitOutcome = outcome
        guard !outcome.isProblem, !outcome.offersForceQuit else { return }
        Task {
            // Long enough for an app to finish quitting, short enough that the user is still looking.
            try? await Task.sleep(for: .seconds(4))
            guard state.quitOutcome == outcome, ProcessControl.isRunning(request.members) else { return }
            state.quitOutcome = QuitOutcome(appID: request.appID, message: "\(request.name) is still running.", offersForceQuit: true)
        }
    }

    private func forceQuit(_ appID: String) {
        guard let app = model.history.apps[appID]?.latest else { return }
        let request = QuitRequest(appID: appID, name: app.name, kind: app.identity.kind, members: app.members)
        state.quitOutcome = ProcessControl.forceQuit(request)
    }

    /// The panel asked to show one app: select it live and reveal it, which opens the inspector.
    private func applyFocus() {
        guard let id = model.focusAppID else { return }
        model.focusAppID = nil
        state.backToLive()
        state.search = ""
        if model.history.apps[id]?.latest.identity.kind == .system { state.expanded.insert(.system) }
        state.selection = .app(id)
    }
}

/// Quit or Force Quit, confirmed as Activity Monitor confirms them: one alert with both.
private struct QuitConfirmation: ViewModifier {
    @Bindable var state: ActivityState
    let run: (QuitOutcome, QuitRequest) -> Void

    func body(content: Content) -> some View {
        content.alert(state.quitRequest.map { "Quit \($0.name)?" } ?? "", isPresented: Binding(get: { state.quitRequest != nil }, set: { if !$0 { state.quitRequest = nil } }),
                      presenting: state.quitRequest) { request in
            Button("Quit") { run(ProcessControl.quit(request), request) }
            Button("Force Quit", role: .destructive) { run(ProcessControl.forceQuit(request), request) }
            Button("Cancel", role: .cancel) {}
        } message: { request in
            Text(request.kind == .app
                 ? "Quit asks \(request.name) to quit, as its own Quit command does, so it can ask you to save. Force Quit ends it at once, and unsaved changes are lost."
                 : "Quit asks \(request.name) to stop, so it can clean up first. Force Quit ends it at once.")
        }
    }
}

/// How the last quit went, with Force Quit when an app asked to quit is still running.
struct QuitOutcomeBar: View {
    let outcome: QuitOutcome
    let forceQuit: () -> Void
    let dismiss: () -> Void

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: outcome.isProblem ? "exclamationmark.triangle.fill" : "checkmark.circle")
                .foregroundStyle(outcome.isProblem ? BruhsColor.statusWarning : BruhsColor.textSecondary)
                .accessibilityHidden(true)
            Text(outcome.message).font(BruhsType.body).foregroundStyle(BruhsColor.text).lineLimit(2)
            Spacer(minLength: 8)
            if outcome.offersForceQuit {
                Button("Force Quit", action: forceQuit).buttonStyle(.bruhsSoftDanger).help("End it at once. Unsaved changes are lost.")
            }
            Button(action: dismiss) { Image(systemName: "xmark") }
                .buttonStyle(.bruhsGhost)
                .help("Dismiss")
                .accessibilityLabel("Dismiss")
        }
        .accessibilityElement(children: .contain)
    }
}

/// Says what the table is ranking while a range is selected, with the way back to live. The range's CPU average and
/// peak are in the chart's header, over the shaded range.
struct ActivityScopeBar: View {
    let model: ActivityModel
    let state: ActivityState
    /// The live window's ranked range; nil while a stretch of kept history is ranked instead.
    let range: ClosedRange<Double>?

    var body: some View {
        HStack(spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(times).font(.monaspace(size: 12.5, weight: .semibold)).foregroundStyle(BruhsColor.text)
            }
            .lineLimit(1)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(spoken)
            Spacer(minLength: 8)
            Button("Back to Live") { state.backToLive() }
                .buttonStyle(.bruhsGhost)
                .keyboardShortcut(.cancelAction)
                .help("Return to live activity (Escape)")
        }
        .padding(.leading, 10)
        .padding(.trailing, 4)
        .padding(.vertical, 4)
        .background(BruhsColor.accentSoft, in: RoundedRectangle(cornerRadius: BruhsRadius.grape, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: BruhsRadius.grape, style: .continuous).strokeBorder(BruhsColor.selection, lineWidth: 1))
    }

    private var times: String {
        if let long = state.longRange {
            let style = Date.FormatStyle(date: Calendar.current.isDate(long.lowerBound, inSameDayAs: long.upperBound) ? .omitted : .abbreviated, time: .shortened)
            return "\(monaspaced(long.lowerBound.formatted(style))) to \(monaspaced(long.upperBound.formatted(style)))"
        }
        guard let range, let from = model.history.date(at: range.lowerBound), let to = model.history.date(at: range.upperBound) else { return "" }
        return "\(clockWithSeconds(from)) to \(clockWithSeconds(to))"
    }

    private var ranking: String {
        let measure = switch state.sort.column {
        case .name: "name"
        case .cpu: "average CPU"
        case .memory: "average memory"
        case .power: "average power"
        case .read: "average disk read"
        case .written: "average disk write"
        case .network: "average network use"
        }
        let reversed = state.sort.column == .name ? !state.sort.ascending : state.sort.ascending
        return reversed ? "\(measure), reversed" : measure
    }

    private var spoken: String {
        let cpu = range.flatMap { model.history.systemCPU(in: $0) }.map { ". Mac CPU averaged \(Int($0.average.rounded())) percent, peaking at \(Int($0.peak.rounded())) percent" } ?? ""
        return "Showing \(times), ranked by \(ranking)\(cpu)."
    }
}
