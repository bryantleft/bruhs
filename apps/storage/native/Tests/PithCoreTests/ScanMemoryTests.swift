import XCTest
@testable import PithCore

final class ScanMemoryTests: XCTestCase {
    private func result(_ children: [DiskNode]) -> DiskResult {
        let size = children.reduce(0) { $0 + $1.size }
        let summary = DiskSummary(dirs: 1, files: 1, bytes: size, errors: 0, unreadable: .init(protected: 0, denied: 0, other: 0), entryErrors: 0,
                                  cloudOnly: .init(files: 0, bytes: 0, folders: 0), elapsedMs: 1, engine: "bulk")
        return DiskResult(root: DiskNode(kind: .dir, name: "r", path: "/r", size: size, files: 1, children: children), topFiles: [], summary: summary)
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

    func testAScanCountedTheOldWayIsntCompared() throws {
        let now = result([DiskNode(kind: .file, name: "x", path: "/r/x", size: 1000, children: nil)])
        XCTAssertTrue(ScanMemory(now, date: Date()).comparable(to: now))
        // Kept before version 4, when clones counted once per copy, so every folder of clones would look shrunk.
        let old = try JSONDecoder().decode(ScanMemory.self, from: Data(#"{"root":"/r","date":0,"sizes":{"/r/x":5000000}}"#.utf8))
        XCTAssertNil(old.version)
        XCTAssertFalse(old.comparable(to: now))
    }

    func testEachFolderHasItsOwnFile() {
        let folder = URL(fileURLWithPath: "/tmp")
        XCTAssertNotEqual(ScanMemory.file(for: "/Users/me", in: folder), ScanMemory.file(for: "/", in: folder))
        XCTAssertEqual(ScanMemory.file(for: "/", in: folder), ScanMemory.file(for: "/", in: folder))
    }
}
