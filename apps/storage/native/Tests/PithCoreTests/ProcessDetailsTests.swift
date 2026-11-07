import XCTest
@testable import PithCore

final class ProcessDetailsTests: XCTestCase {
    func testItReadsItsOwnArgumentsAndSigner() {
        let own = ProcessInfo.processInfo
        XCTAssertEqual(ProcessDetails.arguments(own.processIdentifier), Array(own.arguments.dropFirst()))
        XCTAssertNil(ProcessDetails.arguments(1), "launchd belongs to root, so its arguments are hidden")
        XCTAssertEqual(ProcessDetails.signer("/bin/ls"), "Apple")
    }

    func testAFreshFileFreesItsWholeSize() throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("pith-frees-\(UUID().uuidString)")
        try Data(repeating: 7, count: 1 << 20).write(to: file)
        defer { try? FileManager.default.removeItem(at: file) }
        guard let frees = ProcessDetails.freesNow(file.path) else { throw XCTSkip("Not on APFS") }
        XCTAssertGreaterThanOrEqual(frees, 1 << 20)
        let clone = file.appendingPathExtension("clone")
        guard (try? FileManager.default.copyItem(at: file, to: clone)) != nil else { return }
        defer { try? FileManager.default.removeItem(at: clone) }
        // An APFS copy is a clone: both share every block, so deleting one frees nothing.
        XCTAssertLessThan(ProcessDetails.freesNow(clone.path) ?? .max, 1 << 20)
    }
}
