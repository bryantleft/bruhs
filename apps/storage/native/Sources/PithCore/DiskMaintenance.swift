import Foundation

public struct APFSSnapshot: Identifiable, Equatable, Sendable {
    public let id: UUID
    public let name: String
    public let purgeable: Bool?
    public var date: String? {
        let prefix = "com.apple.TimeMachine."
        guard name.hasPrefix(prefix) else { return nil }
        let suffix = String(name.dropFirst(prefix.count))
        let date = String(suffix.prefix(17))
        guard date.range(of: #"^\d{4}-\d{2}-\d{2}-\d{6}$"#, options: .regularExpression) != nil,
              [date, date + ".local", date + ".backup"].contains(suffix) else { return nil }
        return date
    }
    public var canDelete: Bool { date != nil && purgeable == true }
    public var protection: String? {
        if name.hasPrefix("com.apple.os.update") { return "A macOS system snapshot. Pith leaves it in place." }
        if date == nil { return "Managed by another app or macOS. Use the app that created it." }
        if purgeable != true { return "macOS has not marked this snapshot purgeable. Pith leaves it in place." }
        return nil
    }
}

public struct MaintenanceVolume: Equatable, Sendable {
    public let device: String
    public let root: String
    public let name: String
    public let uuid: String
    public init(device: String, root: String, name: String, uuid: String) {
        self.device = device; self.root = root; self.name = name; self.uuid = uuid
    }
}

/// Arguments remain separate until the one native authorization boundary quotes them. There is no arbitrary command
/// entry point in the UI; the only authorized commands are the plans built below and the verified scanner.
public struct MaintenanceCommand: Equatable, Sendable {
    public let executable: String
    public let arguments: [String]
    public let needsAdministrator: Bool
    public let expectedVolume: MaintenanceVolume?
    init(executable: String, arguments: [String], needsAdministrator: Bool = false, expectedVolume: MaintenanceVolume? = nil) {
        self.executable = executable; self.arguments = arguments; self.needsAdministrator = needsAdministrator; self.expectedVolume = expectedVolume
    }
    public var shell: String { ([executable] + arguments).map(Self.quote).joined(separator: " ") }
    /// Checked inside the authorized process, after the person answers its prompt. A disk can be unplugged and another
    /// mounted at the same path while that prompt is open; rechecking only before authorization cannot protect it.
    public var authorizedShell: String {
        guard let volume = expectedVolume else { return shell }
        return """
        set -eu
        actual=$(/usr/sbin/diskutil info -plist \(Self.quote(volume.root)) | /usr/bin/plutil -extract VolumeUUID raw -o - -)
        if [ "$actual" != \(Self.quote(volume.uuid)) ]; then
            /usr/bin/printf '%s\\n' 'The disk changed while authorization was open. Refresh Disk Tools and try again.' >&2
            exit 1
        fi
        exec \(shell)
        """
    }
    public static func quote(_ value: String) -> String { "'" + value.replacingOccurrences(of: "'", with: "'\\''") + "'" }
}

public struct MaintenanceOutput: Sendable {
    public let data: Data
    public let diagnostic: String
    public init(data: Data, diagnostic: String = "") { self.data = data; self.diagnostic = diagnostic }
}

public struct SnapshotInventory: Equatable, Sendable {
    public let volume: MaintenanceVolume
    public let snapshots: [APFSSnapshot]
    public let available: UInt64?
    public let purgeable: UInt64?
    public let measuredAt: Date

    public init(volume: MaintenanceVolume, snapshots: [APFSSnapshot], available: UInt64?, purgeable: UInt64?, measuredAt: Date) {
        self.volume = volume; self.snapshots = snapshots; self.available = available; self.purgeable = purgeable; self.measuredAt = measuredAt
    }
}

public struct MaintenanceRecovery: Sendable {
    public let before: SnapshotInventory
    public let after: SnapshotInventory
    /// Observed change, not a claim that this operation caused every byte: other apps can write meanwhile.
    public var availableChange: Int64? {
        guard let before = before.available, let after = after.available,
              before <= UInt64(Int64.max), after <= UInt64(Int64.max) else { return nil }
        return Int64(after) - Int64(before)
    }
}

public enum DiskMaintenance {
    public typealias Run = @Sendable (MaintenanceCommand) async throws -> MaintenanceOutput

    public static func volumeRoot(for path: String, mounts: MountTable) throws -> String {
        guard path.hasPrefix("/"), !path.utf8.contains(0),
              let mount = mounts.mounts.filter({ DiskChanges.isInside(path, $0.path) }).max(by: { $0.path.count < $1.path.count }),
              mount.isLocal, mount.from.hasPrefix("/dev/disk") else {
            throw DiskFailure("Disk tools need a mounted local disk. Choose a local disk or a folder on one.")
        }
        // The sealed startup snapshot has no user backups to thin. Time Machine keeps those on its data volume.
        if mount.path == "/", mounts.mounts.contains(where: { $0.path == "/System/Volumes/Data" }) { return "/System/Volumes/Data" }
        return mount.path
    }

    public static func decodeVolume(_ data: Data) throws -> MaintenanceVolume {
        struct Info: Decodable {
            let DeviceIdentifier: String
            let FilesystemType: String
            let MountPoint: String
            let VolumeName: String?
            let VolumeUUID: String?
        }
        let info = try PropertyListDecoder().decode(Info.self, from: data)
        guard info.FilesystemType == "apfs" else { throw DiskFailure("Snapshot tools are available for APFS disks. This disk uses \(info.FilesystemType).") }
        guard info.DeviceIdentifier.range(of: #"^disk\d+s\d+$"#, options: .regularExpression) != nil,
              info.MountPoint.hasPrefix("/"), !info.MountPoint.utf8.contains(0), let uuid = info.VolumeUUID, UUID(uuidString: uuid) != nil else {
            throw DiskFailure("macOS did not return a valid mounted APFS volume identity. Refresh Disk Tools after reconnecting the disk.")
        }
        return MaintenanceVolume(device: info.DeviceIdentifier, root: info.MountPoint, name: info.VolumeName ?? info.MountPoint, uuid: uuid)
    }

    public static func decodeSnapshots(_ data: Data) throws -> [APFSSnapshot] {
        struct Entry: Decodable { let SnapshotUUID: String; let Name: String; let Purgeable: Bool? }
        struct List: Decodable { let Snapshots: [Entry] }
        let entries = try PropertyListDecoder().decode(List.self, from: data).Snapshots
        var seen: Set<UUID> = []
        return try entries.map { entry in
            guard let id = UUID(uuidString: entry.SnapshotUUID), seen.insert(id).inserted, !entry.Name.isEmpty else {
                throw DiskFailure("macOS returned an invalid or repeated snapshot identity. Refresh Disk Tools before making changes.")
            }
            return APFSSnapshot(id: id, name: entry.Name, purgeable: entry.Purgeable)
        }.sorted { $0.name > $1.name }
    }

    public static func inspect(root: String, run: Run = MaintenanceProcess.run) async throws -> SnapshotInventory {
        let info = try await run(MaintenanceCommand(executable: "/usr/sbin/diskutil", arguments: ["info", "-plist", root]))
        let volume = try decodeVolume(info.data)
        let listed = try await run(MaintenanceCommand(executable: "/usr/sbin/diskutil", arguments: ["apfs", "listSnapshots", "-plist", volume.device]))
        let snapshots = try decodeSnapshots(listed.data)
        let (available, important): (UInt64?, UInt64?) = await Task.detached(priority: .utility) {
            let capacity = try? URL(fileURLWithPath: volume.root).resourceValues(forKeys: [.volumeAvailableCapacityKey, .volumeAvailableCapacityForImportantUsageKey])
            return (capacity?.volumeAvailableCapacity.flatMap { $0 >= 0 ? UInt64($0) : nil },
                    capacity?.volumeAvailableCapacityForImportantUsage.flatMap { $0 >= 0 ? UInt64($0) : nil })
        }.value
        let purgeable = available.flatMap { available in important.map { $0.saturatingSubtract(available) } }
        return SnapshotInventory(volume: volume, snapshots: snapshots, available: available, purgeable: purgeable, measuredAt: Date())
    }

    public static func deletionCommand(volume: MaintenanceVolume, snapshot: APFSSnapshot) throws -> MaintenanceCommand {
        guard snapshot.canDelete else { throw DiskFailure(snapshot.protection ?? "This snapshot cannot be deleted by Pith.") }
        return MaintenanceCommand(executable: "/usr/sbin/diskutil", arguments: ["apfs", "deleteSnapshot", volume.device, "-uuid", snapshot.id.uuidString, "-wait"], needsAdministrator: true, expectedVolume: volume)
    }

    public static func thinningCommand(volume: MaintenanceVolume, requestedBytes: UInt64) throws -> MaintenanceCommand {
        guard requestedBytes > 0 else { throw DiskFailure("Choose a positive amount of space to request from local Time Machine snapshots.") }
        // tmutil(8) accepts a byte target and uses its own default urgency when none is supplied.
        return MaintenanceCommand(executable: "/usr/bin/tmutil", arguments: ["thinlocalsnapshots", volume.root, String(requestedBytes)], needsAdministrator: true, expectedVolume: volume)
    }

    public static func delete(_ snapshot: APFSSnapshot, from inventory: SnapshotInventory, run: Run = MaintenanceProcess.run) async throws -> MaintenanceRecovery {
        let current = try await inspect(root: inventory.volume.root, run: run)
        guard current.volume == inventory.volume,
              let latest = current.snapshots.first(where: { $0.id == snapshot.id }), latest == snapshot else {
            throw DiskFailure("The disk or snapshot changed since you reviewed it. Refresh Disk Tools and choose the snapshot again.")
        }
        _ = try await run(deletionCommand(volume: current.volume, snapshot: latest))
        let after = try await inspect(root: current.volume.root, run: run)
        guard after.volume == current.volume else { throw DiskFailure("The disk changed while its snapshot was being removed. Reconnect the original disk and refresh Disk Tools.") }
        guard !after.snapshots.contains(where: { $0.id == snapshot.id }) else { throw DiskFailure("The snapshot is still present after macOS finished the deletion command. Refresh Disk Tools and try again.") }
        return MaintenanceRecovery(before: current, after: after)
    }

    public static func thin(_ inventory: SnapshotInventory, requestedBytes: UInt64, run: Run = MaintenanceProcess.run) async throws -> MaintenanceRecovery {
        let current = try await inspect(root: inventory.volume.root, run: run)
        guard current.volume == inventory.volume else { throw DiskFailure("The disk changed since you reviewed it. Refresh Disk Tools before recovering space.") }
        guard current.snapshots.contains(where: \.canDelete) else { throw DiskFailure("No purgeable local Time Machine snapshots remain on this disk. macOS manages the other purgeable space itself.") }
        _ = try await run(thinningCommand(volume: current.volume, requestedBytes: requestedBytes))
        let after = try await inspect(root: current.volume.root, run: run)
        guard after.volume == current.volume else { throw DiskFailure("The disk changed while macOS was thinning snapshots. Reconnect the original disk and refresh Disk Tools.") }
        return MaintenanceRecovery(before: current, after: after)
    }
}

/// Process output is drained concurrently so a whole-disk scan or a long diagnostic cannot fill a pipe and deadlock.
public enum MaintenanceProcess {
    public static func run(_ command: MaintenanceCommand) async throws -> MaintenanceOutput {
        let executable: String, arguments: [String]
        if command.needsAdministrator {
            executable = "/usr/bin/osascript"
            arguments = ["-e", appleScript(command.authorizedShell)]
        } else { executable = command.executable; arguments = command.arguments }
        return try await execute(executable: executable, arguments: arguments)
    }

    static func authorizedScript(_ shell: String) async throws -> MaintenanceOutput {
        try await execute(executable: "/usr/bin/osascript", arguments: ["-e", appleScript(shell)])
    }

    static func appleScript(_ shell: String) -> String {
        let literal = shell.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"").replacingOccurrences(of: "\n", with: "\\n").replacingOccurrences(of: "\r", with: "\\r")
        return "do shell script \"\(literal)\" with administrator privileges without altering line endings"
    }

    private static func execute(executable: String, arguments: [String]) async throws -> MaintenanceOutput {
        let process = Process(), stdout = Pipe(), stderr = Pipe()
        process.executableURL = URL(fileURLWithPath: executable); process.arguments = arguments
        process.standardOutput = stdout; process.standardError = stderr
        process.standardInput = FileHandle.nullDevice
        let (stream, continuation) = AsyncStream<Int32>.makeStream(bufferingPolicy: .bufferingNewest(1))
        process.terminationHandler = { process in continuation.yield(process.terminationStatus); continuation.finish() }
        do { try process.run() } catch { continuation.finish(); throw DiskFailure("Could not start \((executable as NSString).lastPathComponent): \(error.localizedDescription)") }
        let output = Task.detached { stdout.fileHandleForReading.readDataToEndOfFile() }
        let errors = Task.detached { stderr.fileHandleForReading.readDataToEndOfFile() }
        // Authorized operations are deliberately allowed to finish: terminating osascript cannot reliably cancel the
        // already authorized root process. The view keeps its progress visible and disables a second operation.
        var status: Int32 = -1
        for await value in stream { status = value }
        let data = await output.value, diagnostic = String(decoding: await errors.value, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
        try? stdout.fileHandleForReading.close(); try? stderr.fileHandleForReading.close()
        guard status == 0 else {
            if diagnostic.contains("(-128)") { throw DiskFailure("Administrator authorization was cancelled. Nothing else was requested.") }
            let details = diagnostic.isEmpty ? String(decoding: data, as: UTF8.self) : diagnostic
            throw DiskFailure("\((executable as NSString).lastPathComponent) could not complete the operation (exit \(status)). \(details)")
        }
        return MaintenanceOutput(data: data, diagnostic: diagnostic)
    }
}
