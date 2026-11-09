import XCTest
@testable import PithCore

final class UpdateFlowTests: XCTestCase {
    private let offer = UpdateOffer(version: "0.1.1", notes: ["Faster scans."], size: 5_000_000)

    func testACheckPithMadeItselfLeavesAReminderAndInterruptsNothing() {
        var flow = UpdateFlow()
        XCTAssertEqual(flow.found(offer, userInitiated: false), .none, "a background check never brings a window forward")
        XCTAssertEqual(flow.reminder, offer)
        XCTAssertEqual(flow.phase, .available(offer))
        XCTAssertEqual(flow.focus(), .present, "checking for updates brings the waiting update forward")
        XCTAssertEqual(flow.choose(.install), .reply(.install))
        XCTAssertNil(flow.reminder, "once dealt with, the reminder goes")
    }

    func testACheckThePersonAskedForComesForward() {
        var flow = UpdateFlow()
        XCTAssertEqual(flow.checking(), .present)
        XCTAssertEqual(flow.found(offer, userInitiated: true), .present)
        XCTAssertNil(flow.reminder)
    }

    func testInstallRunsOnToReopeningWithoutAskingAgain() {
        var flow = UpdateFlow()
        _ = flow.found(offer, userInitiated: true)
        XCTAssertEqual(flow.choose(.install), .reply(.install))
        flow.downloadStarted()
        flow.expect(5_000_000)
        flow.received(2_000_000)
        guard case .downloading(_, let progress) = flow.phase else { return XCTFail("expected a download, got \(flow.phase)") }
        XCTAssertEqual(progress.fraction, 0.4)
        flow.preparing(nil)
        XCTAssertEqual(flow.phase, .preparing(offer, fraction: nil))
        flow.preparing(1.5)
        XCTAssertEqual(flow.phase, .preparing(offer, fraction: 1), "progress stays within 0 to 1")
        XCTAssertEqual(flow.readyToInstall(), .reply(.install), "the person already chose to install")
        flow.installing()
        XCTAssertEqual(flow.phase, .installing(offer))
    }

    func testAnUpdateDownloadedInTheBackgroundAsksBeforeReopening() {
        var flow = UpdateFlow()
        var downloaded = offer
        downloaded.downloaded = true
        _ = flow.found(downloaded, userInitiated: false)
        XCTAssertEqual(flow.readyToInstall(), .present, "Pith doesn't quit under the person without asking")
        XCTAssertEqual(flow.choose(.install), .reply(.install))
    }

    func testLaterAndSkipEndTheSession() {
        var flow = UpdateFlow()
        _ = flow.found(offer, userInitiated: false)
        XCTAssertEqual(flow.choose(.later), .reply(.later))
        XCTAssertEqual(flow.phase, .idle)
        XCTAssertNil(flow.reminder)
        _ = flow.found(offer, userInitiated: true)
        XCTAssertEqual(flow.choose(.skip), .reply(.skip))
        XCTAssertEqual(flow.phase, .idle)
    }

    func testChoicesThatDontFitChangeNothing() {
        var flow = UpdateFlow()
        XCTAssertEqual(flow.choose(.install), .none, "nothing to install")
        var important = offer
        important.critical = true
        _ = flow.found(important, userInitiated: true)
        XCTAssertEqual(flow.choose(.skip), .none, "an important update can't be skipped")
        var web = offer
        web.informationOnly = true
        _ = flow.found(web, userInitiated: true)
        XCTAssertEqual(flow.choose(.install), .none, "an update offered only on the web has nothing to install")
        XCTAssertEqual(flow.choose(.later), .reply(.later))
    }

    func testMessagesAndCancelsClose() {
        var flow = UpdateFlow()
        _ = flow.checking()
        XCTAssertEqual(flow.noUpdate(.newest), .present)
        flow.closed()
        XCTAssertEqual(flow.phase, .idle)
        XCTAssertEqual(flow.focus(), .none, "nothing to bring forward")
        _ = flow.found(offer, userInitiated: false)
        XCTAssertEqual(flow.failed("The download was interrupted."), .present)
        XCTAssertNil(flow.reminder)
        flow.closed()
        XCTAssertEqual(flow.phase, .idle)
        _ = flow.found(offer, userInitiated: true)
        flow.closed()
        XCTAssertEqual(flow.phase, .available(offer), "an offer waits for an answer; closing the window isn't one")
    }

    func testPermissionIsAskedOnceAndAnswered() {
        var flow = UpdateFlow()
        XCTAssertEqual(flow.askPermission(), .present)
        flow.answeredPermission()
        XCTAssertEqual(flow.phase, .idle)
    }

    func testSparkleEndingTheSessionClearsEverything() {
        var flow = UpdateFlow()
        _ = flow.found(offer, userInitiated: false)
        _ = flow.choose(.install)
        flow.dismissed()
        XCTAssertEqual(flow.phase, .idle)
        XCTAssertNil(flow.reminder)
        XCTAssertEqual(flow.readyToInstall(), .none, "no offer, nothing to install")
    }

    func testDownloadProgressDistrustsTheAnnouncedSize() {
        var progress = DownloadProgress()
        progress.receive(10)
        XCTAssertNil(progress.fraction, "no size announced yet")
        progress.expect(100)
        XCTAssertEqual(progress.fraction, 0.1)
        progress.receive(200)
        XCTAssertNil(progress.fraction, "more arrived than announced")
        progress.expect(0)
        XCTAssertNil(progress.expected)
    }

    func testReleaseNotesBecomeParagraphs() {
        XCTAssertEqual(UpdateOffer.paragraphs("Faster scans.\n\nDisk shows\nwhat grew.\n\n\n  Fixed a crash.  \n"),
                       ["Faster scans.", "Disk shows what grew.", "Fixed a crash."])
        XCTAssertEqual(UpdateOffer.paragraphs(nil), [])
        XCTAssertEqual(UpdateOffer.paragraphs("  \n "), [])
    }
}
