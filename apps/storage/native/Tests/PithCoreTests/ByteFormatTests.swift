import XCTest
@testable import PithCore

final class ByteFormatTests: XCTestCase {
    func testSizesKeepThreeSignificantFigures() {
        XCTAssertEqual(formatBytes(0), "0 B")
        XCTAssertEqual(formatBytes(512), "512 B")
        XCTAssertEqual(formatBytes(1024), "1.00 KB")
        XCTAssertEqual(formatBytes(16_384), "16.0 KB")
        XCTAssertEqual(formatBytes(471_859_200), "450 MB")
        XCTAssertEqual(formatBytes(3_339_000_000), "3.11 GB")
        XCTAssertEqual(formatBytes(3_328_599_654), "3.10 GB", "Trailing zeros stay, so a column's decimals line up.")
        XCTAssertEqual(formatBytes(103_508_000_000), "96.4 GB")
        XCTAssertEqual(formatBytes(994_662_584_320), "926 GB")
    }

    func testTheLargestUnitAbsorbsAnythingBigger() {
        XCTAssertEqual(formatBytes(UInt64.max), "16384 PB")
    }
}
