import AppKit
import PithCore
import SwiftUI

/// Disposable inputs shared by the native layout audit and end-to-end cleanup checks.
@MainActor struct LocalToolsFixture {
    let folder: URL
    let root: URL
    let disk: DiskModel
    let report: CleanupReport
    let maintenance: DiskMaintenanceModel

    static func make(binary: URL) async throws -> Self {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("pith-local-tools-\(UUID().uuidString)")
        do {
            let root = folder.appendingPathComponent("Project"), generated = root.appendingPathComponent("node_modules")
            try FileManager.default.createDirectory(at: generated, withIntermediateDirectories: true)
            try Data("{}".utf8).write(to: root.appendingPathComponent("package.json"))
            try Data(repeating: 42, count: 1_000_000).write(to: generated.appendingPathComponent("dependency.bin"))
            try Data(repeating: 17, count: 2_000_000).write(to: root.appendingPathComponent("review.bin"))
            let map = try await ScannerRunner().scan(binary: binary, root: root) { _ in }
            let report = try await CleanupRunner().analyze(binary: binary, root: root)
            let local = DiskModel()
            local.result = map
            local.trashFolder = folder.appendingPathComponent("Trash")
            local.cleanup.root = root
            local.cleanup.inspection = .ready(report)
            let since = Date().addingTimeInterval(-3600)
            let items = [GrowthItem(path: generated.path, before: 0, current: 1_000_000, change: 1_000_000, isFolder: true, isRemoved: false)]
            local.smokeTestShowsGrowth([generated.path: 1_000_000], since: since, items: items)
            local.writers = { _ in .apps([DiskWriter(name: "Build tool", bytes: 1_000_000)], since: since) }
            let snapshots = try DiskMaintenance.decodeSnapshots(PropertyListSerialization.data(fromPropertyList: ["Snapshots": [
                ["Name": "com.apple.TimeMachine.2026-11-12-120000.local", "SnapshotUUID": "11111111-1111-1111-1111-111111111111", "Purgeable": true],
                ["Name": "com.apple.os.update-example", "SnapshotUUID": "22222222-2222-2222-2222-222222222222", "Purgeable": false],
            ]], format: .xml, options: 0))
            let maintenance = DiskMaintenanceModel(root: root.path, binary: binary, changed: {}, scanned: { _, _ in })
            maintenance.smokeTestShows(SnapshotInventory(volume: MaintenanceVolume(device: "disk99s1", root: root.path, name: "Disposable fixture", uuid: "33333333-3333-3333-3333-333333333333"),
                                                        snapshots: snapshots, available: 20_000_000, purgeable: 5_000_000, measuredAt: Date()))
            return Self(folder: folder, root: root, disk: local, report: report, maintenance: maintenance)
        } catch { try? FileManager.default.removeItem(at: folder); throw error }
    }
}

extension AppDelegate {
    func testLocalTools(report: URL) async {
        do {
            let checks = try await checkLocalCleanup()
            let data = try JSONSerialization.data(withJSONObject: checks, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: report, options: [.atomic])
            print(String(decoding: data, as: UTF8.self))
            if checks.values.contains(false) { exit(1) }
            NSApp.terminate(nil)
        } catch {
            let data = try? JSONSerialization.data(withJSONObject: ["error": error.localizedDescription], options: [.prettyPrinted, .sortedKeys])
            if let data { try? data.write(to: report, options: [.atomic]) }
            print("Local tools verification failed: \(error.localizedDescription)")
            exit(1)
        }
    }

    func captureLocalTools(_ fixture: LocalToolsFixture, scale: Double, look: String, appearance: NSAppearance.Name, folder: URL) async throws {
        let name = "\(Int(scale * 100))-\(look)", size = NSSize(width: 760, height: 600)
        _ = try await captureUI(CleanupView(disk: fixture.disk, model: fixture.disk.cleanup, root: fixture.root, close: {}),
                                name: "cleanup-\(name)", size: size, appearance: appearance, folder: folder)
        _ = try await captureUI(DiskGrowthView(disk: fixture.disk, root: fixture.root.path, close: {}),
                                name: "growth-\(name)", size: size, appearance: appearance, folder: folder)
        _ = try await captureUI(DiskMaintenanceView(model: fixture.maintenance), name: "disk-tools-\(name)", size: size, appearance: appearance, folder: folder)
        _ = try await captureUI(DiskMaintenanceView(model: fixture.maintenance), name: "disk-tools-bottom-\(name)", size: size, appearance: appearance, folder: folder, scrollToBottom: true)
        if fixture.disk.cleanupTrash.isEmpty,
           let candidate = fixture.report.candidates.first(where: { $0.risk == .review && $0.canMoveToTrash }) {
            let batch = try fixture.report.trashBatch(paths: [candidate.path], home: FileManager.default.homeDirectoryForCurrentUser).get()
            fixture.disk.trash(batch, undoManager: nil)
            try await waitUntil("the audit's isolated Trash move") { !fixture.disk.isTrashing }
        }
        _ = try await captureUI(FinishCleanupView(disk: fixture.disk, close: {}), name: "finish-cleanup-\(name)", size: size, appearance: appearance, folder: folder)
    }

    func checkLocalCleanup() async throws -> [String: Bool] {
        let fixture = try await LocalToolsFixture.make(binary: disk.binary)
        defer { try? FileManager.default.removeItem(at: fixture.folder) }
        let model = fixture.disk, cleanup = model.cleanup
        var checks: [String: Bool] = [:]
        guard let candidate = fixture.report.candidates.first(where: { $0.risk == .rebuildable }) else {
            throw DiskFailure("The packaged scanner did not recommend the fixture's generated dependencies.")
        }
        cleanup.toggle(candidate, selected: true)
        cleanup.measure(binary: disk.binary)
        try await waitUntil("cleanup's reclaimable-space measurement") { !cleanup.isMeasuring }
        checks["cleanup_uses_local_classifier_and_measures_shared_space"] = cleanup.measured?.bytes == candidate.allocatedBytes && cleanup.canMove
        cleanup.prepareMove()
        try await waitUntil("cleanup's protected-path check") { !cleanup.preparing }
        guard let batch = cleanup.confirmation else { throw DiskFailure(cleanup.problem ?? "Cleanup did not prepare the reviewed selection.") }
        checks["cleanup_prepares_reviewed_candidates_absent_from_pruned_map"] = batch.plans.count == 1 && batch.plans[0].target.lastPathComponent == "node_modules"
        let undo = UndoManager()
        model.trash(batch, undoManager: undo)
        try await waitUntil("cleanup's move to the isolated Trash") { !model.isTrashing }
        checks["cleanup_move_keeps_undo_and_invalidates_report"] = undo.canUndo && cleanup.needsCheck && model.cleanupTrash.count == 1
        model.undoTrash()
        try await waitUntil("cleanup's Undo") { !model.isTrashing }
        checks["cleanup_undo_restores_generated_folder"] = FileManager.default.fileExists(atPath: candidate.path) && model.cleanupTrash.isEmpty
        model.trash(batch, undoManager: undo)
        try await waitUntil("cleanup's second move") { !model.isTrashing }
        guard let group = model.cleanupTrash.last, let trash = model.trashFolder else { throw DiskFailure("The move was not available to finish cleanup.") }
        let unrelated = trash.appendingPathComponent("already-here.bin")
        try Data("keep".utf8).write(to: unrelated)
        model.finishCleanup(group)
        try await waitUntil("selective permanent cleanup") { !model.isFinishingCleanup }
        checks["cleanup_finishes_only_recorded_moves_and_discards_undo"] = model.cleanupTrash.isEmpty && !undo.canUndo
            && group.selection.paths.allSatisfy { !FileManager.default.fileExists(atPath: $0) }
            && FileManager.default.fileExists(atPath: unrelated.path)
            && model.cleanupFinishMessage?.hasPrefix("Permanently deleted") == true
        checks["disk_tools_automated_runs_cannot_authorize_changes"] = fixture.maintenance.administratorUnavailable != nil
        return checks
    }
}
