import XCTest
@testable import PithCore

/// The check of the bar under the map proves it follows the appearance only where the two appearances' drawings differ.
/// Where macOS draws a folder's light and dark art differently, drawings alike fail; where it draws them alike, as CI's
/// macOS 26.7.2 does, the check says it can't tell rather than failing.
final class AppearanceShownTests: XCTestCase {
    func testTheBarShowingTheDrawingOfItsAppearanceProvesIt() {
        XCTAssertEqual(AppearanceShown.judge(matches: true, alike: false, foldersAlike: false), .shown)
        XCTAssertEqual(AppearanceShown.judge(matches: true, alike: false, foldersAlike: true), .shown)
    }

    func testTheBarNotShowingItFails() {
        XCTAssertEqual(AppearanceShown.judge(matches: false, alike: false, foldersAlike: false), .failed)
        XCTAssertEqual(AppearanceShown.judge(matches: false, alike: true, foldersAlike: true), .failed)
    }

    func testDrawingsAlikeFailWhereMacOSDrawsFoldersUnlikeAndProveNothingWhereItDrawsThemAlike() {
        XCTAssertEqual(AppearanceShown.judge(matches: true, alike: true, foldersAlike: false), .failed)
        XCTAssertEqual(AppearanceShown.judge(matches: true, alike: true, foldersAlike: true), .notProvenHere)
    }

    func testDrawingsThatFailedOrPaintedNothingAreNeverAlike() {
        let painted = Data([0, 0, 0, 255, 10, 20, 30, 255])
        XCTAssertTrue(AppearanceShown.alike(painted, painted))
        XCTAssertFalse(AppearanceShown.alike(painted, Data([0, 0, 0, 255, 10, 20, 31, 255])))
        XCTAssertFalse(AppearanceShown.alike(nil, nil), "drawings that failed")
        XCTAssertFalse(AppearanceShown.alike(painted, nil), "a drawing that failed")
        XCTAssertFalse(AppearanceShown.alike(Data(count: 8), Data(count: 8)), "drawings that painted nothing")
    }
}
