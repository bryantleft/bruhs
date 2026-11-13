import PithCore
import SwiftUI

struct CleanupView: View {
    let disk: DiskModel
    let model: CleanupModel
    let root: URL
    let close: () -> Void
    @Environment(\.undoManager) private var undoManager
    @State private var search = ""
    @State private var risk: CleanupCandidate.Risk?

    var body: some View {
        VStack(spacing: 0) {
            DiskToolHeader(title: "Clean Up", subtitle: model.root?.path ?? root.path, close: close)
            inspectionBar
            Divider().overlay(BruhsColor.hairline)
            content
            Divider().overlay(BruhsColor.hairline)
            selectionBar
        }
        .background(BruhsColor.canvas)
        .tint(BruhsColor.accent)
        .frame(width: 760, height: 600)
        .onAppear { if model.root != root || model.report == nil { model.inspect(root, binary: disk.binary) } }
        .onDisappear { model.cancel() }
        .alert(model.confirmation?.question ?? "", isPresented: Binding(get: { model.confirmation != nil }, set: { if !$0 { model.confirmation = nil } })) {
            Button("Cancel", role: .cancel) { model.confirmation = nil }
            Button("Move to Trash", role: .destructive) {
                if let batch = model.confirmation { disk.trash(batch, undoManager: undoManager) }
                model.confirmation = nil
            }
        } message: {
            let cautions = Array(Set(model.chosen.map(\.caution))).sorted().joined(separator: " ")
            Text(cautions + " " + (model.confirmation?.confirmation ?? "") + " Moving to Trash alone frees no space.")
        }
    }

    private var inspectionBar: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                if model.needsCheck {
                    Text("The disk changed. Check again before choosing more items.")
                        .foregroundStyle(BruhsColor.statusWarning)
                } else if let report = model.report {
                    Text("Inspected \(report.measuredAt.formatted(date: .abbreviated, time: .shortened))")
                        .foregroundStyle(BruhsColor.textSecondary)
                    if report.summary.errors > 0 || report.summary.cloudOnly.folders > 0 {
                        Text("Some folders could not be read. Their contents are excluded.")
                            .foregroundStyle(BruhsColor.statusWarning)
                    }
                } else {
                    Text("Find rebuildable files and review the rest before removing them.")
                        .foregroundStyle(BruhsColor.textSecondary)
                }
            }
            .font(BruhsType.note)
            .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            if model.isInspecting {
                BruhsSpinner(diameter: 14, lineWidth: 2).accessibilityLabel("Inspecting folder")
                Button("Cancel") { model.cancel() }.buttonStyle(.bruhsGhost)
            } else {
                Button("Check Again") { model.inspect(model.root ?? root, binary: disk.binary) }
                    .buttonStyle(.bruhsSoft)
                    .disabled(disk.isTrashing || model.preparing)
            }
        }
        .padding(16)
    }

    @ViewBuilder private var content: some View {
        switch model.inspection {
        case .idle:
            empty("Inspection cancelled", note: "Check Again reads file names and sizes in this folder. Nothing is removed.")
        case .running:
            VStack(spacing: 12) {
                BruhsSpinner(diameter: 24, lineWidth: 2.5)
                Text("Looking for cleanup opportunities…").font(BruhsType.body)
                Text("Reading metadata only. Your files stay in place.")
                    .font(BruhsType.note).foregroundStyle(BruhsColor.textSecondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let message):
            empty("Couldn’t inspect this folder", note: message)
        case .ready(let report):
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    Picker("Show", selection: $risk) {
                        Text("All").tag(CleanupCandidate.Risk?.none)
                        ForEach(CleanupCandidate.Risk.allCases, id: \.self) { Text($0.title).tag(Optional($0)) }
                    }
                    .labelsHidden()
                    .pickerStyle(.menu)
                    .fixedSize()
                    TextField("Find an item", text: $search)
                        .textFieldStyle(.roundedBorder)
                        .font(BruhsType.body)
                        .accessibilityLabel("Find a cleanup item")
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
                let items = report.candidates.filter { candidate in
                    (risk == nil || candidate.risk == risk) && (search.isEmpty || candidate.path.localizedStandardContains(search))
                }
                if items.isEmpty {
                    empty(report.candidates.isEmpty ? "No cleanup candidates found" : "No matching items",
                          note: report.candidates.isEmpty ? "Try another folder from the disk map. A large file alone is not a reason to remove it." : "Choose another category or change your search.")
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 0) {
                            ForEach(items) { item in
                                CleanupCandidateRow(item: item, selected: Binding(get: { model.selected.contains(item.path) }, set: { model.toggle(item, selected: $0) }),
                                                    enabled: !model.needsCheck && !disk.isTrashing && !model.preparing,
                                                    reveal: { disk.reveal([item.path]) }, preview: { disk.showQuickLook?([URL(fileURLWithPath: item.path)]) })
                                Divider().overlay(BruhsColor.hairline)
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    .bruhsScrollers(inset: 6)
                }
            }
        }
    }

    private var selectionBar: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let problem = model.problem {
                Text(problem).font(BruhsType.note).foregroundStyle(BruhsColor.statusCritical)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(model.selected.isEmpty ? "Choose items to review" : "\(model.selected.count.formatted()) selected")
                        .font(BruhsType.label).foregroundStyle(BruhsColor.text)
                    estimate
                }
                Spacer(minLength: 8)
                if disk.trashed != nil {
                    Button("Review Trash…") { close(); disk.sheet = .finishCleanup }
                        .buttonStyle(.bruhsGhost)
                        .disabled(disk.isTrashing)
                }
                if model.isMeasuring {
                    BruhsSpinner(diameter: 14, lineWidth: 2).accessibilityLabel("Measuring reclaimable space")
                } else {
                    Button("Measure Space") { model.measure(binary: disk.binary) }
                        .buttonStyle(.bruhsGhost)
                        .disabled(model.selected.isEmpty || model.needsCheck || disk.isTrashing)
                }
                Button(model.preparing ? "Checking…" : "Move to Trash…") { model.prepareMove() }
                    .buttonStyle(.bruhsSoftDanger)
                    .disabled(!model.canMove || disk.isTrashing || disk.isScanning)
            }
        }
        .padding(16)
    }

    @ViewBuilder private var estimate: some View {
        switch model.estimate {
        case .none:
            Text("Measure the selection to account for shared blocks and snapshots.")
                .font(BruhsType.note).foregroundStyle(BruhsColor.textSecondary)
        case .running:
            Text("Measuring what permanent deletion could free…")
                .font(BruhsType.note).foregroundStyle(BruhsColor.textSecondary)
        case .failed(let message):
            Text(message).font(BruhsType.note).foregroundStyle(BruhsColor.statusCritical)
        case .measured(let frees, let date):
            Text("\(bytes(frees.bytes)) reclaimable after permanent deletion")
                .font(BruhsType.dataSmall).foregroundStyle(BruhsColor.textSecondary)
                .help(frees.help(several: model.selected.count > 1, age: .current(measured: date)))
            if frees.unreadable > 0 {
                Text("Some selected contents could not be read. Check access and inspect again.")
                    .font(BruhsType.note).foregroundStyle(BruhsColor.statusWarning)
            }
        }
    }

    private func empty(_ title: String, note: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(BruhsType.title).foregroundStyle(BruhsColor.text)
            Text(note).font(BruhsType.body).foregroundStyle(BruhsColor.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        .padding(32)
    }
}

private struct CleanupCandidateRow: View {
    let item: CleanupCandidate
    @Binding var selected: Bool
    let enabled: Bool
    let reveal: () -> Void
    let preview: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Toggle("Select \(item.name)", isOn: $selected)
                .labelsHidden().toggleStyle(.checkbox)
                .disabled(!enabled || !item.canMoveToTrash)
                .padding(.top, 2)
                .help(item.canMoveToTrash ? "Include this item in the cleanup" : item.nextStep)
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(item.name).font(BruhsType.label).foregroundStyle(BruhsColor.text)
                        .lineLimit(2).textSelection(.enabled)
                    Spacer(minLength: 8)
                    Text(bytes(item.allocatedBytes)).font(BruhsType.data).foregroundStyle(BruhsColor.textSecondary)
                }
                Text(item.path).font(BruhsType.note).foregroundStyle(BruhsColor.textTertiary)
                    .lineLimit(2).truncationMode(.middle).textSelection(.enabled)
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(item.risk.title).font(BruhsType.sectionTitle)
                        .foregroundStyle(item.risk == .rebuildable ? BruhsColor.statusNormal : BruhsColor.statusWarning)
                    Text(item.reason).font(BruhsType.bodySmall).foregroundStyle(BruhsColor.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                DisclosureGroup("Before removing") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(item.caution)
                        Text(item.nextStep)
                        if item.unreadableFolders > 0 { Text("This item includes folders Pith could not read.") }
                        HStack(spacing: 12) {
                            Button("Quick Look", action: preview).buttonStyle(.bruhsGhost)
                            Button("Show in Finder", action: reveal).buttonStyle(.bruhsGhost)
                        }
                    }
                    .font(BruhsType.note).foregroundStyle(BruhsColor.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 4)
                }
                .font(BruhsType.note)
            }
        }
        .padding(.vertical, 14)
    }
}

struct DiskToolHeader: View {
    let title: String
    let subtitle: String
    let close: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text(title).font(BruhsType.title).foregroundStyle(BruhsColor.text)
                Text(subtitle).font(BruhsType.note).foregroundStyle(BruhsColor.textSecondary)
                    .lineLimit(2).truncationMode(.middle).textSelection(.enabled)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button("Done", action: close).buttonStyle(.bruhsGhost).keyboardShortcut(.cancelAction)
                .fixedSize()
        }
        .padding(16)
    }
}
