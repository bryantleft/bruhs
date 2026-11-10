import XCTest
@testable import PithCore

final class DiskTests: XCTestCase {
    func testChunksPreserveUnicodeAndRejectWrongProtocolVersion() throws {
        var decoder = DiskStreamDecoder()
        let line = Data("{\"type\":\"fatal\",\"reason\":\"café failed\"}\n".utf8)
        let split = try XCTUnwrap(line.firstIndex(of: 0xC3)) + 1
        XCTAssertTrue(try decoder.feed(line.prefix(split)).isEmpty)
        XCTAssertThrowsError(try decoder.feed(line.suffix(from: split))) { error in
            XCTAssertTrue(error.localizedDescription.contains("café"))
        }
        XCTAssertThrowsError(try decoder.feed(Data("{\"type\":\"result\",\"version\":2}\n".utf8)))
    }

    func testAScanOfAProtectedFolderSaysHowToFixIt() throws {
        let line = """
        {"type":"result","version":4,"root":{"name":"Mail","path":"/Users/me/Library/Mail","size":0,"kind":"unreadable","reason":"protected"},"topFiles":[],"volumes":[],"unreadableFolders":[],"summary":{"dirs":0,"files":0,"bytes":0,"errors":1,"unreadable":{"protected":1,"denied":0,"other":0},"entryErrors":0,"cloudOnly":{"files":0,"bytes":0,"folders":0},"elapsedMs":1,"engine":"bulk"}}

        """
        var decoder = DiskStreamDecoder()
        XCTAssertThrowsError(try decoder.feed(Data(line.utf8))) { error in
            let failure = error as? DiskFailure
            XCTAssertEqual(failure?.needsDiskAccess, true)
            XCTAssertTrue(failure?.message.contains("Full Disk Access") == true, failure?.message ?? "")
        }
    }

    func testTheScannersNewNodesDecode() throws {
        let line = """
        {"type":"result","version":4,"root":{"name":"","path":"/","size":10,"kind":"dir","files":1,"children":[{"name":"Preboot","path":"/System/Volumes/Preboot","size":8,"kind":"volume","sharesDisk":true},{"name":"x","path":"/x","size":2,"kind":"file"},{"name":"locked","path":"/locked","size":0,"kind":"unreadable","reason":"denied"}]},"topFiles":[],"volumes":[{"path":"/System/Volumes/Preboot","name":"Preboot","bytes":8,"sharesDisk":true}],"unreadableFolders":[{"path":"/locked","reason":"denied"}],"summary":{"dirs":1,"files":1,"bytes":10,"errors":1,"unreadable":{"protected":0,"denied":1,"other":0},"entryErrors":0,"cloudOnly":{"files":0,"bytes":0,"folders":0},"elapsedMs":1,"engine":"bulk"}}

        """
        var decoder = DiskStreamDecoder()
        guard case .result(let result)? = try decoder.feed(Data(line.utf8)).first else { return XCTFail("no result") }
        XCTAssertEqual(result.root.children?.map(\.kind), [.volume, .file, .unreadable])
        XCTAssertEqual(result.root.children?.last?.reason, .denied)
        XCTAssertNil(result.item(at: "/locked"), "an unreadable folder can't be selected or trashed")
        XCTAssertNil(result.item(at: "/System/Volumes/Preboot"))
    }

    func testBridgeRejectsRemotePagesAndSubframes() {
        XCTAssertFalse(BridgePolicy.allows(url: URL(string: "https://example.com/index.html"), mainFrame: true))
        XCTAssertFalse(BridgePolicy.allows(url: URL(string: "pith://app/index.html"), mainFrame: false))
        XCTAssertFalse(BridgePolicy.allows(url: URL(string: "pith://other/index.html"), mainFrame: true))
        XCTAssertTrue(BridgePolicy.allows(url: URL(string: "pith://app/index.html"), mainFrame: true))
    }

    // MARK: Editing the map

    /// The selection looks each of its items up with every map, so a lookup goes down the folders that hold the path.
    func testAnItemIsFoundDownTheFoldersThatHoldIt() {
        let result = sample()
        XCTAssertEqual(result.item(at: "/r")?.kind, .dir, "the root is an item of its map")
        XCTAssertEqual(result.item(at: "/r/a")?.size, 40)
        XCTAssertEqual(result.item(at: "/r/a/big.bin")?.size, 30)
        XCTAssertEqual(result.item(at: "/r/b/hidden.log")?.size, 5, "a file folded into the smaller items, from the largest files")
        XCTAssertNil(result.item(at: "/r/a/locked"), "a folder the scan couldn't read is no item")
        XCTAssertNil(result.item(at: "/r/b/__other__"), "nor are the smaller items")
        XCTAssertNil(result.item(at: "/r/a/big"), "a path that only starts like an item's")
        XCTAssertNil(result.item(at: "/r/ab/big.bin"), "a path inside a folder that only starts like one")
        XCTAssertNil(result.item(at: "relative"))
        let everything = DiskResult(root: DiskNode(kind: .dir, name: "", path: "/", size: 1, files: 1, children: [
            DiskNode(kind: .dir, name: "Users", path: "/Users", size: 1, files: 1, children: [
                DiskNode(kind: .file, name: "a.bin", path: "/Users/a.bin", size: 1, children: nil),
            ]),
        ]), topFiles: [], summary: summary(bytes: 1, files: 1, errors: 0))
        XCTAssertEqual(everything.item(at: "/Users/a.bin")?.name, "a.bin", "under the startup disk's root")
    }

    func testRemovingAnItemShrinksEveryFolderAboveIt() throws {
        let result = sample()
        let updated = try XCTUnwrap(result.removing("/r/a/big.bin"))
        XCTAssertEqual(updated.root.size, 30)
        XCTAssertEqual(updated.root.files, 4)
        XCTAssertEqual(updated.root.children?.first { $0.path == "/r/a" }?.size, 10)
        XCTAssertEqual(updated.summary.bytes, 30)
        XCTAssertEqual(updated.summary.files, 4)
        XCTAssertFalse(updated.topFiles.contains { $0.path == "/r/a/big.bin" })
        XCTAssertNil(updated.item(at: "/r/a/big.bin"))
    }

    func testRemovingAFolderTakesItsFilesAndUnreadableFoldersWithIt() throws {
        let updated = try XCTUnwrap(sample().removing("/r/a"))
        XCTAssertEqual(updated.root.size, 20)
        XCTAssertEqual(updated.root.files, 3)
        XCTAssertEqual(updated.summary.files, 3)
        XCTAssertTrue(updated.unreadableFolders.isEmpty)
        XCTAssertTrue(updated.topFiles.allSatisfy { !$0.path.hasPrefix("/r/a/") })
    }

    func testRemovingAFileInsideAGroupShrinksTheGroup() throws {
        let updated = try XCTUnwrap(sample().removing("/r/b/hidden.log"))
        XCTAssertEqual(updated.root.size, 55)
        let group = updated.root.children?.first { $0.path == "/r/b" }?.children?.first { $0.kind == .aggregate }
        XCTAssertEqual(group?.size, 5)
        XCTAssertEqual(group?.files, 1)
    }

    /// Undo puts an item back on whatever map is open, as Move to Trash took it off: one in a folder the map folds into
    /// its smaller items goes back into them, as a file shown only in Largest files does, and the map is as it was.
    func testAnItemPutBackWhereTheMapFoldsItGoesBackIntoTheSmallerItems() throws {
        let original = sample()
        let hidden = try XCTUnwrap(original.item(at: "/r/b/hidden.log"))
        let without = try XCTUnwrap(original.removing("/r/b/hidden.log"))
        let block = try XCTUnwrap(without.restoring(hidden, topFiles: [DiskFile(name: "hidden.log", path: "/r/b/hidden.log", size: 5)]))
        XCTAssertEqual(block.item(at: "/r/b")?.children?.map(\.size), [10, 5, 5], "not folded, it has a block of its own beside the smaller items")
        let back = try XCTUnwrap(without.restoring(hidden, topFiles: [DiskFile(name: "hidden.log", path: "/r/b/hidden.log", size: 5)], folding: true))
        XCTAssertEqual(back.root, original.root)
        XCTAssertEqual(back.topFiles, original.topFiles)
        XCTAssertEqual(back.summary, original.summary)
        // A folder the map folds away, which Move to Trash took out of the smaller items it was in.
        let tiny = DiskNode(kind: .dir, name: "tiny", path: "/r/b/tiny", size: 6, files: 2, children: [])
        let gone = try XCTUnwrap(original.removing(tiny.path, folded: tiny))
        XCTAssertEqual(gone.root.size, 54)
        let returned = try XCTUnwrap(gone.restoring(tiny, topFiles: [], folding: true))
        XCTAssertEqual(returned.root, original.root)
        XCTAssertEqual(returned.summary, original.summary)
        XCTAssertNil(original.restoring(DiskNode(kind: .dir, name: "x", path: "/elsewhere/x", size: 6, files: 2, children: []), topFiles: [], folding: true),
                     "an item outside the map")
    }

    /// A folder put back brings the folders inside it that the map couldn't read back to the map's list of them, as its
    /// move took them off it.
    func testAFolderPutBackBringsItsUnreadableFoldersBack() throws {
        let original = sample()
        let a = try XCTUnwrap(original.item(at: "/r/a"))
        let without = try XCTUnwrap(original.removing("/r/a"))
        XCTAssertTrue(without.unreadableFolders.isEmpty)
        let back = try XCTUnwrap(without.restoring(a, topFiles: [DiskFile(name: "big.bin", path: "/r/a/big.bin", size: 30)],
                                                   unreadable: original.unreadableFolders))
        XCTAssertEqual(back.unreadableFolders, original.unreadableFolders)
        XCTAssertEqual(back.root, original.root)
        XCTAssertEqual(back.summary, original.summary)
    }

    func testReplacingAFolderWithANewerScanAdjustsTheTotals() throws {
        let fresh = DiskResult(root: DiskNode(kind: .dir, name: "a", path: "/r/a", size: 30, files: 1, children: [
            DiskNode(kind: .file, name: "new.bin", path: "/r/a/new.bin", size: 30, children: nil),
        ]), topFiles: [DiskFile(name: "new.bin", path: "/r/a/new.bin", size: 30)], summary: summary(bytes: 30, files: 1, errors: 0))
        let updated = try XCTUnwrap(sample().replacing("/r/a", with: fresh))
        XCTAssertEqual(updated.root.size, 50)
        XCTAssertEqual(updated.summary.files, 4)
        XCTAssertEqual(updated.summary.errors, 0, "the newer scan read the folder that was unreadable")
        XCTAssertEqual(updated.root.children?.first?.path, "/r/a", "children stay largest first")
        XCTAssertEqual(updated.topFiles.first?.path, "/r/a/new.bin")
        XCTAssertNil(sample().replacing("/r/zzz", with: fresh))
    }

    // MARK: Trash

    func testTrashRequiresSnapshotMembershipAndProtectsRoot() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let file = folder.appendingPathComponent("sample.txt")
        try Data("test".utf8).write(to: file)
        let result = fixture(root: folder.resolvingSymlinksInPath().path, children: [DiskNode(kind: .file, name: "sample.txt", path: file.resolvingSymlinksInPath().path, size: 4, children: nil)])
        let home = URL(fileURLWithPath: NSHomeDirectory())
        XCTAssertEqual(refusal(folder.resolvingSymlinksInPath().path, in: result, home: home), .outsideMap, "the map's own folder")
        XCTAssertEqual(refusal(folder.resolvingSymlinksInPath().appendingPathComponent("unscanned").path, in: result, home: home), .notInMap,
                       "a path the map doesn't list")
        let plan = try check(file.resolvingSymlinksInPath().path, in: result, home: home).get()
        XCTAssertEqual(plan.target.path, file.resolvingSymlinksInPath().path)
        XCTAssertEqual(plan.size, 4)
        XCTAssertEqual(plan.consequences, [])
    }

    func testParentSymlinkCannotEscapeButFinalSymlinkCanBeTrashed() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let outside = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        for url in [folder, outside] { try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true) }
        defer { for url in [folder, outside] { try? FileManager.default.removeItem(at: url) } }
        try FileManager.default.createSymbolicLink(at: folder.appendingPathComponent("link"), withDestinationURL: outside)
        // A map lists its items under its own folder's path, as a scan finds them.
        let canonicalLink = folder.resolvingSymlinksInPath().appendingPathComponent("link").path
        let escaped = canonicalLink + "/escape"
        let result = fixture(root: folder.resolvingSymlinksInPath().path, children: [
            DiskNode(kind: .file, name: "link", path: canonicalLink, size: 0, children: nil),
            DiskNode(kind: .file, name: "escape", path: escaped, size: 0, children: nil)
        ])
        let home = URL(fileURLWithPath: NSHomeDirectory())
        XCTAssertEqual(refusal(escaped, in: result, home: home), .outsideMap, "the link above it leads out of the map")
        XCTAssertEqual(try check(canonicalLink, in: result, home: home).get().target.path, canonicalLink)
    }

    func testWholeDiskScanStillProtectsHomeTopLevelAndSyntheticNodes() throws {
        let home = FileManager.default.homeDirectoryForCurrentUser.resolvingSymlinksInPath()
        let paths = [home.path, home.deletingLastPathComponent().path, "/System", "/__other__", home.appendingPathComponent("Library").path]
        let result = fixture(root: "/", children: paths.map { DiskNode(kind: $0 == "/__other__" ? .aggregate : .dir, name: "protected", path: $0, size: 0, children: nil) })
        XCTAssertEqual(paths.map { refusal($0, in: result, home: home) },
                       [.needed(home.lastPathComponent), .needed(home.deletingLastPathComponent().lastPathComponent), .needed("System"), .notInMap, .needed("Library")])
        XCTAssertEqual(refusal("relative", in: result, home: home), .notAPath)
    }

    /// `/System/Volumes/Data/Users/<you>` is the home folder at its data-volume path: a path check passes it.
    func testTheHomeFolderIsProtectedAtItsDataVolumePath() throws {
        let home = FileManager.default.homeDirectoryForCurrentUser.resolvingSymlinksInPath()
        let twin = "/System/Volumes/Data" + home.path
        guard FileManager.default.fileExists(atPath: twin) else { throw XCTSkip("No data volume at /System/Volumes/Data") }
        let result = fixture(root: "/", children: [DiskNode(kind: .dir, name: home.lastPathComponent, path: twin, size: 0, children: nil),
                                                   DiskNode(kind: .dir, name: "Library", path: twin + "/Library", size: 0, children: nil)])
        XCTAssertEqual(refusal(twin, in: result, home: home), .needed(home.lastPathComponent))
        XCTAssertEqual(refusal(twin, in: result, home: home)?.message.contains("won’t move it"), true)
        XCTAssertEqual(refusal(twin + "/Library", in: result, home: home), .needed("Library"))
    }

    func testSyncedItemsSayWhatTheTrashDoesToThem() {
        let home = URL(fileURLWithPath: "/Users/me")
        XCTAssertEqual(TrashPolicy.consequences(of: URL(fileURLWithPath: "/Users/me/Library/Mobile Documents/com~apple~CloudDocs/a.pdf"), home: home), [.iCloud])
        XCTAssertEqual(TrashPolicy.consequences(of: URL(fileURLWithPath: "/Users/me/Pictures/Photos Library.photoslibrary"), home: home), [.photosLibrary])
        if case .cloudStorage? = TrashPolicy.consequences(of: URL(fileURLWithPath: "/Users/me/Library/CloudStorage/Dropbox/a.zip"), home: home).first {} else {
            XCTFail("a CloudStorage item names its provider")
        }
        XCTAssertEqual(TrashPolicy.consequences(of: URL(fileURLWithPath: "/Users/me/Downloads/a.zip"), home: home), [])
    }

    // MARK: Accounting

    func testAccountingSplitsTheDisksUseWithoutGuessing() {
        // The development Mac's startup disk: 904.0 GB used, system 12.3 GB, data 878.9 GB, Preboot 10.1 GB.
        let gb: UInt64 = 1_000_000_000
        var result = sample()
        result = DiskResult(root: result.root, topFiles: [], volumes: [DiskVolume(path: "/System/Volumes/Preboot", name: "Preboot", bytes: 10 * gb, sharesDisk: true),
                                                                      DiskVolume(path: "/Volumes/USB", name: "USB", bytes: 0, sharesDisk: false)],
                            unreadableFolders: [], summary: summary(bytes: 870 * gb, files: 8, errors: 488))
        let accounting = DiskAccounting(used: 904 * gb, walkedVolumes: [12 * gb, 879 * gb], result: result, snapshots: 2, purgeable: 12 * gb)
        XCTAssertEqual(accounting.scanned, 870 * gb)
        XCTAssertEqual(accounting.hiddenVolumes, 3 * gb, "Recovery isn't mounted")
        XCTAssertEqual(accounting.notMeasured, 31 * gb)
        XCTAssertEqual(accounting.overcounted, 0)
        XCTAssertEqual(accounting.unreadableFolders, 488)
    }

    func testAccountingSaysWhenClonesMakeTheScanBigger() {
        let accounting = DiskAccounting(used: 100, walkedVolumes: [90], result: DiskResult(root: sample().root, topFiles: [], summary: summary(bytes: 95, files: 1, errors: 0)), snapshots: nil, purgeable: nil)
        XCTAssertNil(accounting.notMeasured)
        XCTAssertEqual(accounting.overcounted, 5)
    }

    func testOnlyAVolumesRootIsAccounted() {
        XCTAssertEqual(DiskAccounting.walkedVolumes(root: "/", mountPoint: "/"), ["/", "/System/Volumes/Data"])
        XCTAssertEqual(DiskAccounting.walkedVolumes(root: "/Volumes/USB", mountPoint: "/Volumes/USB"), ["/Volumes/USB"])
        XCTAssertNil(DiskAccounting.walkedVolumes(root: "/Users/me", mountPoint: "/System/Volumes/Data"))
        XCTAssertEqual(DiskAccounting.snapshotCount(tmutilOutput: "Snapshots for disk /:\ncom.apple.TimeMachine.2026-11-07-101010.local\ncom.apple.os.update-ABC\n"), 2)
    }

    func testVolumeSpaceIsTheVolumesOwn() throws {
        guard let preboot = VolumeSpace.used("/System/Volumes/Preboot"), let data = VolumeSpace.used("/System/Volumes/Data") else {
            throw XCTSkip("Not the startup disk's volume layout")
        }
        XCTAssertLessThan(preboot, data, "Preboot reports its own use, not the container's")
    }

    // MARK: Fixtures

    /// /r 60 B in 5 files: a (40 B: big.bin 30, small.bin 10, and an unreadable folder) and b (20 B: one 10 B file
    /// and a 10 B group of two files, one of them hidden.log at 5 B).
    private func sample() -> DiskResult {
        let a = DiskNode(kind: .dir, name: "a", path: "/r/a", size: 40, files: 2, children: [
            DiskNode(kind: .file, name: "big.bin", path: "/r/a/big.bin", size: 30, children: nil),
            DiskNode(kind: .file, name: "small.bin", path: "/r/a/small.bin", size: 10, children: nil),
            DiskNode(kind: .unreadable, name: "locked", path: "/r/a/locked", size: 0, reason: .denied, children: nil),
        ])
        let b = DiskNode(kind: .dir, name: "b", path: "/r/b", size: 20, files: 3, children: [
            DiskNode(kind: .file, name: "c.txt", path: "/r/b/c.txt", size: 10, children: nil),
            DiskNode(kind: .aggregate, name: "(smaller items)", path: "/r/b/__other__", size: 10, files: 2, children: nil),
        ])
        let root = DiskNode(kind: .dir, name: "r", path: "/r", size: 60, files: 5, children: [a, b])
        return DiskResult(root: root, topFiles: [DiskFile(name: "big.bin", path: "/r/a/big.bin", size: 30), DiskFile(name: "hidden.log", path: "/r/b/hidden.log", size: 5)],
                          unreadableFolders: [DiskUnreadableFolder(path: "/r/a/locked", reason: .denied)], summary: summary(bytes: 60, files: 5, errors: 1))
    }

    private func summary(bytes: UInt64, files: UInt64, errors: UInt64) -> DiskSummary {
        DiskSummary(dirs: 1, files: files, bytes: bytes, errors: errors, unreadable: .init(protected: 0, denied: errors, other: 0), entryErrors: 0,
                    cloudOnly: .init(files: 0, bytes: 0, folders: 0), elapsedMs: 1, engine: "std")
    }

    private func fixture(root: String, children: [DiskNode]) -> DiskResult {
        DiskResult(root: DiskNode(kind: .dir, name: "test", path: root, size: 4, children: children), topFiles: [], summary: summary(bytes: 4, files: 1, errors: 0))
    }

    /// What `TrashPolicy` says of moving `path` to the Trash, with the folders `home` keeps protected.
    private func check(_ path: String, in result: DiskResult, home: URL) -> Result<TrashPlan, TrashRefusal> {
        TrashPolicy.check(path, result: result, home: home, protected: TrashPolicy.protectedIdentities(home: home))
    }

    /// Why `TrashPolicy` won't move `path` to the Trash, or nil when it would.
    private func refusal(_ path: String, in result: DiskResult, home: URL) -> TrashRefusal? {
        if case .failure(let refusal) = check(path, in: result, home: home) { return refusal }
        return nil
    }
}
