import XCTest
@testable import PithCore

final class ByteFormatTests: XCTestCase {
    func testStorageSizesAreDecimalToThreeSignificantFigures() {
        XCTAssertEqual(formatBytes(0), "0 B")
        XCTAssertEqual(formatBytes(512), "512 B")
        XCTAssertEqual(formatBytes(1000), "1.00 KB")
        XCTAssertEqual(formatBytes(16_384), "16.4 KB")
        XCTAssertEqual(formatBytes(471_859_200), "472 MB")
        XCTAssertEqual(formatBytes(3_339_000_000), "3.34 GB")
        XCTAssertEqual(formatBytes(3_300_000_000), "3.30 GB", "Trailing zeros stay, so a column's decimals line up.")
        XCTAssertEqual(formatBytes(91_100_000_000), "91.1 GB")
        // The development Mac's 994.7 GB startup disk, which Finder calls 995 GB.
        XCTAssertEqual(formatBytes(994_662_584_320), "995 GB")
    }

    func testRoundingCarriesIntoTheNextUnit() {
        XCTAssertEqual(formatBytes(999_600_000), "1.00 GB")
        XCTAssertEqual(formatBytes(9_996_000), "10.0 MB")
        XCTAssertEqual(formatBytes(99_960_000), "100 MB")
        XCTAssertEqual(formatMemory(1_073_741_000), "1.00 GB")
    }

    func testMemoryIsBinaryAsActivityMonitorShowsIt() {
        XCTAssertEqual(formatMemory(1024), "1.00 KB")
        XCTAssertEqual(formatMemory(3_339_000_000), "3.11 GB")
        XCTAssertEqual(formatMemory(50_331_648), "48.0 MB")
    }

    func testTheLargestUnitAbsorbsAnythingBigger() {
        XCTAssertEqual(formatBytes(UInt64.max), "18447 PB")
    }
}
