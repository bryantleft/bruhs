import XCTest
@testable import PithCore

final class ScanMemoryTests: XCTestCase {
    private func result(_ children: [DiskNode]) -> DiskResult {
        let size = children.reduce(0) { $0 + $1.size }
        let files = children.reduce(UInt64(0)) { $0 + $1.fileCount }
        let summary = DiskSummary(dirs: 1, files: files, bytes: size, errors: 0, unreadable: .init(protected: 0, denied: 0, other: 0), entryErrors: 0,
                                  cloudOnly: .init(files: 0, bytes: 0, folders: 0), elapsedMs: 1, engine: "bulk")
        return DiskResult(root: DiskNode(kind: .dir, name: "r", path: "/r", size: size, files: files, children: children), topFiles: [], summary: summary)
    }

    func testItSaysWhatGrewShrankAndWasRemoved() {
        let mb: UInt64 = 1_000_000
        let before = ScanMemory(result([
            DiskNode(kind: .dir, name: "a", path: "/r/a", size: 10 * mb, files: 1, children: []),
            DiskNode(kind: .dir, name: "b", path: "/r/b", size: 50 * mb, files: 1, children: []),
            DiskNode(kind: .file, name: "gone.zip", path: "/r/gone.zip", size: 5 * mb, children: nil),
        ]), date: Date())
        let after = result([
            DiskNode(kind: .dir, name: "a", path: "/r/a", size: 30 * mb, files: 1, children: []),
            DiskNode(kind: .dir, name: "b", path: "/r/b", size: 20 * mb, files: 1, children: []),
            DiskNode(kind: .file, name: "new.iso", path: "/r/new.iso", size: 7 * mb, children: nil),
        ])
        let changes = before.changes(to: after)
        XCTAssertEqual(changes["/r/a"], 20_000_000)
        XCTAssertEqual(changes["/r/b"], -30_000_000)
        XCTAssertEqual(changes["/r/new.iso"], 7_000_000)
        XCTAssertEqual(changes["/r/gone.zip"], -5_000_000)
        XCTAssertEqual(changes["/r"], -8_000_000, "the scanned folder's own change: 65 MB before, 57 MB after")
    }

    func testSmallChangesAreLeftOut() {
        let before = ScanMemory(result([DiskNode(kind: .file, name: "x", path: "/r/x", size: 1000, children: nil)]), date: Date())
        let after = result([DiskNode(kind: .file, name: "x", path: "/r/x", size: 2000, children: nil)])
        XCTAssertTrue(before.changes(to: after).isEmpty, "a kilobyte isn't growth worth showing")
    }

    func testAnItemFoldedIntoSmallerItemsIsntReportedAsDeleted() {
        let baseline = ScanMemory(result([
            DiskNode(kind: .file, name: "kept.bin", path: "/r/kept.bin", size: 5_000_000, children: nil),
        ]), date: Date())
        let folded = result([
            DiskNode(kind: .aggregate, name: "Smaller items", path: "/r/__other__", size: 5_000_000, children: nil),
        ])
        XCTAssertNil(baseline.changes(to: folded)["/r/kept.bin"], "less map detail is not evidence of deletion")
    }

    func testLosingAccessDoesntReportTheFolderAsFreedSpace() {
        let baseline = ScanMemory(result([
            DiskNode(kind: .dir, name: "private", path: "/r/private", size: 8_000_000, files: 1, children: []),
        ]), date: Date())
        let unreadable = result([
            DiskNode(kind: .unreadable, name: "private", path: "/r/private", size: 0, reason: .protected, children: nil),
        ])
        XCTAssertNil(baseline.changes(to: unreadable)["/r/private"], "an unknown size is not zero")
        XCTAssertNil(baseline.changes(to: unreadable)["/r"], "the parent's total also lost coverage")
        XCTAssertNil(ScanMemory(unreadable, date: Date()).changes(to: result([
            DiskNode(kind: .dir, name: "private", path: "/r/private", size: 8_000_000, files: 1, children: []),
        ]))["/r"], "gaining access is not growth either")
    }

    func testAScanCountedTheOldWayIsntCompared() throws {
        let now = result([DiskNode(kind: .file, name: "x", path: "/r/x", size: 1000, children: nil)])
        XCTAssertTrue(ScanMemory(now, date: Date()).comparable(to: now))
        // Kept before version 4, when clones counted once per copy, so every folder of clones would look shrunk.
        let old = try JSONDecoder().decode(ScanMemory.self, from: Data(#"{"root":"/r","date":0,"sizes":{"/r/x":5000000}}"#.utf8))
        XCTAssertNil(old.version)
        XCTAssertFalse(old.comparable(to: now))
    }

    /// Review finding: the live map's baseline and its later maps differ in detail around the open folder, so items
    /// the baseline never held counted as new, and an unchanged disk showed growth.
    func testFinerDetailIsntGrowthWhenNewItemsDontCount() {
        let mb: UInt64 = 1_000_000
        let baseline = ScanMemory(result([DiskNode(kind: .dir, name: "lib", path: "/r/lib", size: 60 * mb, files: 2, children: [])]), date: Date())
        // The same disk, with the open folder in finer detail: its subfolders appear for the first time.
        let detailed = result([DiskNode(kind: .dir, name: "lib", path: "/r/lib", size: 60 * mb, files: 2, children: [
            DiskNode(kind: .dir, name: "Caches", path: "/r/lib/Caches", size: 30 * mb, files: 1, children: []),
            DiskNode(kind: .dir, name: "Mail", path: "/r/lib/Mail", size: 20 * mb, files: 1, children: []),
        ])])
        XCTAssertTrue(baseline.changes(to: detailed, countingNew: false).isEmpty)
        XCTAssertTrue(baseline.changes(to: detailed).isEmpty, "one-off scans must not mistake newly exposed detail for new files")
        // What the baseline does hold still shows its growth.
        let grown = result([DiskNode(kind: .dir, name: "lib", path: "/r/lib", size: 90 * mb, files: 2, children: [])])
        XCTAssertEqual(baseline.changes(to: grown, countingNew: false)["/r/lib"], 30_000_000)
    }

    /// Disk compares the live map with a baseline under a day old, and a scan with the last scan of its folder. One kept
    /// before the clock went back is dated after now: it's no baseline, since what grew since a time still to come is
    /// nothing, and the range from it to now would end before it began.
    func testABaselineDatedAfterNowIsDropped() {
        let now = Date(timeIntervalSince1970: 1_800_000_000), map = result([])
        let day: TimeInterval = 24 * 60 * 60
        func kept(_ seconds: TimeInterval) -> ScanMemory { ScanMemory(map, date: now.addingTimeInterval(seconds)) }
        XCTAssertTrue(kept(-60).isBaseline(of: map, at: now, within: day))
        XCTAssertTrue(kept(0).isBaseline(of: map, at: now, within: day), "taken as the map was")
        XCTAssertFalse(kept(-day).isBaseline(of: map, at: now, within: day), "a day old")
        XCTAssertFalse(kept(60).isBaseline(of: map, at: now, within: day), "dated after now")
        XCTAssertFalse(kept(3 * day).isBaseline(of: map, at: now, within: day))
        // A scan's last scan can be any age, but never from after it.
        XCTAssertTrue(kept(-30 * day).isBaseline(of: map, at: now))
        XCTAssertFalse(kept(60).isBaseline(of: map, at: now))
        // Counted another way, it's no baseline at any date.
        let older = ScanMemory(root: "/r", date: now.addingTimeInterval(-60), sizes: [:], version: 3)
        XCTAssertFalse(older.isBaseline(of: map, at: now, within: day))
    }

    func testEachFolderHasItsOwnFile() {
        let folder = URL(fileURLWithPath: "/tmp")
        XCTAssertNotEqual(ScanMemory.file(for: "/Users/me", in: folder), ScanMemory.file(for: "/", in: folder))
        XCTAssertEqual(ScanMemory.file(for: "/", in: folder), ScanMemory.file(for: "/", in: folder))
    }

    func testUnreadableFoldersOmittedFromTheMapStillInvalidateAncestorTotals() {
        let before = ScanMemory(result([DiskNode(kind: .file, name: "data", path: "/r/data", size: 8_000_000, children: nil)]), date: Date())
        let empty = result([])
        let after = DiskResult(root: empty.root, topFiles: [],
                               unreadableFolders: [DiskUnreadableFolder(path: "/r/hidden/private", reason: .protected)], summary: empty.summary)
        XCTAssertNil(before.changes(to: after)["/r"])
    }
}
