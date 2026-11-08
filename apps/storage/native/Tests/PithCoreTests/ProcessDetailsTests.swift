import XCTest
@testable import PithCore

final class ProcessDetailsTests: XCTestCase {
    func testItReadsItsOwnArgumentsAndSigner() {
        let own = ProcessInfo.processInfo
        XCTAssertEqual(ProcessDetails.arguments(own.processIdentifier), Array(own.arguments.dropFirst()))
        XCTAssertNil(ProcessDetails.arguments(1), "launchd belongs to root, so its arguments are hidden")
        XCTAssertEqual(ProcessDetails.signer("/bin/ls"), "Apple")
    }

    func testCodeThatCantBeReadHasNoSigner() throws {
        XCTAssertNil(ProcessDetails.signer("/usr/libexec/pith-no-such-daemon"), "a missing file is unknown, not unsigned")
        // A file with no signature at all is unsigned.
        let script = FileManager.default.temporaryDirectory.appendingPathComponent("pith-unsigned-\(UUID().uuidString)")
        try Data("#!/bin/sh\n".utf8).write(to: script)
        defer { try? FileManager.default.removeItem(at: script) }
        XCTAssertEqual(ProcessDetails.signer(script.path), "Not signed")
    }
}
