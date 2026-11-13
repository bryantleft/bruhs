import PithCore
import SwiftUI

struct DiskGrowthView: View {
    let disk: DiskModel
    let root: String
    let close: () -> Void
    @State private var filter = Filter.all
    @State private var nested = false
    @State private var search = ""

    private enum Filter: String, CaseIterable {
        case all = "All changes", grew = "Grew", shrank = "Shrank"
    }

    var body: some View {
        VStack(spacing: 0) {
            DiskToolHeader(title: "What Changed", subtitle: root, close: close)
            if let since = disk.growthSince {
                HStack(alignment: .firstTextBaseline, spacing: 16) {
                    Text("Since \(since.formatted(date: .abbreviated, time: .shortened))")
                        .font(BruhsType.body).foregroundStyle(BruhsColor.textSecondary)
                    Spacer(minLength: 8)
                    if let total = disk.growthItems.first(where: { $0.path == root }) {
                        Text(change(total.change)).font(BruhsType.data).foregroundStyle(tint(total.change))
                            .help("The folder’s measured change. Nested items are already included.")
                    }
                }
                .padding(.horizontal, 16).padding(.bottom, 12)
                HStack(spacing: 12) {
                    Picker("Show", selection: $filter) {
                        ForEach(Filter.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                    .labelsHidden().fixedSize()
                    Toggle("Include nested items", isOn: $nested).font(BruhsType.control)
                    TextField("Find a changed item", text: $search).textFieldStyle(.roundedBorder).font(BruhsType.body)
                }
                .padding(.horizontal, 16).padding(.bottom, 12)
                Divider().overlay(BruhsColor.hairline)
                rows
                Divider().overlay(BruhsColor.hairline)
                writerContext(since: since)
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    Text("A second measurement will show what changed.").font(BruhsType.title)
                    Text(disk.remembersScans
                         ? "The live map compares with its saved baseline. Other folders compare with their previous scan. Sizes and paths stay on this Mac."
                         : "Turn on Keep disk maps in Settings to compare folder sizes across measurements.")
                        .font(BruhsType.body).foregroundStyle(BruhsColor.textSecondary)
                }
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                .padding(32)
            }
        }
        .background(BruhsColor.canvas).tint(BruhsColor.accent)
        .frame(width: 760, height: 600)
    }

    private var shown: [GrowthItem] {
        let inside = disk.growthItems.filter { $0.path != root && DiskChanges.isInside($0.path, root) }
        return (nested ? inside : GrowthComparison.outermost(inside, inside: root)).filter {
            (filter == .all || (filter == .grew ? $0.change > 0 : $0.change < 0))
                && (search.isEmpty || $0.path.localizedStandardContains(search))
        }
    }

    @ViewBuilder private var rows: some View {
        let items = shown
        if items.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("No matching measured changes").font(BruhsType.title)
                Text("Changes below 1 MB and folders with incomplete coverage are excluded. A change in map detail alone does not count as growth or deletion.")
                    .font(BruhsType.body).foregroundStyle(BruhsColor.textSecondary)
            }
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(32)
        } else {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(items) { item in
                        HStack(alignment: .top, spacing: 16) {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(item.name).font(BruhsType.label).foregroundStyle(BruhsColor.text)
                                    .lineLimit(2).textSelection(.enabled)
                                Text(item.path).font(BruhsType.note).foregroundStyle(BruhsColor.textTertiary)
                                    .lineLimit(2).truncationMode(.middle).textSelection(.enabled)
                                Text("\(bytes(item.before)) before, \(bytes(item.current)) now\(item.isRemoved ? ". No longer on disk." : ".")")
                                    .font(BruhsType.dataSmall).foregroundStyle(BruhsColor.textSecondary)
                                if !item.isRemoved {
                                    HStack(spacing: 12) {
                                        Button(item.isFolder ? "Open Folder" : "Show on Map") {
                                            close()
                                            disk.show(item.isFolder ? item.path : URL(fileURLWithPath: item.path).deletingLastPathComponent().path)
                                        }.buttonStyle(.bruhsGhost)
                                        Button("Show in Finder") { disk.reveal([item.path]) }.buttonStyle(.bruhsGhost)
                                    }
                                }
                            }
                            Spacer(minLength: 8)
                            Text(change(item.change)).font(BruhsType.data).foregroundStyle(tint(item.change))
                        }
                        .padding(.vertical, 14)
                        Divider().overlay(BruhsColor.hairline)
                    }
                }
                .padding(.horizontal, 16)
            }
            .bruhsScrollers(inset: 6)
        }
    }

    private func writerContext(since: Date) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("App activity during this period").font(BruhsType.label).foregroundStyle(BruhsColor.text)
            if case .apps(let writers, _) = disk.writers?(since), !writers.isEmpty {
                Text(writers.prefix(3).map { "\($0.name) wrote \(bytes($0.bytes))" }.joined(separator: ", ") + ".")
                    .font(BruhsType.bodySmall).foregroundStyle(BruhsColor.textSecondary)
                Text("These are writes across the disk. They do not identify which app changed a particular folder.")
                    .font(BruhsType.note).foregroundStyle(BruhsColor.textTertiary)
            } else {
                Text("Keep a week of history in Settings to see which apps were writing while space changed.")
                    .font(BruhsType.note).foregroundStyle(BruhsColor.textSecondary)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
    }

    private func change(_ value: Int64) -> String { (value > 0 ? "+" : "−") + bytes(value.magnitude) }
    private func tint(_ value: Int64) -> Color { value > 0 ? BruhsColor.statusWarning : BruhsColor.statusNormal }
}
