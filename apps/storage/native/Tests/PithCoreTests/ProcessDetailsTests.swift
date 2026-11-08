import XCTest
@testable import PithCore

final class ProcessDetailsTests: XCTestCase {
    func testItReadsItsOwnArgumentsAndSigner() {
        let own = ProcessInfo.processInfo
        XCTAssertEqual(ProcessDetails.arguments(own.processIdentifier), Array(own.arguments.dropFirst()))
        XCTAssertNil(ProcessDetails.arguments(1), "launchd belongs to root, so its arguments are hidden")
        XCTAssertEqual(ProcessDetails.signer("/bin/ls"), "Apple")
    }
}
