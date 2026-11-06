import XCTest
import CoreGraphics
@testable import PithCore

final class MenuPanelLayoutTests: XCTestCase {
    func testNormalDisplayKeepsAStableViewport() {
        let size = MenuPanelLayout.contentSize(anchor: CGRect(x: 1200, y: 875, width: 100, height: 25), visibleFrame: CGRect(x: 0, y: 50, width: 1440, height: 825))
        XCTAssertEqual(size, MenuPanelLayout.idealSize)
    }

    func testSmallLaptopShowsTheWholePanelWithoutScrolling() {
        // 1280×800 points, a 24 pt menu bar and a 60 pt Dock along the bottom.
        let size = MenuPanelLayout.contentSize(anchor: CGRect(x: 1100, y: 776, width: 60, height: 24), visibleFrame: CGRect(x: 0, y: 60, width: 1280, height: 716))
        XCTAssertEqual(size, MenuPanelLayout.idealSize)
    }

    func testShortDisplayLeavesRoomForTheArrowAndDock() {
        let size = MenuPanelLayout.contentSize(anchor: CGRect(x: 600, y: 370, width: 100, height: 25), visibleFrame: CGRect(x: 0, y: 30, width: 800, height: 340))
        XCTAssertEqual(size.height, 308)
        XCTAssertLessThan(size.height, MenuPanelLayout.idealSize.height)
    }

    func testSecondaryDisplayUsesItsOwnCoordinates() {
        let size = MenuPanelLayout.contentSize(anchor: CGRect(x: -200, y: -100, width: 100, height: 25), visibleFrame: CGRect(x: -320, y: -400, width: 320, height: 300))
        XCTAssertEqual(size, CGSize(width: 288, height: 268))
    }
}
