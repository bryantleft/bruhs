import AppKit
import XCTest
@testable import PithCore

final class PanelSummaryTests: XCTestCase {
    // MARK: CPU

    func testCPUAveragesAndPeaksTheReadingsInTheWindow() {
        let points = [point(98, cpu: 99), point(100, cpu: 10), point(102, cpu: nil), point(104, cpu: 30), point(700, cpu: 20)]
        let cpu = PanelSummary.cpu(points, window: 100...700, maxGap: 4)
        XCTAssertEqual(cpu.average, 20)
        XCTAssertEqual(cpu.peak, 30)
        XCTAssertNil(cpu.since, "Readings from the window's start cover the whole window.")
    }

    func testCPUSaysWhenAYoungSessionStarted() {
        let cpu = PanelSummary.cpu([point(500, cpu: nil), point(502, cpu: 12), point(504, cpu: 14)], window: 0...600, maxGap: 4)
        XCTAssertEqual(cpu.since, date(502))
        XCTAssertEqual(cpu.average, 13)
        XCTAssertEqual(cpu.peak, 14)
    }

    func testCPUWithoutReadingsHasNoSummary() {
        XCTAssertEqual(PanelSummary.cpu([point(0, cpu: nil)], window: 0...600, maxGap: 4), PanelSummary.CPU(average: nil, peak: nil, since: nil))
    }

    // MARK: Memory pressure

    func testPressureRunsMergeReadingsAndSplitWhereTheStateChanges() {
        let points = [point(2, .normal), point(4, .warning), point(6, .warning), point(8, .critical), point(10, .normal)]
        XCTAssertEqual(PanelSummary.pressureRuns(points, window: 0...10, interval: 2, maxGap: 4), [
            run(0, 2, .normal), run(2, 6, .warning), run(6, 8, .critical), run(8, 10, .normal)
        ])
    }

    func testPressureRunsLeaveUnknownReadingsAndGapsEmpty() {
        let points = [point(2, .normal), point(4, .unknown), point(6, .normal), point(20, .normal), point(22, .normal)]
        XCTAssertEqual(PanelSummary.pressureRuns(points, window: 0...22, interval: 2, maxGap: 4), [
            run(0, 2, .normal), run(4, 6, .normal), run(18, 22, .normal)
        ])
    }

    func testPressureRunsStayInsideTheWindow() {
        let points = [point(9, .warning), point(11, .warning), point(13, .warning)]
        XCTAssertEqual(PanelSummary.pressureRuns(points, window: 10...20, interval: 2, maxGap: 4), [run(10, 13, .warning)])
    }

    func testPressureStoryIsNormalForTheWholeWindow() {
        let points = stride(from: 0.0, through: 600, by: 2).map { point($0, .normal) }
        XCTAssertEqual(PanelSummary.pressureStory(points, window: 0...600, maxGap: 4), .normal(since: nil))
    }

    func testPressureStorySaysWhenAYoungSessionStarted() {
        let points = [point(500, .unknown), point(502, .normal), point(504, .normal)]
        XCTAssertEqual(PanelSummary.pressureStory(points, window: 0...600, maxGap: 4), .normal(since: date(502)))
    }

    func testPressureStoryReportsTheMostRecentElevatedStretch() {
        let points = [point(0, .warning), point(2, .normal), point(4, .warning), point(6, .critical), point(8, .warning), point(10, .normal)]
        XCTAssertEqual(PanelSummary.pressureStory(points, window: 0...10, maxGap: 4), .elevated(start: date(4), end: date(8), worst: .critical))
    }

    func testPressureStoryKeepsAnOngoingStretchOpen() {
        let points = [point(0, .normal), point(2, .warning), point(4, .warning)]
        XCTAssertEqual(PanelSummary.pressureStory(points, window: 0...4, maxGap: 4), .elevated(start: date(2), end: nil, worst: .warning))
    }

    func testPressureStorySplitsStretchesAtGaps() {
        let points = [point(100, .warning), point(102, .warning), point(200, .warning), point(202, .normal)]
        XCTAssertEqual(PanelSummary.pressureStory(points, window: 0...202, maxGap: 4), .elevated(start: date(200), end: date(200), worst: .warning))
    }

    func testPressureStoryWithoutKnownReadingsIsUnavailable() {
        XCTAssertEqual(PanelSummary.pressureStory([point(0, .unknown)], window: 0...600, maxGap: 4), .unavailable)
    }

    // MARK: Apps

    func testAppsRankByCPUWithoutPithAndSumTheRest() {
        let apps = [app("e", cpu: 3), app("pith", cpu: 0.3, pid: 42), app("a", cpu: 30), app("c2", cpu: 10), app("c1", cpu: 10),
                    app("protected", cpu: nil), app("d", cpu: 5)]
        let summary = PanelSummary.apps(apps, ownPID: 42, limit: 4)
        XCTAssertEqual(summary.top.map(\.id), ["a", "c1", "c2", "d"], "Equal CPU falls back to the name, so rows don't swap between samples.")
        XCTAssertEqual(summary.own?.id, "pith")
        XCTAssertEqual(summary.otherCount, 2)
        XCTAssertEqual(summary.otherCPU, 3)
    }

    func testAppsHoldAnEarlierOrderWhileThePointerIsOverTheList() {
        let apps = [app("a", cpu: 30), app("b", cpu: 20), app("c", cpu: 10)]
        let summary = PanelSummary.apps(apps, ownPID: 42, limit: 4, holding: ["c", "quit", "a"])
        XCTAssertEqual(summary.top.map(\.id), ["c", "a"])
        XCTAssertEqual(summary.otherCount, 1)
        XCTAssertEqual(summary.otherCPU, 20)
    }

    func testOtherAppsWithoutMeasurableCPUStayUnknown() {
        let summary = PanelSummary.apps([app("a", cpu: 1), app("protected", cpu: nil)], ownPID: 42, limit: 4)
        XCTAssertEqual(summary.top.map(\.id), ["a"])
        XCTAssertEqual(summary.otherCount, 1)
        XCTAssertNil(summary.otherCPU, "Protected processes are unmeasured, not idle.")
        XCTAssertNil(summary.own)
    }

    func testRowsThatWouldReadTheSameAddTheirProcessID() {
        let daemon = "/System/Library/Frameworks/CoreSpotlight.framework/spotlightknowledged"
        let first = sample("a", executable: daemon, pid: 3137)
        let second = sample("b", executable: daemon, pid: 13088)
        let finder = sample("c", executable: "/System/Library/CoreServices/Finder.app/Contents/MacOS/Finder", pid: 600)
        let shown = [first, second, finder]
        XCTAssertEqual(PanelSummary.details(first, among: shown), ["PID 3137"])
        XCTAssertEqual(PanelSummary.details(second, among: shown), ["PID 13088"])
        XCTAssertEqual(PanelSummary.details(finder, among: shown), [], "A unique name needs nothing after it.")
        XCTAssertEqual(PanelSummary.details(first, among: [first, finder]), [], "Only rows shown together are compared.")
    }

    func testToolVersionsTellCopiesApartBeforeProcessIDsDo() {
        let tool = { (version: String, pid: Int32) in self.sample("claude-\(version)-\(pid)", executable: "/Users/me/.local/share/claude/versions/\(version)", pid: pid) }
        let old = tool("2.1.300", 1), new = tool("2.1.319", 2), twin = tool("2.1.319", 3)
        XCTAssertEqual(PanelSummary.details(old, among: [old, new]), ["2.1.300"])
        XCTAssertEqual(PanelSummary.details(new, among: [old, new]), ["2.1.319"])
        XCTAssertEqual(PanelSummary.details(new, among: [old, new, twin]), ["2.1.319", "PID 2"])
    }

    // MARK: Collecting

    func testPanelCollectsUntilTheSamplerHasRates() {
        XCTAssertTrue(PanelSummary.isCollecting(nil))
        XCTAssertTrue(PanelSummary.isCollecting(snapshot(cpu: nil, apps: [app("a", cpu: nil)])), "The first sample after a start is only a baseline.")
        XCTAssertFalse(PanelSummary.isCollecting(snapshot(cpu: 12, apps: [])))
        XCTAssertFalse(PanelSummary.isCollecting(snapshot(cpu: nil, apps: [app("a", cpu: 1)])), "Missing system CPU is unavailable, not collecting.")
        XCTAssertFalse(PanelSummary.isCollecting(snapshot(cpu: nil, apps: [], error: "Process list incomplete")), "The error explains the empty panel.")
    }

    // MARK: Text

    func testClockDropsTheDayPeriodButKeepsTheLocalesClock() throws {
        let date = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-11-06T13:05:00Z"))
        let utc = try XCTUnwrap(TimeZone(identifier: "UTC"))
        XCTAssertEqual(PanelSummary.clock(date, locale: Locale(identifier: "en_US"), timeZone: utc), "1:05")
        XCTAssertEqual(PanelSummary.clock(date, locale: Locale(identifier: "en_GB"), timeZone: utc), "13:05")
        XCTAssertEqual(PanelSummary.clock(date, locale: Locale(identifier: "fi_FI"), timeZone: utc), "13.05")
    }

    func testMenuBarValueFillsFourDigitCells() {
        XCTAssertEqual(PanelSummary.menuBarValue("100%"), "100%")
        XCTAssertEqual(PanelSummary.menuBarValue("17%"), "\u{2007}17%")
        XCTAssertEqual(PanelSummary.menuBarValue(nil), "\u{2007}\u{2007}\u{2012}%")
    }

    func testMenuBarValueKeepsOneWidthAsItTicks() {
        // The status item's font: the menu bar size with tabular digits.
        let font = NSFont.monospacedDigitSystemFont(ofSize: NSFont.menuBarFont(ofSize: 0).pointSize, weight: .medium)
        func width(_ text: String) -> CGFloat { NSAttributedString(string: text, attributes: [.font: font]).size().width }
        let widest = width(PanelSummary.menuBarValue("100%"))
        for value in 0..<100 {
            XCTAssertEqual(width(PanelSummary.menuBarValue("\(value)%")), widest, accuracy: 0.01, "\(value)%")
        }
        XCTAssertEqual(width(PanelSummary.menuBarValue(nil)), widest, accuracy: 0.01)
    }

    // MARK: Fixtures

    private func date(_ uptime: Double) -> Date { Date(timeIntervalSince1970: 1_800_000_000 + uptime) }

    private func point(_ uptime: Double, cpu: Double?) -> ActivityPoint {
        ActivityPoint(date: date(uptime), uptime: uptime, cpu: cpu, pressure: .normal)
    }

    private func point(_ uptime: Double, _ pressure: MemoryPressure) -> ActivityPoint {
        ActivityPoint(date: date(uptime), uptime: uptime, cpu: nil, pressure: pressure)
    }

    private func run(_ start: Double, _ end: Double, _ pressure: MemoryPressure) -> PanelSummary.PressureRun {
        PanelSummary.PressureRun(start: start, end: end, pressure: pressure)
    }

    private func app(_ id: String, cpu: Double?, pid: Int32 = 1) -> AppSample {
        AppSample(id: id, name: id, executable: "/Applications/\(id).app", members: [ProcessKey(pid: pid, started: 1)],
                  cpu: cpu, memory: nil, read: nil, written: nil, restricted: cpu == nil)
    }

    /// A group named the way the sampler would name `executable`.
    private func sample(_ id: String, executable: String, pid: Int32) -> AppSample {
        let identity = ProcessIdentity(path: executable, processName: URL(fileURLWithPath: executable).lastPathComponent, bundleName: nil)
        return AppSample(id: id, identity: identity, executable: executable, members: [ProcessKey(pid: pid, started: 1)],
                         cpu: 1, memory: nil, read: nil, written: nil, restricted: false, openedBy: nil)
    }

    private func snapshot(cpu: Double?, apps: [AppSample], error: String? = nil) -> ActivitySnapshot {
        ActivitySnapshot(date: date(0), uptime: 0, cpu: cpu, pressure: .normal, apps: apps, error: error)
    }
}
