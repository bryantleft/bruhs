import XCTest
@testable import PithCore

/// The check of the bar under the map proves it follows the appearance only where the two appearances' drawings differ.
/// A folder's do on macOS 26 and later, so drawings alike there fail; before, macOS can draw them alike, and the check
/// says it can't tell rather than failing.
final class AppearanceShownTests: XCTestCase {
    func testTheBarShowingTheDrawingOfItsAppearanceProvesIt() {
        XCTAssertEqual(AppearanceShown.judge(matches: true, alike: false, macOSMajor: 26), .shown)
        XCTAssertEqual(AppearanceShown.judge(matches: true, alike: false, macOSMajor: 15), .shown)
    }

    func testTheBarNotShowingItFails() {
        XCTAssertEqual(AppearanceShown.judge(matches: false, alike: false, macOSMajor: 26), .failed)
        XCTAssertEqual(AppearanceShown.judge(matches: false, alike: true, macOSMajor: 15), .failed)
    }

    func testDrawingsAlikeFailOnMacOS26AndLaterAndProveNothingBefore() {
        XCTAssertEqual(AppearanceShown.judge(matches: true, alike: true, macOSMajor: 26), .failed)
        XCTAssertEqual(AppearanceShown.judge(matches: true, alike: true, macOSMajor: 27), .failed)
        XCTAssertEqual(AppearanceShown.judge(matches: true, alike: true, macOSMajor: 15), .notProvenHere)
    }
}
