import XCTest
@testable import PithCore

@MainActor final class DiskMaintenanceTests: XCTestCase {
    func testSnapshotsKeepSystemAndThirdPartyCopiesProtected() throws {
        let data = try PropertyListSerialization.data(fromPropertyList: ["Snapshots": [
            ["Name": "com.apple.TimeMachine.2026-11-12-120000.local", "SnapshotUUID": "11111111-1111-1111-1111-111111111111", "Purgeable": true],
            ["Name": "com.apple.os.update-abc", "SnapshotUUID": "22222222-2222-2222-2222-222222222222", "Purgeable": true],
            ["Name": "com.example.backup", "SnapshotUUID": "33333333-3333-3333-3333-333333333333", "Purgeable": true],
            ["Name": "com.apple.TimeMachine.2026-11-12-110000.local", "SnapshotUUID": "44444444-4444-4444-4444-444444444444", "Purgeable": false],
        ]], format: .xml, options: 0)
        let snapshots = try DiskMaintenance.decodeSnapshots(data)
        XCTAssertEqual(snapshots.filter(\.canDelete).count, 1)
        let timeMachine = try XCTUnwrap(snapshots.first { $0.canDelete })
        XCTAssertEqual(timeMachine.date, "2026-11-12-120000")
        XCTAssertThrowsError(try DiskMaintenance.deletionCommand(volume: sampleVolume, snapshot: try XCTUnwrap(snapshots.first { $0.name.hasPrefix("com.apple.os.update") })))
        let command = try DiskMaintenance.deletionCommand(volume: sampleVolume, snapshot: timeMachine)
        XCTAssertEqual(command.executable, "/usr/sbin/diskutil")
        XCTAssertEqual(command.arguments, ["apfs", "deleteSnapshot", "disk9s2", "-uuid", "11111111-1111-1111-1111-111111111111", "-wait"])
        XCTAssertTrue(command.needsAdministrator)
        XCTAssertTrue(command.authorizedShell.contains("/usr/bin/plutil -extract VolumeUUID"))
        XCTAssertTrue(command.authorizedShell.contains("99999999-9999-9999-9999-999999999999"))
        XCTAssertTrue(command.authorizedShell.contains("exec '/usr/sbin/diskutil'"))
    }

    func testMalformedOrDuplicateSnapshotIdentityFailsClosed() throws {
        for snapshots in [
            [["Name": "com.apple.TimeMachine.2026-11-12-120000.local", "SnapshotUUID": "$(rm -rf /)"]],
            [["Name": "a", "SnapshotUUID": "11111111-1111-1111-1111-111111111111"], ["Name": "b", "SnapshotUUID": "11111111-1111-1111-1111-111111111111"]],
        ] {
            let data = try PropertyListSerialization.data(fromPropertyList: ["Snapshots": snapshots], format: .binary, options: 0)
            XCTAssertThrowsError(try DiskMaintenance.decodeSnapshots(data))
        }
        XCTAssertThrowsError(try DiskMaintenance.decodeSnapshots(Data("bad plist".utf8)))
    }

    func testLocalVolumeResolutionDoesNotEnterNetworkMounts() throws {
        let mounts = MountTable([
            .init(path: "/", from: "/dev/disk3s1s1"),
            .init(path: "/System/Volumes/Data", from: "/dev/disk3s5"),
            .init(path: "/Volumes/Test", from: "/dev/disk9s2"),
            .init(path: "/Volumes/NAS", from: "//server/share", isLocal: false),
        ])
        XCTAssertEqual(try DiskMaintenance.volumeRoot(for: "/Users/me/Downloads", mounts: mounts), "/System/Volumes/Data")
        XCTAssertEqual(try DiskMaintenance.volumeRoot(for: "/Volumes/Test/project", mounts: mounts), "/Volumes/Test")
        XCTAssertThrowsError(try DiskMaintenance.volumeRoot(for: "/Volumes/NAS/project", mounts: mounts))
    }

    func testSnapshotThinningUsesOSDefaultUrgencyAndRequestedBytes() throws {
        let command = try DiskMaintenance.thinningCommand(volume: sampleVolume, requestedBytes: 4096)
        XCTAssertEqual(command.arguments, ["thinlocalsnapshots", "/Volumes/Test", "4096"])
        XCTAssertThrowsError(try DiskMaintenance.thinningCommand(volume: sampleVolume, requestedBytes: 0))
        XCTAssertThrowsError(try DiskMaintenance.decodeVolume(plist(["DeviceIdentifier": "disk9s2; evil", "FilesystemType": "apfs", "MountPoint": "/Volumes/Test"])))
    }

    func testPrivilegeScriptQuotesFileNamesAndStagesVerifiedScannerBeforeExecution() throws {
        let command = MaintenanceCommand(executable: "/usr/bin/tmutil", arguments: ["thinlocalsnapshots", "/Volumes/O'Brien $(touch /tmp/x)", "4096"], needsAdministrator: true)
        XCTAssertEqual(command.shell, "'/usr/bin/tmutil' 'thinlocalsnapshots' '/Volumes/O'\\''Brien $(touch /tmp/x)' '4096'")
        let script = try AdministratorScan.script(binary: URL(fileURLWithPath: "/Applications/Pith's.app/Contents/MacOS/storage-scanner"), root: URL(fileURLWithPath: "/Users/me/$(touch x)"), team: "ABCDE12345", codeHash: String(repeating: "a", count: 40))
        XCTAssertTrue(script.contains("/usr/bin/mktemp -d /private/tmp/app.bruhs.pith.scan."))
        XCTAssertTrue(script.contains("/usr/bin/codesign --verify --strict"))
        XCTAssertTrue(script.contains("--arch \(AdministratorScan.architecture)"), "pin the same architecture's hash in a universal scanner")
        XCTAssertTrue(script.contains("/usr/bin/arch -\(AdministratorScan.architecture)"), "execute the slice that was verified, including under Rosetta")
        XCTAssertTrue(script.contains("cdhash H\""))
        XCTAssertLessThan(try XCTUnwrap(script.range(of: "/usr/bin/codesign")?.lowerBound), try XCTUnwrap(script.range(of: "\"$stage/storage-scanner\" scan")?.lowerBound))
        XCTAssertTrue(script.contains("'Pith'\\''s.app") || script.contains("Pith'\\''s.app"))
        XCTAssertThrowsError(try AdministratorScan.script(binary: URL(fileURLWithPath: "/a"), root: URL(fileURLWithPath: "/"), team: "bad\"team", codeHash: "abc"))
    }

    func testDeletionRevalidatesTheVolumeAndConfirmsTheSnapshotIsGone() async throws {
        let snapshot = try XCTUnwrap(DiskMaintenance.decodeSnapshots(snapshotPlist()).first)
        let inventory = SnapshotInventory(volume: sampleVolume, snapshots: [snapshot], available: nil, purgeable: nil, measuredAt: Date())
        let runner = ScriptedMaintenanceRunner([try volumePlist(), try snapshotPlist(), Data(), try volumePlist(), try emptySnapshots()])
        let recovery = try await DiskMaintenance.delete(snapshot, from: inventory, run: { try await runner.run($0) })
        XCTAssertTrue(recovery.after.snapshots.isEmpty)
        let calls = await runner.calls
        XCTAssertEqual(calls.filter(\.needsAdministrator).count, 1)
        XCTAssertEqual(calls[2].arguments, ["apfs", "deleteSnapshot", "disk9s2", "-uuid", snapshot.id.uuidString, "-wait"])
    }

    func testAReplacedVolumeOrChangedSnapshotNeverReachesAuthorization() async throws {
        let snapshot = try XCTUnwrap(DiskMaintenance.decodeSnapshots(snapshotPlist()).first)
        let inventory = SnapshotInventory(volume: sampleVolume, snapshots: [snapshot], available: nil, purgeable: nil, measuredAt: Date())
        let replaced = ScriptedMaintenanceRunner([try volumePlist(uuid: "88888888-8888-8888-8888-888888888888"), try snapshotPlist()])
        do {
            _ = try await DiskMaintenance.delete(snapshot, from: inventory, run: { try await replaced.run($0) })
            XCTFail("A replaced disk must not be changed")
        } catch { XCTAssertTrue(error.localizedDescription.contains("changed")) }
        let replacedCalls = await replaced.calls
        XCTAssertTrue(replacedCalls.allSatisfy { !$0.needsAdministrator })
        let changed = ScriptedMaintenanceRunner([try volumePlist(), try snapshotPlist(purgeable: false)])
        do {
            _ = try await DiskMaintenance.delete(snapshot, from: inventory, run: { try await changed.run($0) })
            XCTFail("A snapshot that became protected must not be changed")
        } catch { XCTAssertTrue(error.localizedDescription.contains("changed")) }
        let changedCalls = await changed.calls
        XCTAssertTrue(changedCalls.allSatisfy { !$0.needsAdministrator })
    }

    func testACommandSucceedingWithoutRemovingSnapshotIsNotSuccess() async throws {
        let snapshot = try XCTUnwrap(DiskMaintenance.decodeSnapshots(snapshotPlist()).first)
        let inventory = SnapshotInventory(volume: sampleVolume, snapshots: [snapshot], available: nil, purgeable: nil, measuredAt: Date())
        let runner = ScriptedMaintenanceRunner([try volumePlist(), try snapshotPlist(), Data(), try volumePlist(), try snapshotPlist()])
        do {
            _ = try await DiskMaintenance.delete(snapshot, from: inventory, run: { try await runner.run($0) })
            XCTFail("A snapshot still on the disk must not be reported removed")
        } catch { XCTAssertTrue(error.localizedDescription.contains("still present")) }
    }

    func testThinningRefusesWhenOnlyProtectedSnapshotsRemain() async throws {
        let inventory = SnapshotInventory(volume: sampleVolume, snapshots: [], available: nil, purgeable: nil, measuredAt: Date())
        let runner = ScriptedMaintenanceRunner([try volumePlist(), try snapshotPlist(purgeable: false)])
        do {
            _ = try await DiskMaintenance.thin(inventory, requestedBytes: 4096, run: { try await runner.run($0) })
            XCTFail("There is no purgeable Time Machine snapshot")
        } catch { XCTAssertTrue(error.localizedDescription.contains("No purgeable")) }
        let calls = await runner.calls
        XCTAssertTrue(calls.allSatisfy { !$0.needsAdministrator })
    }

    func testAuthorizedScriptCompilesWithoutRunningIt() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let source = directory.appendingPathComponent("authorization.applescript")
        let command = try DiskMaintenance.thinningCommand(volume: sampleVolume, requestedBytes: 4096)
        let administrator = try AdministratorScan.script(binary: URL(fileURLWithPath: "/Applications/Pith's.app/Contents/MacOS/storage-scanner"), root: URL(fileURLWithPath: "/Users/me/$test"), team: "ABCDE12345", codeHash: String(repeating: "a", count: 40))
        for script in [command.authorizedShell, administrator] {
            try MaintenanceProcess.appleScript(script).write(to: source, atomically: true, encoding: .utf8)
            _ = try await MaintenanceProcess.run(MaintenanceCommand(executable: "/usr/bin/osacompile", arguments: ["-o", directory.appendingPathComponent("compiled.scpt").path, source.path]))
            XCTAssertTrue(FileManager.default.fileExists(atPath: directory.appendingPathComponent("compiled.scpt").path))
            let shell = directory.appendingPathComponent("authorized.sh")
            try script.write(to: shell, atomically: true, encoding: .utf8)
            _ = try await MaintenanceProcess.run(MaintenanceCommand(executable: "/bin/sh", arguments: ["-n", shell.path]))
        }
    }

    func testReadOnlyInspectionOfTheStartupDataVolume() async throws {
        let root = try DiskMaintenance.volumeRoot(for: "/", mounts: MountTable.kernelOnly())
        let inventory = try await DiskMaintenance.inspect(root: root)
        XCTAssertEqual(inventory.volume.root, root)
        XCTAssertNotNil(UUID(uuidString: inventory.volume.uuid))
        XCTAssertEqual(Set(inventory.snapshots.map(\.id)).count, inventory.snapshots.count)
    }

    private var sampleVolume: MaintenanceVolume { MaintenanceVolume(device: "disk9s2", root: "/Volumes/Test", name: "Test", uuid: "99999999-9999-9999-9999-999999999999") }
    private func plist(_ object: [String: String]) throws -> Data { try PropertyListSerialization.data(fromPropertyList: object, format: .xml, options: 0) }
    private func volumePlist(uuid: String = "99999999-9999-9999-9999-999999999999") throws -> Data {
        try plist(["DeviceIdentifier": "disk9s2", "FilesystemType": "apfs", "MountPoint": "/Volumes/Test", "VolumeName": "Test", "VolumeUUID": uuid])
    }
    private func snapshotPlist(purgeable: Bool = true) throws -> Data {
        try PropertyListSerialization.data(fromPropertyList: ["Snapshots": [["Name": "com.apple.TimeMachine.2026-11-12-120000.local", "SnapshotUUID": "11111111-1111-1111-1111-111111111111", "Purgeable": purgeable]]], format: .xml, options: 0)
    }
    private func emptySnapshots() throws -> Data { try PropertyListSerialization.data(fromPropertyList: ["Snapshots": []], format: .xml, options: 0) }
}

private actor ScriptedMaintenanceRunner {
    var calls: [MaintenanceCommand] = []
    private var responses: [Data]
    init(_ responses: [Data]) { self.responses = responses }
    func run(_ command: MaintenanceCommand) throws -> MaintenanceOutput {
        calls.append(command)
        guard !responses.isEmpty else { throw DiskFailure("Unexpected maintenance command in test") }
        return MaintenanceOutput(data: responses.removeFirst())
    }
}
