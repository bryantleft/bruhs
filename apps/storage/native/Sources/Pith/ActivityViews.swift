import AppKit
import PithCore
import SwiftUI

/// The Activity tab: the CPU chart as the time control, a scope bar while a range is ranked,
/// the table, and the inspector. Its title, subtitle, search and toolbar items reach the
/// window's toolbar through scene bridging.
struct ActivityView: View {
    let model: ActivityModel
    @Bindable var state: ActivityState
    @AppStorage("inspectorWidth") private var inspectorWidth = 300.0

    var body: some View {
        let range = rankedRange
        let listing = ActivityListing(history: model.history, latest: model.snapshot, range: range, search: state.search, includeExited: state.includeExited, sort: state.sort)
        HStack(spacing: 0) {
            content(listing, range: range)
            if state.showsInspector {
                BruhsSidePanel(width: $inspectorWidth, widths: 260...420) {
                    ActivityInspector(model: model, listing: listing, selection: state.selection, range: range)
                }
                .transition(.move(edge: .trailing))
            }
        }
        .animation(BruhsMotion.standard(duration: BruhsMotion.fast), value: state.showsInspector)
        .navigationSubtitle(subtitle(range))
        .searchable(text: $state.search, placement: .toolbar, prompt: "Search apps or PID")
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Menu {
                    Toggle("Include Exited Apps", isOn: $state.includeExited)
                } label: {
                    Label("Filter", systemImage: state.includeExited ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                }
                .help(state.includeExited ? "Including apps that quit in the last 10 minutes" : "Filter the list")
                Button {
                    state.showsInspector.toggle()
                } label: {
                    Label(state.showsInspector ? "Hide Inspector" : "Show Inspector", systemImage: "sidebar.trailing")
                }
                .help(state.showsInspector ? "Hide the inspector (⌥⌘I)" : "Show the inspector (⌥⌘I)")
            }
        }
        // Escape from the table or chart arrives as the exit command; the scope bar's button
        // covers Escape when nothing has focus.
        .onExitCommand { state.backToLive() }
        .onAppear(perform: applyFocus)
        .onChange(of: model.focusAppID) { applyFocus() }
        .onChange(of: model.snapshot?.uptime) {
            // A ranked range that has aged out of the ten-minute history has nothing left to rank.
            if state.range != nil && rankedRange == nil { state.backToLive() }
        }
    }

    /// The chart, the scope bar while a range is ranked, and the table.
    private func content(_ listing: ActivityListing, range: ClosedRange<Double>?) -> some View {
        VStack(spacing: 0) {
            ActivityChart(model: model, state: state, range: range)
                .padding(.horizontal, 16)
                .padding(.top, 12)
            if let range {
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
            ActivityTable(listing: listing, opensSystem: !query.isEmpty, selection: $state.selection, expanded: $state.expanded, sort: $state.sort)
                .overlay { emptyState(listing, range: range) }
                .padding(.top, 10)
        }
    }

    private var query: String { state.search.trimmingCharacters(in: .whitespacesAndNewlines) }

    /// The ranked range, clipped to the history that still exists; nil while live or once it has expired.
    private var rankedRange: ClosedRange<Double>? {
        guard let range = state.range else { return nil }
        let oldest = model.history.system.first?.uptime ?? range.lowerBound
        guard range.upperBound >= oldest else { return nil }
        return max(range.lowerBound, oldest)...range.upperBound
    }

    private func subtitle(_ range: ClosedRange<Double>?) -> String {
        if let range, let from = model.history.date(at: range.lowerBound), let to = model.history.date(at: range.upperBound) {
            return "From \(clockWithSeconds(from)) to \(clockWithSeconds(to))"
        }
        if model.paused { return "Sampling paused" }
        // The chart's axis shows the ten-minute window; a young session says when its readings began.
        return model.historyStart.map { "Live since \(PanelSummary.clock($0))" } ?? "Live"
    }

    @ViewBuilder private func emptyState(_ listing: ActivityListing, range: ClosedRange<Double>?) -> some View {
        if listing.apps.isEmpty && listing.system == nil {
            Text(model.snapshot == nil ? "Collecting activity…" : !query.isEmpty ? "No apps match “\(query)”" : range != nil ? "No apps ran in this range" : "No activity")
                .font(BruhsType.body)
                .foregroundStyle(BruhsColor.textTertiary)
        }
    }

    /// The panel asked to show one app: select it live, reveal it, and open the inspector.
    private func applyFocus() {
        guard let id = model.focusAppID else { return }
        model.focusAppID = nil
        state.backToLive()
        state.search = ""
        if model.history.apps[id]?.latest.identity.kind == .system { state.expanded.insert(.system) }
        state.selection = .app(id)
        state.showsInspector = true
    }
}

/// Says what the table is ranking while a range is selected, with the way back to live. The range's CPU average and
/// peak are in the chart's header, over the shaded range.
struct ActivityScopeBar: View {
    let model: ActivityModel
    let state: ActivityState
    let range: ClosedRange<Double>

    var body: some View {
        HStack(spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(times).font(.monaspace(size: 12.5, weight: .semibold)).foregroundStyle(BruhsColor.text)
                Text("Ranked by \(ranking)").font(BruhsType.body).foregroundStyle(BruhsColor.textSecondary)
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
        guard let from = model.history.date(at: range.lowerBound), let to = model.history.date(at: range.upperBound) else { return "" }
        return "\(clockWithSeconds(from)) to \(clockWithSeconds(to))"
    }

    private var ranking: String {
        let measure = switch state.sort.column {
        case .name: "name"
        case .cpu: "average CPU"
        case .memory: "average memory"
        case .read: "average disk read"
        case .written: "average disk write"
        }
        let reversed = state.sort.column == .name ? !state.sort.ascending : state.sort.ascending
        return reversed ? "\(measure), reversed" : measure
    }

    private var spoken: String {
        let cpu = model.history.systemCPU(in: range).map { ". Mac CPU averaged \(Int($0.average.rounded())) percent, peaking at \(Int($0.peak.rounded())) percent" } ?? ""
        return "Showing \(times), ranked by \(ranking)\(cpu)."
    }
}
