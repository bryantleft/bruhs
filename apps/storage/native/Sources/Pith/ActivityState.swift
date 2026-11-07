import Foundation
import Observation
import PithCore

/// A row in the Activity table. Ids are stable across samples, so selection and disclosure
/// survive re-sorting.
enum ActivityRowID: Hashable {
    case appsHeader
    case app(String)
    case helper(app: String, name: String)
    case system

    /// The app a row belongs to, for the inspector.
    var appID: String? {
        switch self {
        case .app(let id), .helper(app: let id, name: _): id
        case .appsHeader, .system: nil
        }
    }
}

/// What the Activity chart plots.
enum ChartMetric: String, CaseIterable, Identifiable {
    case cpu, memory
    var id: Self { self }
    var title: String { self == .cpu ? "CPU" : "Memory" }
    /// The table column a dragged range ranks by.
    var column: ActivityColumn { self == .cpu ? .cpu : .memory }
}

/// What the Activity tab shows. It lives with the window, so switching to Disk and back
/// keeps the search, selection, disclosure and ranked range.
@MainActor @Observable final class ActivityState {
    var chartMetric = ChartMetric.cpu
    /// How far back the chart looks. Longer than ten minutes needs kept history.
    var span = HistorySpan.tenMinutes {
        didSet { if span != oldValue { backToLive(); longRange = nil } }
    }
    /// A range of kept history the table ranks by, while the chart shows hours or days.
    var longRange: ClosedRange<Date>?
    var search = "" {
        didSet { if search != oldValue { noteSearchEdit(from: oldValue) } }
    }
    /// Earlier and undone searches, for Edit > Undo while the search field has focus. SwiftUI's search field keeps an
    /// undo manager of its own, but resets the field from `search` after an undo, so Activity keeps the steps itself.
    private var searchUndo: [String] = []
    private var searchRedo: [String] = []
    private var searchEditedAt = Date.distantPast
    private var applyingSearchStep = false
    var includeExited = false
    var selection: ActivityRowID?
    var expanded: Set<ActivityRowID> = []
    var sort = ActivitySort.cpuDescending
    /// The range the table is ranked by, in sample-clock seconds; nil while live.
    private(set) var range: ClosedRange<Double>?
    /// The sort to restore on Back to Live: ranking a range sorts by CPU, as the scope bar says.
    private var liveSort: ActivitySort?
    /// A quit waiting for the user to confirm, from the inspector or a row's menu.
    var quitRequest: QuitRequest?
    /// How the last quit went, until it's dismissed or another starts.
    var quitOutcome: QuitOutcome?

    var canUndoSearch: Bool { !searchUndo.isEmpty }
    var canRedoSearch: Bool { !searchRedo.isEmpty }

    func undoSearch() {
        guard let previous = searchUndo.popLast() else { return }
        searchRedo.append(search)
        applyingSearchStep = true; search = previous; applyingSearchStep = false
    }

    func redoSearch() {
        guard let next = searchRedo.popLast() else { return }
        searchUndo.append(search)
        applyingSearchStep = true; search = next; applyingSearchStep = false
    }

    /// Typing joins one step until a one-second pause; a cut, paste or clear changes more than a character at once and
    /// is a step of its own, as in a text field.
    private func noteSearchEdit(from old: String) {
        guard !applyingSearchStep else { return }
        let now = Date()
        if abs(search.count - old.count) > 1 || now.timeIntervalSince(searchEditedAt) > 1 {
            searchUndo.append(old)
            searchRedo.removeAll()
        }
        searchEditedAt = now
    }

    /// Ranks the table by `range`, by the metric the chart shows.
    func rank(by range: ClosedRange<Double>) {
        if self.range == nil {
            liveSort = sort
            sort = ActivitySort(column: chartMetric.column, ascending: false)
        }
        self.range = range
    }

    func backToLive() {
        longRange = nil
        guard range != nil else { return }
        range = nil
        if let liveSort { sort = liveSort }
        liveSort = nil
    }

    /// Ranks the table by a stretch of kept history.
    func rank(from: Date, to: Date) {
        longRange = min(from, to)...max(from, to)
        sort = ActivitySort(column: chartMetric.column, ascending: false)
    }
}
