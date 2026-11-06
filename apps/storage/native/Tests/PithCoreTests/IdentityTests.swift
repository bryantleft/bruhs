import XCTest
@testable import PithCore

final class IdentityTests: XCTestCase {
    func testAppBundlesUseTheirDisplayNameIncludingApplesOwnApps() {
        let league = ProcessIdentity(path: "/Applications/League of Legends.app/Contents/LoL/LeagueClient.app/Contents/MacOS/LeagueClient", processName: "LeagueClient", bundleName: "League of Legends")
        XCTAssertEqual(league.kind, .app)
        XCTAssertEqual(league.displayName, "League of Legends")
        XCTAssertNil(league.secondaryText, "Lists show an app's process count, not a qualifier.")
        XCTAssertNil(league.description)

        let finder = ProcessIdentity(path: "/System/Library/CoreServices/Finder.app/Contents/MacOS/Finder", processName: "Finder", bundleName: "Finder")
        XCTAssertEqual(finder.kind, .app, "A .app bundle is an app even when macOS ships it.")
    }

    func testBundlesWithoutReadableMetadataFallBackToTheBundleName() {
        let bare = ProcessIdentity(path: "/Applications/Bare Tool.app/Contents/MacOS/bare", processName: "bare", bundleName: nil)
        XCTAssertEqual(bare.displayName, "Bare Tool")
        XCTAssertEqual(ProcessIdentity(path: "/Applications/Blank.app/Contents/MacOS/blank", processName: "blank", bundleName: "").displayName, "Blank")
    }

    func testVersionNamedExecutablesTakeTheirToolsFolderName() {
        let claude = ProcessIdentity(path: "/Users/me/.local/share/claude/versions/2.1.319", processName: "2.1.319", bundleName: nil)
        XCTAssertEqual(claude.kind, .commandLineTool)
        XCTAssertEqual(claude.displayName, "claude")
        XCTAssertEqual(claude.secondaryText, "2.1.319")
        XCTAssertNil(claude.description)

        let nested = ProcessIdentity(path: "/opt/tools/deno/v2.0.1/bin/v2.0.1-aarch64", processName: "v2.0.1-aarch64", bundleName: nil)
        XCTAssertEqual(nested.displayName, "deno", "Version folders and bin folders aren't names.")
        XCTAssertEqual(nested.secondaryText, "v2.0.1-aarch64")
    }

    func testOrdinaryCommandLineToolsKeepTheirExecutableName() {
        let node = ProcessIdentity(path: "/opt/homebrew/Cellar/node/22.1.0/bin/node", processName: "node", bundleName: nil)
        XCTAssertEqual(node.kind, .commandLineTool)
        XCTAssertEqual(node.displayName, "node")
        XCTAssertNil(node.secondaryText)

        let python = ProcessIdentity(path: "/usr/local/bin/python3.12", processName: "python3.12", bundleName: nil)
        XCTAssertEqual(python.displayName, "python3.12", "Only a name that is nothing but a version is replaced.")
    }

    func testNamesComeFromThePathBecauseKernelProcessNamesAreTruncated() {
        let tool = ProcessIdentity(path: "/usr/local/bin/a-very-long-command-line-tool-name", processName: "a-very-long-command-line-tool-na", bundleName: nil)
        XCTAssertEqual(tool.displayName, "a-very-long-command-line-tool-name")
    }

    func testMacOSProcessesAreSystemWithAPlainEnglishDescription() {
        let stores = ProcessIdentity(path: "/System/Library/Frameworks/CoreServices.framework/Frameworks/Metadata.framework/Support/mds_stores", processName: "mds_stores", bundleName: nil)
        XCTAssertEqual(stores.kind, .system)
        XCTAssertEqual(stores.displayName, "mds_stores")
        XCTAssertEqual(stores.description?.contains("Spotlight"), true)
        XCTAssertEqual(stores.secondaryText, stores.description, "A curated description is what follows the name in a list.")

        for path in ["/usr/libexec/trustd", "/usr/sbin/bluetoothd", "/sbin/launchd", "/usr/bin/caffeinate", "/bin/zsh", "/Library/Apple/usr/libexec/oah/RosettaDaemon"] {
            XCTAssertEqual(ProcessIdentity(path: path, processName: "x", bundleName: nil).kind, .system, path)
        }
    }

    func testUncuratedSystemProcessesFallBackToAGenericDescription() {
        let unknown = ProcessIdentity(path: "/usr/libexec/someunknownd", processName: "someunknownd", bundleName: nil)
        XCTAssertEqual(unknown.description, "macOS system process")
        XCTAssertNil(unknown.secondaryText, "A generic line repeated on every row would be noise.")
    }

    func testProcessesWhosePathMacOSHidesAreSystem() {
        let kernel = ProcessIdentity(path: "", processName: "kernel_task", bundleName: nil)
        XCTAssertEqual(kernel.kind, .system)
        XCTAssertEqual(kernel.displayName, "kernel_task")
        XCTAssertNotNil(kernel.secondaryText)

        XCTAssertEqual(ProcessIdentity(path: "", processName: "", bundleName: nil).displayName, "Unnamed process")
    }

    func testKindLabels() {
        XCTAssertEqual(ProcessKind.app.label, "App")
        XCTAssertEqual(ProcessKind.commandLineTool.label, "Command-line tool")
        XCTAssertEqual(ProcessKind.system.label, "macOS system process")
    }
}
