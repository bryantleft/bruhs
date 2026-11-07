import XCTest
@testable import PithCore

final class QueryTests: XCTestCase {
    func testFiltersAreReadFromTheSearch() {
        let query = ActivityQuery("chrome cpu>10 mem>1.5gb kind:app path:Applications")
        XCTAssertEqual(query.words, ["chrome"])
        XCTAssertEqual(query.cpuAbove, 10)
        XCTAssertEqual(query.memoryAbove, UInt64(1.5 * Double(1 << 30)))
        XCTAssertEqual(query.kind, .app)
        XCTAssertEqual(query.path, "Applications")
        XCTAssertEqual(ActivityQuery("mem>500").memoryAbove, 500 << 20, "no unit means megabytes")
        XCTAssertEqual(ActivityQuery("kind:tools").kind, .commandLineTool)
        XCTAssertEqual(ActivityQuery("kind:bogus").words, ["kind:bogus"], "an unknown kind is just a word")
    }

    func testFiltersKeepOnlyRowsAboveTheirThresholds() {
        let query = ActivityQuery("cpu>5 kind:tool")
        let busy = ActivityListing.Values(cpu: 12, memory: 1, read: nil, written: nil)
        XCTAssertTrue(query.passes(kind: .commandLineTool, executable: "/opt/homebrew/bin/node", values: busy))
        XCTAssertFalse(query.passes(kind: .app, executable: "/Applications/A.app", values: busy))
        XCTAssertFalse(query.passes(kind: .commandLineTool, executable: "/x", values: .init(cpu: 2, memory: 1, read: nil, written: nil)))
        XCTAssertFalse(query.passes(kind: .commandLineTool, executable: "/x", values: .init(cpu: nil, memory: 1, read: nil, written: nil)), "unread isn't above anything")
    }

    func testTheListingAppliesFilters() {
        var history = SessionHistory()
        let apps = [AppSample(id: "a", name: "A", executable: "/Applications/A.app", members: [ProcessKey(pid: 1, started: 1)], cpu: 30, memory: 1, read: 0, written: 0, restricted: false),
                    AppSample(id: "b", name: "B", executable: "/Applications/B.app", members: [ProcessKey(pid: 2, started: 1)], cpu: 1, memory: 1, read: 0, written: 0, restricted: false)]
        let snapshot = ActivitySnapshot(date: Date(), uptime: 0, cpu: 31, pressure: .normal, apps: apps, error: nil)
        history.append(snapshot)
        let listing = ActivityListing(history: history, latest: snapshot, range: nil, search: "cpu>10", includeExited: false, sort: .cpuDescending)
        XCTAssertEqual(listing.apps.map(\.id), ["a"])
        let csv = listing.csv()
        XCTAssertTrue(csv.hasPrefix("Name,Kind,PIDs,CPU %"))
        XCTAssertTrue(csv.contains("A,App,1,30.00,1,"))
    }
}
