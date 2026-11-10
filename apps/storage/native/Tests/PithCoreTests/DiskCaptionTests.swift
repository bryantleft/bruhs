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

    /// The caption for the live map doing `activity` while macOS asks about `asking` of its folders.
    private func live(_ activity: DiskCaption.Live, asking: Int = 0) -> DiskCaption? {
        DiskCaption.live(LiveMapStatus(activity, asking: asking), now: now, calendar: calendar)
    }
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

    /// What the live map can be doing, each status the caption gives.
    private var activities: [DiskCaption.Live] {
        [.quiet, .mapping(found: nil), .mapping(found: DiskCaption.Found(bytes: 1, files: 1)), .catchingUp(waiting: 4), .catchingUp(waiting: 0),
         .live(waiting: 0, check: .daily, updatedAt: now), .live(waiting: 0, check: .lostTrack, updatedAt: now),
         .live(waiting: 500, check: nil, updatedAt: now), .live(waiting: 3, check: nil, updatedAt: now), .live(waiting: 0, check: nil, updatedAt: nil),
         .failed("Pith’s disk map stopped.")]
    }

    func testTheCaptionKeepsItsStatusWhileMacOSAsks() {
        // macOS asking about some folders is the asking notice's to say: the caption gives what it would without it.
        for activity in activities {
            XCTAssertEqual(live(activity, asking: 12), live(activity, asking: 0), "\(activity)")
        }
        guard case .figures(let figures)? = live(.live(waiting: 3, check: nil, updatedAt: now), asking: 12) else {
            return XCTFail("expected the map to be up to date while macOS asks")
        }
        XCTAssertEqual(figures.map(\.label), ["Up to date"])
    }

    func testTheAskingNoticeNamesTheFoldersOnceTheMapIsMade() {
        func notice(_ activity: DiskCaption.Live, asking: Int) -> Int? { AskingNotice.folders(for: LiveMapStatus(activity, asking: asking)) }
        XCTAssertEqual(notice(.live(waiting: 0, check: nil, updatedAt: now), asking: 12), 12)
        XCTAssertEqual(notice(.live(waiting: 0, check: .daily, updatedAt: now), asking: 2), 2)
        XCTAssertEqual(notice(.catchingUp(waiting: 3), asking: 1), 1)
        // Before the map is made, the map's own waiting view says macOS is asking, so the notice would say it twice.
        XCTAssertNil(notice(.mapping(found: nil), asking: 12))
        XCTAssertNil(notice(.mapping(found: DiskCaption.Found(bytes: 1, files: 1)), asking: 12))
        XCTAssertNil(notice(.quiet, asking: 12))
        XCTAssertNil(notice(.failed("Pith’s disk map stopped."), asking: 12))
        for activity in activities { XCTAssertNil(notice(activity, asking: 0), "\(activity)") }
    }

    func testTheAskingNoticeSaysWhatAnsweringDoes() {
        XCTAssertEqual(AskingNotice.sentence(folders: 12),
                       "macOS is asking whether Pith may read 12 folders. Answer it, or give Pith Full Disk Access once, and they join the map.")
        XCTAssertEqual(AskingNotice.sentence(folders: 1),
                       "macOS is asking whether Pith may read 1 folder. Answer it, or give Pith Full Disk Access once, and it joins the map.")
        XCTAssertEqual(AskingNotice.sentence(folders: 2_400), "macOS is asking whether Pith may read \(2_400.formatted()) folders. "
                       + "Answer it, or give Pith Full Disk Access once, and they join the map.")
        XCTAssertNil(AskingNotice.sentence(folders: 12).rangeOfCharacter(from: CharacterSet(charactersIn: "•·—–‒―‧∙›»")))
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
