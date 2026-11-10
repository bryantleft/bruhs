import UniformTypeIdentifiers
import XCTest

/// The disk map draws a folder as one block when its extension is in src/lib/packages.json (`isPackageName` in
/// src/lib/format.ts), so each extension there has to be one macOS declares as a package type: otherwise the map
/// would hide the contents of a folder Finder opens as a folder.
final class PackageExtensionsTests: XCTestCase {
    private struct Packages: Decodable {
        let extensions: [String]
    }

    private func packages() throws -> Packages {
        let storage = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        return try JSONDecoder().decode(Packages.self, from: Data(contentsOf: storage.appendingPathComponent("src/lib/packages.json")))
    }

    /// `UTType(filenameExtension:)` alone looks among types of data, which a folder isn't, and for an extension no
    /// declared type claims it makes a dynamic type that conforms to whatever was asked for. So the check asks for a
    /// package and requires a declared type: one this Mac's system, or for `xcarchive` Xcode, declares.
    func testEveryListedExtensionIsAPackageOnThisMac() throws {
        let extensions = try packages().extensions
        XCTAssertGreaterThanOrEqual(extensions.count, 4)
        for pathExtension in extensions {
            let type = UTType(filenameExtension: pathExtension, conformingTo: .package)
            XCTAssertEqual(type?.isDynamic, false, "macOS declares no package type for .\(pathExtension)")
            XCTAssertEqual(type?.conforms(to: .package), true, ".\(pathExtension) isn't a package on this Mac")
        }
    }

    /// The check can tell a package from a folder that isn't one: a framework is a bundle Finder opens as a folder.
    func testAFrameworkIsNoPackage() {
        let framework = UTType(filenameExtension: "framework", conformingTo: .package)
        XCTAssertFalse(framework.map { !$0.isDynamic && $0.conforms(to: .package) } ?? false)
        XCTAssertEqual(UTType(filenameExtension: "framework", conformingTo: .directory)?.conforms(to: .package), false)
    }
}
