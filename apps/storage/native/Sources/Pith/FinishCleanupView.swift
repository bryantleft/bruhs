import PithCore
import SwiftUI

struct CleanupTrashGroup: Identifiable, Sendable {
    let record: TrashRecord
    let selection: CleanupTrashSelection
    var id: ObjectIdentifier { ObjectIdentifier(record) }
}

struct FinishCleanupView: View {
    let disk: DiskModel
    let close: () -> Void
    @State private var selected: ObjectIdentifier?

    private var group: CleanupTrashGroup? {
        disk.cleanupTrash.first { $0.id == selected } ?? disk.cleanupTrash.last
    }

    var body: some View {
        VStack(spacing: 0) {
            DiskToolHeader(title: "Finish Cleanup", subtitle: "Review only the items Pith moved. Other items in your Trash stay there.", close: close)
                .disabled(disk.isFinishingCleanup)
            if let message = disk.cleanupFinishMessage {
                Text(message).font(BruhsType.body).foregroundStyle(BruhsColor.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(16)
            }
            if disk.cleanupTrash.count > 1 {
                Picker("Move to review", selection: Binding(get: { group?.id }, set: { selected = $0 })) {
                    ForEach(disk.cleanupTrash) { group in
                        Text(group.selection.moves.map(\.plan.name).joined(separator: ", "))
                            .tag(Optional(group.id))
                    }
                }
                .font(BruhsType.body).padding(.horizontal, 16).padding(.bottom, 12)
                .disabled(disk.isTrashing)
            }
            Divider().overlay(BruhsColor.hairline)
            if let group {
                FinishCleanupSelection(disk: disk, group: group).id(group.id)
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    Text(disk.cleanupFinishMessage == nil ? "No verified items waiting" : "Review complete")
                        .font(BruhsType.title).foregroundStyle(BruhsColor.text)
                    Text("Review items here after Pith moves them to the Trash. If an item is no longer listed, you can review it in Finder.")
                        .font(BruhsType.body).foregroundStyle(BruhsColor.textSecondary)
                    Button("Open Trash in Finder") { NSWorkspace.shared.open(URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(".Trash")) }
                        .buttonStyle(.bruhsGhost)
                }
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                .padding(32)
            }
        }
        .background(BruhsColor.canvas).tint(BruhsColor.accent)
        .frame(width: 760, height: 600)
        .interactiveDismissDisabled(disk.isFinishingCleanup)
    }
}

private struct FinishCleanupSelection: View {
    let disk: DiskModel
    let group: CleanupTrashGroup
    @State private var measurement: DiskFrees?
    @State private var problem: String?
    @State private var measuring = true
    @State private var confirmsDeletion = false
    @State private var measuredAt: Date?
    @State private var refresh = UUID()

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    ForEach(group.selection.moves, id: \.plan.target.path) { move in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(move.plan.name).font(BruhsType.label).foregroundStyle(BruhsColor.text)
                            Text(move.plan.target.path).font(BruhsType.note).foregroundStyle(BruhsColor.textTertiary)
                                .textSelection(.enabled)
                            if let trash = move.trashed {
                                Button("Show in Trash") { disk.reveal([trash.path]) }.buttonStyle(.bruhsGhost)
                            }
                        }
                        .fixedSize(horizontal: false, vertical: true)
                        Divider().overlay(BruhsColor.hairline)
                    }
                }
                .padding(16)
            }
            .bruhsScrollers(inset: 6)
            Divider().overlay(BruhsColor.hairline)
            VStack(alignment: .leading, spacing: 12) {
                if measuring {
                    HStack(spacing: 8) {
                        BruhsSpinner(diameter: 14, lineWidth: 2)
                        Text("Measuring what these items can free…").font(BruhsType.body)
                    }
                } else if let measurement {
                    Text("\(bytes(measurement.bytes)) estimated reclaimable space")
                        .font(BruhsType.data).foregroundStyle(BruhsColor.text)
                    if let measuredAt {
                        Text("Measured \(measuredAt.formatted(date: .abbreviated, time: .shortened))")
                            .font(BruhsType.note).foregroundStyle(BruhsColor.textSecondary)
                    }
                    Text("Shared blocks and snapshots can retain some space. Every item is checked again before deletion.")
                        .font(BruhsType.note).foregroundStyle(BruhsColor.textSecondary)
                }
                if let problem {
                    Text(problem).font(BruhsType.body).foregroundStyle(BruhsColor.statusWarning)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: 12) {
                    if disk.isFinishingCleanup {
                        BruhsSpinner(diameter: 14, lineWidth: 2).accessibilityLabel("Permanently deleting reviewed items")
                        Text("Finishing cleanup…").font(BruhsType.body)
                    } else {
                        Button("Put Back") { disk.undos.undo(group.record) }
                            .buttonStyle(.bruhsGhost).disabled(disk.isTrashing || disk.isScanning)
                        Button("Measure Again") { refresh = UUID() }.buttonStyle(.bruhsGhost)
                            .disabled(measuring || disk.isTrashing)
                    }
                    Spacer(minLength: 12)
                    Button("Delete Permanently…", role: .destructive) { confirmsDeletion = true }
                        .buttonStyle(.bruhsSoftDanger)
                        .disabled(measuring || measurement == nil || measurement?.unreadable != 0 || disk.isTrashing || disk.isScanning)
                }
            }
            .padding(16)
        }
        .task(id: refresh) {
            measuring = true; measurement = nil; measuredAt = nil; problem = nil
            do {
                let frees = try await ScannerRunner.frees(binary: disk.binary, paths: group.selection.paths)
                guard !Task.isCancelled else { return }
                measurement = frees
                measuredAt = Date()
                if frees.unreadable > 0 { problem = "Pith couldn’t read all the contents. Review these items in Finder instead." }
            } catch {
                guard !Task.isCancelled else { return }
                problem = error.localizedDescription
            }
            measuring = false
        }
        .alert(group.selection.moves.count == 1 ? "Permanently delete this item?" : "Permanently delete these items?", isPresented: $confirmsDeletion) {
            Button("Cancel", role: .cancel) {}
            Button("Delete Permanently", role: .destructive) { disk.finishCleanup(group) }
        } message: {
            Text("Only the \(group.selection.moves.count.formatted()) reviewed \(group.selection.moves.count == 1 ? "item" : "items") Pith moved will be deleted. You cannot undo this. Other items in the Trash will stay there.")
        }
    }
}
