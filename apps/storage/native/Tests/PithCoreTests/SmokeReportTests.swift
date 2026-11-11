import XCTest
@testable import PithCore

/// The smoke test writes its report as each check lands, so a run its caller's alarm stops still leaves every check it
/// finished, marked as a run that didn't finish, never as one that passed.
final class SmokeReportTests: XCTestCase {
    func testEachLandingLeavesEveryCheckSoFarAsARunThatHasntFinished() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("pith-test-report-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let report = SmokeReport(url: folder.appendingPathComponent("smoke.json"))
        report.landed(["native_metrics": true])
        report.landed(["native_metrics": true, "tab_switches": false])
        let written = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: report.url)) as? [String: Any])
        XCTAssertEqual(written["checks"] as? [String: Bool], ["native_metrics": true, "tab_switches": false])
        XCTAssertEqual(written["error"] as? String, "The smoke test hadn't finished when this was written: 2 checks had landed.")
    }
}
