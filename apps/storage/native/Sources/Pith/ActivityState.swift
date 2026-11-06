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

/// What the Activity tab shows. It lives with the window, so switching to Disk and back
/// keeps the search, selection, disclosure and ranked range.
@MainActor @Observable final class ActivityState {
    var search = ""
    var includeExited = false
    var selection: ActivityRowID?
    var expanded: Set<ActivityRowID> = []
    var sort = ActivitySort.cpuDescending
    var showsInspector = true
    /// The range the table is ranked by, in sample-clock seconds; nil while live.
    private(set) var range: ClosedRange<Double>?
    /// The sort to restore on Back to Live: ranking a range sorts by CPU, as the scope bar says.
    private var liveSort: ActivitySort?

    func rank(by range: ClosedRange<Double>) {
        if self.range == nil {
            liveSort = sort
            sort = .cpuDescending
        }
        self.range = range
    }

    func backToLive() {
        guard range != nil else { return }
        range = nil
        if let liveSort { sort = liveSort }
        liveSort = nil
    }
}
