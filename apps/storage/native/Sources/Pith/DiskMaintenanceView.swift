import AppKit
import Observation
import PithCore
import SwiftUI

@MainActor @Observable final class DiskMaintenanceModel {
    enum Work: Equatable { case idle, loading, deleting(UUID), thinning, scanning }
    enum Confirmation: Identifiable {
        case snapshot(APFSSnapshot), thin(UInt64), administrator
        var id: String {
            switch self { case .snapshot(let snapshot): snapshot.id.uuidString; case .thin: "thin"; case .administrator: "administrator" }
        }
    }

    let root: String
    let binary: URL
    private(set) var work = Work.idle { didSet { busyChanged(work != .idle) } }
    private(set) var inventory: SnapshotInventory?
    private(set) var problem: String?
    private(set) var notice: String?
    private(set) var administratorUnavailable: String? = "Checking Pith's signature…"
    var confirmation: Confirmation?
    private let changed: @MainActor () -> Void
    private let scanned: @MainActor (DiskResult, Date) -> Void
    private let busyChanged: @MainActor (Bool) -> Void

    init(root: String, binary: URL, changed: @escaping @MainActor () -> Void, scanned: @escaping @MainActor (DiskResult, Date) -> Void,
         busyChanged: @escaping @MainActor (Bool) -> Void = { _ in }) {
        self.root = root; self.binary = binary; self.changed = changed; self.scanned = scanned
        self.busyChanged = busyChanged
    }

    var isBusy: Bool { work != .idle }

    func load() async {
        guard !isBusy else { return }
        work = .loading; problem = nil
        defer { work = .idle }
        if Launch.isAutomated {
            administratorUnavailable = "Automated runs never request administrator access or change snapshots."
            if inventory == nil { problem = "Disk Tools do not inspect or change your disks during an automated run." }
            return
        }
        let binary = binary
        administratorUnavailable = await Task.detached(priority: .userInitiated) { AdministratorScan.availability(binary: binary) }.value
        do {
            let volume = try DiskMaintenance.volumeRoot(for: root, mounts: MountTable.kernelOnly())
            inventory = try await DiskMaintenance.inspect(root: volume)
        } catch { inventory = nil; problem = error.localizedDescription }
    }

    func perform(_ action: Confirmation) async {
        guard !isBusy, !Launch.isAutomated else { return }
        problem = nil; notice = nil
        defer { work = .idle }
        do {
            switch action {
            case .snapshot(let snapshot):
                guard let inventory else { throw DiskFailure("Refresh Disk Tools before choosing a snapshot.") }
                work = .deleting(snapshot.id)
                show(try await DiskMaintenance.delete(snapshot, from: inventory))
            case .thin(let bytes):
                guard let inventory else { throw DiskFailure("Refresh Disk Tools before recovering snapshot space.") }
                work = .thinning
                show(try await DiskMaintenance.thin(inventory, requestedBytes: bytes))
            case .administrator:
                guard administratorUnavailable == nil else { throw DiskFailure(administratorUnavailable ?? "Administrator scanning is unavailable.") }
                _ = try DiskMaintenance.volumeRoot(for: root, mounts: MountTable.kernelOnly())
                work = .scanning
                let started = Date()
                let result = try await AdministratorScan.scan(binary: binary, root: URL(fileURLWithPath: root))
                scanned(result, started)
                notice = "The administrator scan is ready. Full Disk Access is still needed for personal folders macOS protects."
            }
        } catch { problem = error.localizedDescription }
    }

    private func show(_ recovery: MaintenanceRecovery) {
        inventory = recovery.after
        if let change = recovery.availableChange {
            notice = change > 0 ? "Free space increased by \(bytes(UInt64(change))). Other apps may have changed the disk meanwhile."
                : change == 0 ? "macOS finished. Free space has not increased yet. Shared blocks or other writes can affect it."
                : "macOS finished. Free space decreased by \(bytes(UInt64(-change))) while it ran. Other apps may have written to the disk."
        } else { notice = "macOS finished. Pith could not measure the change in free space. Refresh Disk to check it." }
        changed()
    }

    func smokeTestShows(_ inventory: SnapshotInventory) {
        guard Launch.isAutomated else { return }
        self.inventory = inventory
        administratorUnavailable = "Automated runs never request administrator access or change snapshots."
    }
}

/// A native sheet for explicit disk operations. The live map stays an ordinary user process; administrator access
/// applies to the one scan requested here, and snapshot operations each have their own review and confirmation.
struct DiskMaintenanceView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var model: DiskMaintenanceModel

    init(model: DiskMaintenanceModel) { _model = State(initialValue: model) }

    init(root: String, binary: URL, changed: @escaping @MainActor () -> Void, scanned: @escaping @MainActor (DiskResult, Date) -> Void,
         busyChanged: @escaping @MainActor (Bool) -> Void = { _ in }) {
        _model = State(initialValue: DiskMaintenanceModel(root: root, binary: binary, changed: changed, scanned: scanned, busyChanged: busyChanged))
    }

    var body: some View {
        VStack(spacing: 0) {
            DiskToolHeader(title: "Disk Tools", subtitle: model.inventory?.volume.name ?? model.root, close: { if !model.isBusy { dismiss() } })
                .disabled(model.isBusy)
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if model.isBusy {
                        HStack(spacing: 8) { ProgressView().controlSize(.small); Text(progress).font(BruhsType.body) }
                            .accessibilityElement(children: .combine)
                    }
                    if let problem = model.problem { message(problem, symbol: "exclamationmark.triangle", tint: BruhsColor.statusWarning) }
                    if let notice = model.notice { message(notice, symbol: "info.circle", tint: BruhsColor.textSecondary) }
                    Button("Refresh") { Task { await model.load() } }.buttonStyle(.bruhsSoft).disabled(model.isBusy)
                    if let inventory = model.inventory { snapshotSection(inventory) }
                    administratorSection
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(width: 600, height: 560)
        .background(BruhsColor.canvas)
        .tint(BruhsColor.accent)
        .interactiveDismissDisabled(model.isBusy)
        .task { await model.load() }
        .alert(item: $model.confirmation) { action in
            Alert(title: Text(confirmationTitle(action)), message: Text(confirmationMessage(action)),
                  primaryButton: confirmationAction(action), secondaryButton: .cancel())
        }
    }

    private var progress: String {
        switch model.work {
        case .idle: ""
        case .loading: "Reading disk information…"
        case .deleting: "Removing the selected local snapshot…"
        case .thinning: "macOS is thinning local Time Machine snapshots…"
        case .scanning: "Scanning as administrator. This can take a few minutes…"
        }
    }

    @ViewBuilder private func snapshotSection(_ inventory: SnapshotInventory) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("Local snapshots", systemImage: "clock.arrow.circlepath").font(BruhsType.label)
                Spacer()
                Text(inventory.volume.name).font(BruhsType.bodySmall).foregroundStyle(BruhsColor.textSecondary)
            }
            Text("Local backups share blocks with your files and with each other, so their individual sizes cannot be added. macOS normally removes old Time Machine snapshots when it needs space.")
                .font(BruhsType.note).foregroundStyle(BruhsColor.textSecondary).fixedSize(horizontal: false, vertical: true)
            if inventory.snapshots.isEmpty {
                Text("No APFS snapshots on this volume.").font(BruhsType.body).foregroundStyle(BruhsColor.textSecondary)
            }
            ForEach(inventory.snapshots) { snapshot in
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text(snapshot.name).font(BruhsType.bodySmall).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                        if snapshot.canDelete {
                            Button("Delete…") { model.confirmation = .snapshot(snapshot) }.font(BruhsType.control).disabled(model.isBusy)
                                .accessibilityLabel("Delete snapshot \(snapshot.name)")
                        }
                    }
                    if let protection = snapshot.protection {
                        Text(protection).font(BruhsType.note).foregroundStyle(BruhsColor.textTertiary).fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.vertical, 4)
            }
            Divider()
            if let purgeable = inventory.purgeable {
                HStack {
                    Text("Purgeable according to macOS").font(BruhsType.body)
                    Spacer()
                    Text(bytes(purgeable)).font(BruhsType.data)
                }
                if purgeable > 0, inventory.snapshots.contains(where: \.canDelete) {
                    Button("Recover snapshot space…") { model.confirmation = .thin(purgeable) }.disabled(model.isBusy)
                }
            }
            Text("Recover snapshot space asks macOS to thin local Time Machine backups. It does not force removal of caches, cloud files, or other purgeable data, and may recover less than the figure above.")
                .font(BruhsType.note).foregroundStyle(BruhsColor.textSecondary).fixedSize(horizontal: false, vertical: true)
        }
    }

    private var administratorSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Scan as administrator", systemImage: "person.badge.key").font(BruhsType.label)
            Text("Read folders restricted by file permissions in a separate, one-time scan. Pith asks macOS for authorization and installs no background helper. Full Disk Access is still required for personal folders protected by macOS.")
                .font(BruhsType.note).foregroundStyle(BruhsColor.textSecondary).fixedSize(horizontal: false, vertical: true)
            if let reason = model.administratorUnavailable {
                Text(reason).font(BruhsType.note).foregroundStyle(BruhsColor.textTertiary).fixedSize(horizontal: false, vertical: true)
            }
            Button("Scan as Administrator…") { model.confirmation = .administrator }.disabled(model.isBusy || model.administratorUnavailable != nil)
        }
    }

    private func message(_ value: String, symbol: String, tint: Color) -> some View {
        Label { Text(value).fixedSize(horizontal: false, vertical: true) } icon: { Image(systemName: symbol) }
            .font(BruhsType.body).foregroundStyle(tint)
    }

    private func confirmationTitle(_ action: DiskMaintenanceModel.Confirmation) -> String {
        switch action { case .snapshot: "Delete this local backup?"; case .thin: "Thin local Time Machine backups?"; case .administrator: "Scan this folder as administrator?" }
    }

    private func confirmationMessage(_ action: DiskMaintenanceModel.Confirmation) -> String {
        switch action {
        case .snapshot(let snapshot): "\(snapshot.name) will be permanently removed from this volume. You will lose this local restore point. Files on your backup disk are unchanged. This cannot be undone."
        case .thin(let target): "macOS will choose local Time Machine snapshots to remove, requesting up to \(bytes(target)) of space. Those local restore points cannot be restored. It may free less because blocks are shared."
        case .administrator: "Pith will ask macOS for administrator authorization to read \(model.root). The scan runs until it finishes; closing the authorization prompt cancels it before it starts."
        }
    }

    private func confirmationButton(_ action: DiskMaintenanceModel.Confirmation) -> String {
        switch action { case .snapshot: "Delete Snapshot"; case .thin: "Thin Snapshots"; case .administrator: "Continue" }
    }

    private func confirmationAction(_ action: DiskMaintenanceModel.Confirmation) -> Alert.Button {
        let perform = { Task { await model.perform(action) }; return () }
        if case .administrator = action { return .default(Text(confirmationButton(action)), action: perform) }
        return .destructive(Text(confirmationButton(action)), action: perform)
    }
}
