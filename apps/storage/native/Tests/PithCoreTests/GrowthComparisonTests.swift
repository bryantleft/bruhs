import XCTest
@testable import PithCore

final class GrowthComparisonTests: XCTestCase {
    func testOutermostKeepsFolderGrowthWithoutCountingItsChildrenAgain() {
        let paths = ["/r", "/r/cache", "/r/cache/build", "/r/download", "/r-other/file"]
        let items = paths.map { GrowthItem(path: $0, before: 1, current: 2, change: 1, isFolder: true, isRemoved: false) }
        XCTAssertEqual(GrowthComparison.outermost(items, inside: "/r").map(\.path), ["/r/cache", "/r/download"])
        XCTAssertEqual(GrowthComparison.outermost(items, inside: "/r/cache").map(\.path), ["/r/cache/build"])
    }

    func testRowsKeepMeasuredBeforeAndAfterInsteadOfAddingNestedChanges() {
        let before = ScanMemory(root: "/r", date: Date(), sizes: ["/r": 10_000_000, "/r/file": 10_000_000])
        let node = DiskNode(kind: .file, name: "file", path: "/r/file", size: 30_000_000, children: nil)
        let summary = DiskSummary(dirs: 1, files: 1, bytes: node.size, errors: 0, unreadable: .init(protected: 0, denied: 0, other: 0),
                                  entryErrors: 0, cloudOnly: .init(files: 0, bytes: 0, folders: 0), elapsedMs: 1, engine: "bulk")
        let result = DiskResult(root: DiskNode(kind: .dir, name: "r", path: "/r", size: node.size, children: [node]), topFiles: [], summary: summary)
        let rows = GrowthComparison.items(baseline: before, current: result, changes: before.changes(to: result))
        let file = rows.first { $0.path == node.path }
        XCTAssertEqual(file?.before, 10_000_000)
        XCTAssertEqual(file?.current, 30_000_000)
        XCTAssertEqual(file?.change, 20_000_000)
        XCTAssertFalse(file?.isRemoved ?? true)
        XCTAssertEqual(GrowthComparison.outermost(rows, inside: "/r").count, 1)
        XCTAssertTrue(GrowthComparison.items(baseline: ScanMemory(root: "/r", date: Date(), sizes: [:], version: 3), current: result, changes: [:]).isEmpty)
    }
}
