import XCTest
@testable import PithCore

/// The smoke test's last check compares the person's state before its run and after: Pith's saved defaults, and when
/// each file and folder Pith keeps for them last changed. The person's own Pith, running meanwhile, saves its week of
/// history each minute, which changes `history.json` and the date of the folder that holds it, so while another copy of
/// Pith runs, at either reading, exactly those two are left out, and said to be. Anything else that changed still
/// counts. The readings here are the test's own.
final class PersistedStateTests: XCTestCase {
    private let support = "/Users/tester/Library/Application Support/Pith"
    private let then = Date(timeIntervalSince1970: 1_800_000_000)
    private var history: String { support + "/history.json" }
    private var cache: String { "/Users/tester/Library/Caches/app.bruhs.pith/Cache.db" }

    private func state(_ changed: [String: Date], defaults: [String: Any] = ["textSize": 0], others: [Int32] = []) -> PersistedState {
        PersistedState(defaults: defaults as NSDictionary, changed: changed, support: support, othersRunning: others)
    }

    private var before: PersistedState { state([support: then, history: then, cache: then]) }

    func testWithNoOtherPithRunningItsHistoryChangingCounts() {
        let after = state([support: then + 60, history: then + 60, cache: then])
        let found = after.differences(from: before)
        XCTAssertEqual(found.changes, ["file \(support)", "file \(history)"])
        XCTAssertEqual(found.leftOut, [])
    }

    func testWhileAnotherPithRunsItsHistoryAndItsFolderAreLeftOutAndSaidToBe() {
        let after = state([support: then + 60, history: then + 60, cache: then], others: [4242])
        let found = after.differences(from: before)
        XCTAssertEqual(found.changes, [])
        XCTAssertEqual(found.leftOut, ["file \(support)", "file \(history)"])
    }

    func testAnotherPithRunningAtLaunchOnlyLeavesThemOutToo() {
        let launch = state([support: then, history: then, cache: then], others: [4242])
        let found = state([support: then + 60, history: then + 60, cache: then]).differences(from: launch)
        XCTAssertEqual(found.changes, [])
        XCTAssertEqual(found.leftOut, ["file \(support)", "file \(history)"])
    }

    func testAHistoryItSavedForTheFirstTimeOrClearedIsLeftOutAsWell() {
        let fresh = state([support: then + 60, history: then + 60, cache: then], others: [4242]).differences(from: state([support: then, cache: then]))
        XCTAssertEqual(fresh.changes, [])
        XCTAssertEqual(fresh.leftOut, ["file \(support)", "file \(history)"])
        let cleared = state([support: then + 60, cache: then], others: [4242]).differences(from: before)
        XCTAssertEqual(cleared.changes, [])
        XCTAssertEqual(cleared.leftOut, ["file \(support)", "file \(history)"])
    }

    func testAnythingElseThatChangedStillCountsBesideAnotherPith() {
        let other = support + "/Scratch.json", frame = "NSWindow Frame main"
        let after = state([support: then + 60, history: then + 60, cache: then + 5, other: then], defaults: ["textSize": 1, frame: "0 0 800 600"],
                          others: [4242])
        let found = after.differences(from: before)
        XCTAssertEqual(found.changes, ["default \(frame)", "default textSize", "file \(other)", "file \(cache)"])
        XCTAssertEqual(found.leftOut, ["file \(support)", "file \(history)"], "still left out, and said to be")
    }

    /// Foundation's atomic save writes `history.json` whole beside the old one first, as `.dat.nosync`, the saving
    /// process's ID in hexadecimal, a dot and six letters and digits, then puts it in the old one's place. A reading in
    /// those milliseconds sees it, so while another copy runs, that copy's own such file is left out too, and said to be.
    /// One of another process, one not of that form, or one with no other copy running, still counts.
    func testTheTemporaryFileOfAnotherPithsAtomicSaveIsLeftOut() {
        let saving = support + "/.dat.nosyncE7DC.Ab12Cd"
        let found = state([support: then, history: then, cache: then, saving: then + 60], others: [59356]).differences(from: before)
        XCTAssertEqual(found.changes, [])
        XCTAssertEqual(found.leftOut, ["file \(saving)"])
        let gone = state([support: then, history: then, cache: then], others: [59356])
            .differences(from: state([support: then, history: then, cache: then, saving: then + 60]))
        XCTAssertEqual(gone.leftOut, ["file \(saving)"], "seen at launch and gone since")
        for other in [support + "/.dat.nosyncE7DD.Ab12Cd", support + "/.dat.nosyncE7DC.Ab12C", support + "/.dat.nosyncE7DC.Ab12C!",
                      support + "/dat.nosyncE7DC.Ab12Cd", support + "/Scans/.dat.nosyncE7DC.Ab12Cd"] {
            let counted = state([support: then, history: then, cache: then, other: then + 60], others: [59356]).differences(from: before)
            XCTAssertEqual(counted.changes, ["file \(other)"], other)
        }
        let alone = state([support: then, history: then, cache: then, saving: then + 60]).differences(from: before)
        XCTAssertEqual(alone.changes, ["file \(saving)"], "no other copy of Pith running")
    }

    func testOnlyWhatChangedIsSaidToBeLeftOut() {
        let found = state([support: then, history: then, cache: then], others: [4242]).differences(from: before)
        XCTAssertEqual(found.changes, [])
        XCTAssertEqual(found.leftOut, [], "nothing changed, so nothing was left out")
    }

    /// A run that kept its scans in the person's Scans folder would leave a scan memory there for each root it mapped,
    /// named by a hash of the root's path. The look only asks whether each is there.
    func testTheLookFindsAScanMemoryLeftForARoot() throws {
        let scans = FileManager.default.temporaryDirectory.appendingPathComponent("pith-test-scans-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: scans, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: scans) }
        let fixture = "/tmp/pith-fixture", other = "/private/tmp/pith-fixture"
        XCTAssertEqual(PersistedState.scanMemories(of: [fixture, other], in: scans), [])
        try Data("{}".utf8).write(to: ScanMemory.file(for: fixture, in: scans))
        XCTAssertEqual(PersistedState.scanMemories(of: [fixture, other], in: scans), [fixture])
        var asked: [String] = []
        _ = PersistedState.scanMemories(of: [other], in: scans) { asked.append($0); return false }
        XCTAssertEqual(asked, [ScanMemory.file(for: other, in: scans).path], "it asks only whether each root's file is there")
    }
}
