import PithCore
import SwiftUI

/// "Where the space is": where a whole volume's used space went, a row for each part (`DiskAccounting.rows`). Each row
/// is a measured figure, or says plainly that it wasn't measured, and leads with its 16 pt icon: the disk's, the
/// Trash's and iCloud Drive's as macOS draws them, and a symbol for what nothing on the disk stands for. The icons are
/// decorative, since each row's label names it. The smoke test draws it too, so it isn't private.
struct WhereTheSpaceIsView: View {
    let rows: [SpaceRow]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                SpaceRowView(row: row)
                // The disk's used space, which the rows after it account for.
                if row.isTotal { Rectangle().fill(BruhsColor.hairline).frame(height: 1) }
            }
        }
        .padding(16)
        .frame(width: 340, alignment: .leading)
        .background(BruhsColor.canvas)
    }
}

private struct SpaceRowView: View {
    let row: SpaceRow

    /// The icon's width and the room after it, which the note is set in by, so it starts under the label.
    private static let icon: CGFloat = 16, gap: CGFloat = 8

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            // Centred, since an icon has no text baseline.
            HStack(spacing: Self.gap) {
                icon
                Text(row.label).font(row.isTotal ? BruhsType.label : BruhsType.body).foregroundStyle(BruhsColor.text)
                Spacer(minLength: 12)
                Text(verbatim: figure).font(BruhsType.data).foregroundStyle(row.isTotal ? BruhsColor.text : BruhsColor.textSecondary)
            }
            if let note = row.note {
                Text(note)
                    .font(BruhsType.note)
                    .foregroundStyle(BruhsColor.textTertiary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.leading, Self.icon + Self.gap)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var figure: String {
        switch row.figure {
        case .bytes(let value): bytes(value)
        case .count(let value): monaspaced(value.formatted())
        }
    }

    @ViewBuilder private var icon: some View {
        switch row.icon {
        case .item(let key):
            SystemIconView(key: key, size: Self.icon)
        case .symbol(let name):
            Image(systemName: name)
                .font(BruhsType.body)
                .foregroundStyle(BruhsColor.textSecondary)
                .frame(width: Self.icon, height: Self.icon)
                .accessibilityHidden(true)
        }
    }
}
