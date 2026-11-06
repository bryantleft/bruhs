import XCTest
@testable import PithCore

final class MetricTests: XCTestCase {
    func testCPUUsesCounterDeltasRatherThanLifetimeTotals() {
        XCTAssertEqual(MetricMath.cpu(busy: 120, total: 300, previousBusy: 100, previousTotal: 200), 20)
    }

    func testCounterResetsAndMissingElapsedTimeAreUnavailable() {
        XCTAssertNil(MetricMath.cpu(busy: 5, total: 10, previousBusy: 10, previousTotal: 20))
        XCTAssertNil(MetricMath.rate(counter: 1, previous: 2, elapsed: 1))
        XCTAssertNil(MetricMath.rate(counter: 2, previous: 1, elapsed: 0))
    }

    func testRatesUseActualElapsedTime() {
        XCTAssertEqual(MetricMath.rate(counter: 400, previous: 100, elapsed: 3), 100)
    }
}
