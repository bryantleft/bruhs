import XCTest
@testable import PithCore

/// The caption under the Disk tab's path bar: one status at a time, by priority, in sentences and labelled figures.
final class DiskCaptionTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
        return calendar
    }

    private func live(_ state: DiskCaption.Live) -> DiskCaption? { DiskCaption.live(state, now: now, calendar: calendar) }
    private func scan(_ state: DiskCaption.Scan) -> DiskCaption? { DiskCaption.scan(state, now: now, calendar: calendar) }
    private func figure(_ label: String, _ value: String) -> DiskCaption.Figure { DiskCaption.Figure(label: label, value: value) }

    func testTheFirstWalkShowsWhatItHasFoundOrThatItsStarting() {
        XCTAssertEqual(live(.mapping(found: nil)), .message("Starting the map…"))
        XCTAssertEqual(live(.mapping(found: DiskCaption.Found(bytes: 12_300_000_000, files: 123_697))),
                       .figures([figure("Mapped", "12.3 GB"), figure("Files", monaspaced(123_697.formatted()))]))
    }

    func testCatchingUpAfterALaunchSaysHowManyFoldersWait() {
        XCTAssertEqual(live(.catchingUp(waiting: 1)), .message("Catching up on 1 folder that changed while Pith was closed."))
        XCTAssertEqual(live(.catchingUp(waiting: 2_400)),
                       .message("Catching up on \(2_400.formatted()) folders that changed while Pith was closed."))
        XCTAssertEqual(live(.catchingUp(waiting: 0)), .message("Catching up on what changed while Pith was closed."))
    }

    func testARunningCheckOfEveryFolderIsNamedInAPlainSentence() {
        XCTAssertEqual(live(.live(waiting: 0, check: .daily, updatedAt: now)), .message("Checking the whole disk, as Pith does daily."))
        // One the scanner began itself, as FSEvents lost track of changes, isn't the daily one.
        XCTAssertEqual(live(.live(waiting: 0, check: .lostTrack, updatedAt: now)),
                       .message("Checking the whole disk, since macOS lost track of some changes."))
    }

    func testTheCheckOutranksTheFoldersItListsAndTheTimeTheMapWasUpToDate() {
        // A check lists every folder, so hundreds of thousands wait while it runs: they haven't changed.
        XCTAssertEqual(live(.live(waiting: 250_000, check: .daily, updatedAt: now)), .message("Checking the whole disk, as Pith does daily."))
        XCTAssertEqual(live(.live(waiting: 250_000, check: nil, updatedAt: now)),
                       .message("Catching up on \(250_000.formatted()) folders that changed."))
    }

    func testABusyMacsFewWaitingFoldersLeaveTheMapUpToDate() {
        let time = monaspaced("Today " + now.formatted(Date.FormatStyle(date: .omitted, time: .shortened, calendar: calendar, timeZone: calendar.timeZone)))
        XCTAssertEqual(live(.live(waiting: DiskCaption.catchingUpCount - 1, check: nil, updatedAt: now)), .figures([figure("Up to date", time)]))
        XCTAssertEqual(live(.live(waiting: DiskCaption.catchingUpCount, check: nil, updatedAt: now)),
                       .message("Catching up on \(DiskCaption.catchingUpCount.formatted()) folders that changed."))
        XCTAssertNil(live(.live(waiting: 0, check: nil, updatedAt: nil)))
    }

    func testAFailureSaysWhyAndAQuietMapSaysNothing() {
        XCTAssertEqual(live(.failed("Pith’s disk map stopped.")), .message("Pith’s disk map stopped."))
        XCTAssertNil(live(.quiet))
    }

    func testAScanSaysWhatItFoundThenWhenItRan() {
        XCTAssertEqual(scan(.scanning(found: nil, again: nil)), .message("Starting the scan…"))
        XCTAssertEqual(scan(.scanning(found: nil, again: "/Users/me/Projects")), .message("Scanning Projects again…"))
        XCTAssertEqual(scan(.scanning(found: DiskCaption.Found(bytes: 5_000_000, files: 42), again: nil)),
                       .figures([figure("Size", "5.00 MB"), figure("Files", "42")]))
        let yesterday = now.addingTimeInterval(-24 * 60 * 60)
        let time = yesterday.formatted(Date.FormatStyle(date: .omitted, time: .shortened, calendar: calendar, timeZone: calendar.timeZone))
        XCTAssertEqual(scan(.scanned(at: yesterday, edited: false)), .figures([figure("Scanned", monaspaced("Yesterday " + time))]))
        XCTAssertEqual(scan(.scanned(at: yesterday, edited: true)), .figures([figure("Scanned, then edited", monaspaced("Yesterday " + time))]))
        XCTAssertEqual(scan(.note("Scan cancelled.")), .message("Scan cancelled."))
        XCTAssertNil(scan(.nothing))
    }

    func testMacOSAskingLeavesTheCaptionToItsStatus() {
        // The live map has no state for macOS's question: the asking notice says it, and the caption goes on.
        let up = live(.live(waiting: 3, check: nil, updatedAt: now))
        guard case .figures(let figures)? = up else { return XCTFail("expected the map to be up to date") }
        XCTAssertEqual(figures.map(\.label), ["Up to date"])
    }

    func testTheCaptionsWordsUseNoSeparatorGlyphs() {
        let separators = CharacterSet(charactersIn: "•·—–‒―‧∙›»")
        let captions: [DiskCaption?] = [
            live(.mapping(found: nil)), live(.catchingUp(waiting: 4)), live(.catchingUp(waiting: 0)),
            live(.live(waiting: 0, check: .daily, updatedAt: nil)), live(.live(waiting: 0, check: .lostTrack, updatedAt: nil)),
            live(.live(waiting: 500, check: nil, updatedAt: nil)), scan(.scanning(found: nil, again: nil)),
            scan(.scanning(found: nil, again: "/a/b")),
        ]
        for caption in captions {
            guard case .message(let text)? = caption else { return XCTFail("expected a sentence, got \(String(describing: caption))") }
            XCTAssertNil(text.rangeOfCharacter(from: separators), text)
        }
    }
}
