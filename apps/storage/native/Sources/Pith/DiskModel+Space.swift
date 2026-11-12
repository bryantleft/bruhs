import Foundation
import PithCore

/// Where a whole volume's space went: its own figures, measured for each map that goes out and set against it, and
/// what "Where the space is" and the map's Not measured block show of them.
extension DiskModel {
    /// The used space the scan couldn't measure on the volume the map shows, which the map's page draws as its Not
    /// measured block at `root`, and all the volume's used space, which the root's shares are then of: the figures
    /// "Where the space is" gives as Not measured and Used on this disk.
    struct NotMeasured: Equatable {
        let root: String
        let bytes: UInt64
        let used: UInt64
    }

    /// What the map's page draws as Not measured, only for a map of a whole volume: the live map of the startup disk, or
    /// a scan of a volume's root.
    var notMeasured: NotMeasured? {
        guard let accounting, let bytes = accounting.notMeasuredBlock else { return nil }
        return NotMeasured(root: accounting.root, bytes: bytes, used: accounting.used)
    }

    /// "Where the space is" for a map of a whole volume, row by row, the Trash's from the map when the map can read it and
    /// the Trash holds something (`trashIsEmpty`).
    var spaceRows: [SpaceRow]? {
        accounting.map { $0.rows(result: result, trash: trashOnMap, trashIsEmpty: trashIsEmpty, disk: volumeKey(for: $0.root)) }
    }

    /// The Trash's size as the map shows it, when the map can read the Trash: on the live map, the figure Places gives
    /// it, from the map's tree or its index, and in a scan, its folder's in the tree. Nil when the map can't read it or
    /// doesn't hold it. Pith never reads the Trash itself.
    var trashOnMap: UInt64? {
        guard let trash = sideColumn.places.place(id: "trash") else { return nil }
        if let table = placesTable { return table.places.first { $0.id == trash.id }?.size }
        // A folder the map couldn't read is no folder of the tree's.
        return result?.root.folder(at: trash.path)?.size
    }

    /// The map's Not measured block was clicked: "Where the space is" says what it holds and why. A scan under way leaves
    /// the map it was drawn from on screen, and the link with it, so it shows that map's accounting.
    func explainNotMeasured() {
        guard spaceRows != nil else { return }
        showsWhereTheSpaceIs = true
    }

    /// A whole volume's own figures for a map of `root`, and when they were last all measured.
    struct VolumeFigures {
        let root: String
        let use: VolumeUse
        let allMeasured: Date
    }

    /// The volume's own figures for a map of `root` about to go out, measured off the main thread, so the map and its
    /// Not measured go out together, measured for it: its space, which the file system gives at once, and its snapshots
    /// and what's purgeable too when `full`, when the figures held are another root's or none, or when they're five
    /// minutes old. Nil for a map of a folder, which nothing can account for.
    func figures(for root: String, full: Bool = false) async -> VolumeFigures? {
        let measures = measures, measuresSpace = measuresSpace
        if !full, let held = volumeUse, held.root == root, Date().timeIntervalSince(held.allMeasured) < 300 {
            let space = await Task.detached(priority: .utility) { measuresSpace(root) }.value
            return VolumeFigures(root: root, use: space.map(held.use.with) ?? held.use, allMeasured: held.allMeasured)
        }
        let measured = Date()
        let use = await Task.detached(priority: .utility) { measures(root) }.value
        return use.map { VolumeFigures(root: root, use: $0, allMeasured: measured) }
    }

    /// Measures all the volume's own figures again and sets them against the map shown, without a new map. Every map goes
    /// out with figures measured for it; the smoke test calls this when it gives figures of its own, and when it takes
    /// them back.
    func refreshAccounting() {
        guard let root = result?.root.path else { volumeUse = nil; return }
        Task {
            let figures = await self.figures(for: root, full: true)
            guard self.result?.root.path == root else { return }
            volumeUse = figures
        }
    }

    /// The figures of the volume at `root` when `root` is a volume's root: its used space and that of the volumes a walk
    /// enters, what's purgeable, and `tmutil`'s count of its local snapshots.
    nonisolated static func measure(_ root: String) -> VolumeUse? {
        guard let space = measureSpace(root) else { return nil }
        let keys: Set<URLResourceKey> = [.volumeAvailableCapacityKey, .volumeAvailableCapacityForImportantUsageKey]
        let values = try? URL(fileURLWithPath: root).resourceValues(forKeys: keys)
        let available = values?.volumeAvailableCapacity.map { UInt64(max(0, $0)) }
        let important = values?.volumeAvailableCapacityForImportantUsage.map { UInt64(max(0, $0)) }
        let purgeable = important.flatMap { important in available.map { important.saturatingSubtract($0) } }
        return VolumeUse(space, snapshots: localSnapshots(root), purgeable: purgeable)
    }

    /// The space of the volume at `root` when `root` is a volume's root, which `statfs` and `getattrlist` give at once:
    /// its container's used space and that of the volumes a walk enters.
    nonisolated static func measureSpace(_ root: String) -> VolumeUse.Space? {
        let keys: Set<URLResourceKey> = [.volumeURLKey, .volumeTotalCapacityKey, .volumeAvailableCapacityKey]
        guard let values = try? URL(fileURLWithPath: root).resourceValues(forKeys: keys),
              let walked = DiskAccounting.walkedVolumes(root: root, mountPoint: values.volume?.path),
              let total = values.volumeTotalCapacity, let available = values.volumeAvailableCapacity else { return nil }
        let volumes = walked.compactMap(VolumeSpace.used)
        guard volumes.count == walked.count else { return nil }
        return VolumeUse.Space(used: UInt64(max(0, total - available)), walkedVolumes: volumes)
    }

    /// Local Time Machine snapshots on a volume, from `tmutil`, which lists them without administrator access.
    nonisolated private static func localSnapshots(_ volume: String) -> Int? {
        let process = Process(), output = Pipe()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/tmutil")
        process.arguments = ["listlocalsnapshots", volume]
        process.standardOutput = output; process.standardError = FileHandle.nullDevice
        guard (try? process.run()) != nil else { return nil }
        let data = output.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else { return nil }
        return DiskAccounting.snapshotCount(tmutilOutput: String(decoding: data, as: UTF8.self))
    }
}
