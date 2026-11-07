import XCTest
@testable import PithCore

final class ListingTests: XCTestCase {
    func testAppsAndSystemProcessesAreSeparatedAndSystemIsSummed() throws {
        let snapshot = sample(at: 0, apps: [
            group("game", path: "/Applications/Game.app/Contents/MacOS/Game", bundleName: "Game", pids: [10], cpu: 30, memory: 300),
            group("tool", path: "/opt/homebrew/bin/tool", pids: [11], cpu: 5, memory: 50),
            group("ws", path: "/System/Library/PrivateFrameworks/SkyLight.framework/Resources/WindowServer", pids: [12], cpu: 4, memory: 40, read: 2, written: 0),
            group("trustd", path: "/usr/libexec/trustd", pids: [13], cpu: 1, memory: 10, read: 1, written: 0),
        ], unavailable: 3)
        let listing = build([snapshot])
        XCTAssertEqual(listing.apps.map(\.id), ["game", "tool"])
        let system = try XCTUnwrap(listing.system)
        XCTAssertEqual(system.apps.map(\.id), ["ws", "trustd"])
        XCTAssertEqual(system.values, ActivityListing.Values(cpu: 5, memory: 50, read: 3, written: 0))
        XCTAssertEqual(system.processCount, 5, "Two readable processes and three macOS won't show.")
        XCTAssertEqual(system.protectedCount, 3)
    }

    func testSystemTotalsCoverReadableProcessesAndCountProtectedOnes() throws {
        let snapshot = sample(at: 0, apps: [
            group("ws", path: "/usr/sbin/a", pids: [12], cpu: 4, memory: 40),
            group("locked", path: "/usr/libexec/b", pids: [13, 14], cpu: nil, memory: nil, read: nil, written: nil, restricted: true),
        ], unavailable: 0)
        let system = try XCTUnwrap(build([snapshot]).system)
        XCTAssertEqual(system.values.cpu, 4, "Totals sum what can be read; the protected count says what's missing.")
        XCTAssertEqual(system.protectedCount, 2)
        XCTAssertEqual(system.processCount, 3)
    }

    func testHelpersFoldUnderTheirAppAndSameNamedHelpersMerge() throws {
        let main = ProcessKey(pid: 20, started: 1), renderer1 = ProcessKey(pid: 21, started: 2), renderer2 = ProcessKey(pid: 22, started: 3)
        let appPath = "/Applications/Browser.app/Contents/MacOS/Browser"
        let rendererPath = "/Applications/Browser.app/Contents/Frameworks/Browser Helper (Renderer).app/Contents/MacOS/Browser Helper (Renderer)"
        let snapshot = ActivitySnapshot(date: Date(timeIntervalSince1970: 0), uptime: 0, cpu: 10, pressure: .normal,
            apps: [AppSample(id: "browser", identity: ProcessIdentity(path: appPath, processName: "Browser", bundleName: "Browser"), executable: "/Applications/Browser.app",
                members: [main, renderer1, renderer2], cpu: 9, memory: 600, read: 0, written: 0, restricted: false, openedBy: nil)],
            error: nil, processes: [
                ProcessSample(key: main, name: "Browser", path: appPath, parent: 1, cpu: 6, memory: 300, read: 0, written: 0),
                ProcessSample(key: renderer1, name: "Browser Helper (Rendere", path: rendererPath, parent: 20, cpu: 2, memory: 200, read: 0, written: 0),
                ProcessSample(key: renderer2, name: "Browser Helper (Rendere", path: rendererPath, parent: 20, cpu: 1, memory: 100, read: 0, written: 0),
            ])
        let browser = try XCTUnwrap(build([snapshot]).apps.first)
        XCTAssertEqual(browser.processCount, 3)
        XCTAssertEqual(browser.helpers.map(\.name), ["Browser", "Browser Helper (Renderer)"], "Full names come from the path.")
        XCTAssertEqual(browser.helpers.map(\.count), [1, 2])
        XCTAssertEqual(browser.helpers[1].values.cpu, 3)
        XCTAssertEqual(browser.helpers[1].pids, [21, 22])
    }

    func testSingleProcessAppsHaveNoHelpers() {
        let snapshot = sample(at: 0, apps: [group("tool", path: "/opt/homebrew/bin/tool", pids: [11], cpu: 5)])
        XCTAssertEqual(build([snapshot]).apps.first?.helpers.isEmpty, true)
    }

    func testSearchMatchesNamesDescriptionsAndPIDs() {
        let snapshot = sample(at: 0, apps: [
            group("game", path: "/Applications/Game.app/Contents/MacOS/Game", bundleName: "Game", pids: [4242], cpu: 30),
            group("stores", path: "/System/Library/Frameworks/CoreServices.framework/Frameworks/Metadata.framework/Support/mds_stores", pids: [99], cpu: 1),
        ], unavailable: 50)
        XCTAssertEqual(build([snapshot], search: "gAm").apps.map(\.id), ["game"])
        XCTAssertNil(build([snapshot], search: "gAm").system)
        XCTAssertEqual(build([snapshot], search: "424").apps.map(\.id), ["game"])
        let spotlight = build([snapshot], search: "spotlight")
        XCTAssertEqual(spotlight.apps.count, 0)
        XCTAssertEqual(spotlight.system?.apps.map(\.id), ["stores"])
        XCTAssertEqual(spotlight.system?.protectedCount, 0, "Hidden processes can't match a search.")
        XCTAssertEqual(spotlight.system?.processCount, 1)
        XCTAssertEqual(build([snapshot], search: "  ").apps.count, 1, "Blank searches show everything.")
    }

    func testExitedAppsOnlyAppearWhenIncludedAndReadAsIdle() throws {
        let gone = group("gone", path: "/opt/homebrew/bin/gone", pids: [7], cpu: 80, memory: 500)
        let stays = group("stays", path: "/opt/homebrew/bin/stays", pids: [8], cpu: 1, memory: 5)
        let history = [sample(at: 0, apps: [gone, stays]), sample(at: 2, apps: [stays])]
        XCTAssertEqual(build(history).apps.map(\.id), ["stays"])
        let included = build(history, includeExited: true)
        XCTAssertEqual(included.apps.map(\.id), ["stays", "gone"])
        let exited = try XCTUnwrap(included.apps.last)
        XCTAssertFalse(exited.isRunning)
        XCTAssertEqual(exited.values, ActivityListing.Values(cpu: 0, memory: 0, read: 0, written: 0, power: 0), "An app that has quit uses nothing now.")
    }

    func testRangesRankByAverageAndIncludeAppsThatHaveSinceExited() throws {
        let history = [
            sample(at: 0, apps: [group("steady", path: "/opt/homebrew/bin/steady", pids: [1], cpu: 20)]),
            sample(at: 2, apps: [group("steady", path: "/opt/homebrew/bin/steady", pids: [1], cpu: 20), group("spike", path: "/opt/homebrew/bin/spike", pids: [2], cpu: 90)]),
            sample(at: 4, apps: [group("steady", path: "/opt/homebrew/bin/steady", pids: [1], cpu: 20)]),
        ]
        let live = build(history)
        XCTAssertEqual(live.apps.map(\.id), ["steady"], "The spike has exited and the live list hides exited apps.")
        let ranged = build(history, range: 0...4)
        XCTAssertEqual(ranged.apps.map(\.id), ["spike", "steady"])
        XCTAssertEqual(ranged.apps.first?.values.cpu, 30)
        XCTAssertEqual(ranged.apps.first?.helpers.isEmpty, true, "Process detail is live only.")
        XCTAssertEqual(build(history, range: 4...4).apps.map(\.id), ["steady"])
    }

    func testARangedSystemTotalCountsDaemonsThatRanInTurnOnce() throws {
        let daemon = { (id: String, pid: Int32) in self.group(id, path: "/usr/libexec/\(id)", pids: [pid], cpu: 1, memory: 20_000_000) }
        let history = [sample(at: 0, apps: [daemon("first", 1)]), sample(at: 2, apps: [daemon("second", 2)]), sample(at: 4, apps: [daemon("third", 3)])]
        let ranged = try XCTUnwrap(build(history, range: 0...4).system)
        XCTAssertEqual(ranged.values.memory, 20_000_000, "One 20 MB daemon ran at a time.")
        XCTAssertEqual(ranged.apps.first?.values.memory, 20_000_000, "Each row keeps its footprint while it ran.")
        XCTAssertEqual(build(history).system?.values.memory, 20_000_000)
    }

    func testUnavailableValuesSortLastInBothDirections() {
        let snapshot = sample(at: 0, apps: [
            group("b", path: "/opt/homebrew/bin/b", pids: [1], cpu: 5),
            group("locked", path: "/opt/homebrew/bin/locked", pids: [2], cpu: nil, restricted: true),
            group("a", path: "/opt/homebrew/bin/a", pids: [3], cpu: 10),
        ])
        XCTAssertEqual(build([snapshot]).apps.map(\.id), ["a", "b", "locked"])
        XCTAssertEqual(build([snapshot], sort: ActivitySort(column: .cpu, ascending: true)).apps.map(\.id), ["b", "a", "locked"])
        XCTAssertEqual(build([snapshot], sort: ActivitySort(column: .name, ascending: true)).apps.map(\.id), ["a", "b", "locked"])
        XCTAssertEqual(build([snapshot], sort: ActivitySort(column: .name, ascending: false)).apps.map(\.id), ["locked", "b", "a"])
    }

    func testTiesBreakByNameSoRowsDontShuffle() {
        let snapshot = sample(at: 0, apps: [
            group("zeta", path: "/opt/homebrew/bin/zeta", pids: [1], cpu: 0),
            group("alpha", path: "/opt/homebrew/bin/alpha", pids: [2], cpu: 0),
            group("Mid", path: "/opt/homebrew/bin/Mid", pids: [3], cpu: 0),
        ])
        XCTAssertEqual(build([snapshot]).apps.map(\.id), ["alpha", "Mid", "zeta"])
        XCTAssertEqual(build([snapshot], sort: ActivitySort(column: .cpu, ascending: true)).apps.map(\.id), ["alpha", "Mid", "zeta"])
    }

    // MARK: - Fixtures

    private func build(_ snapshots: [ActivitySnapshot], range: ClosedRange<Double>? = nil, search: String = "", includeExited: Bool = false, sort: ActivitySort = .cpuDescending) -> ActivityListing {
        var history = SessionHistory()
        for snapshot in snapshots { history.append(snapshot) }
        return ActivityListing(history: history, latest: snapshots.last, range: range, search: search, includeExited: includeExited, sort: sort)
    }

    private func group(_ id: String, path: String, bundleName: String? = nil, pids: [Int32], cpu: Double?, memory: UInt64? = 10, read: Double? = 0, written: Double? = 0, restricted: Bool = false) -> AppSample {
        AppSample(id: id, identity: ProcessIdentity(path: path, processName: URL(fileURLWithPath: path).lastPathComponent, bundleName: bundleName), executable: path,
            members: pids.map { ProcessKey(pid: $0, started: UInt64($0)) }, cpu: cpu, memory: memory, read: read, written: written, restricted: restricted, openedBy: nil)
    }

    private func sample(at time: Double, apps: [AppSample], unavailable: Int = 0) -> ActivitySnapshot {
        let processes = apps.flatMap { app in
            app.members.map { ProcessSample(key: $0, name: app.name, path: app.executable, parent: 1, cpu: app.cpu, memory: app.memory, read: app.read, written: app.written) }
        }
        return ActivitySnapshot(date: Date(timeIntervalSince1970: time), uptime: time, cpu: 10, pressure: .normal, apps: apps, error: nil, unavailableProcesses: unavailable, processes: processes)
    }
}

final class HelperSearchTests: XCTestCase {
    func testSearchFindsAnAppByItsHelpersName() {
        let app = ProcessKey(pid: 10, started: 1), helper = ProcessKey(pid: 11, started: 2)
        let sample = AppSample(id: "chrome", name: "Google Chrome", executable: "/Applications/Google Chrome.app", members: [app, helper],
                               cpu: 1, memory: 1, read: 0, written: 0, restricted: false)
        let processes = [
            ProcessSample(key: app, name: "Google Chrome", path: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", parent: 1, cpu: 1, memory: 1, read: 0, written: 0),
            ProcessSample(key: helper, name: "Google Chrome He", path: "/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Helper (Renderer).app/Contents/MacOS/Google Chrome Helper (Renderer)", parent: 10, cpu: 0, memory: 1, read: 0, written: 0),
        ]
        var history = SessionHistory()
        let snapshot = ActivitySnapshot(date: Date(), uptime: 0, cpu: 1, pressure: .normal, apps: [sample], error: nil, processes: processes)
        history.append(snapshot)
        let listing = ActivityListing(history: history, latest: snapshot, range: nil, search: "renderer", includeExited: false, sort: .cpuDescending)
        XCTAssertEqual(listing.apps.map(\.id), ["chrome"])
    }
}
