import Foundation

/// A row of "Where the space is", Disk's account of a whole volume's used space: a part of it, its figure, why, and its
/// icon. Each figure is measured, or the row says plainly that it wasn't.
public struct SpaceRow: Equatable, Sendable {
    public enum Figure: Equatable, Sendable {
        case bytes(UInt64)
        /// How many, for what macOS counts without a size: the local snapshots.
        case count(Int)
    }

    /// What leads the row, at 16 pt.
    public enum Icon: Equatable, Sendable {
        /// macOS's own icon for a real thing on this Mac, from the icon store: the disk, the Trash, iCloud Drive.
        case item(IconKey)
        /// An SF Symbol, for a part of the space that nothing on the disk stands for.
        case symbol(String)
    }

    public let label: String
    public let figure: Figure
    public let note: String?
    public let icon: Icon
    /// The disk's used space, which the rows after it account for.
    public let isTotal: Bool

    init(_ label: String, _ figure: Figure, note: String?, icon: Icon, isTotal: Bool = false) {
        self.label = label; self.figure = figure; self.note = note; self.icon = icon; self.isTotal = isTotal
    }

    /// Every SF Symbol a row leads with. Each came with macOS 11 or earlier, so every macOS Pith runs on has it.
    public static let symbols = [mapSymbol, hiddenVolumesSymbol, notMeasuredSymbol, snapshotsSymbol, overcountedSymbol, clonesSymbol, purgeableSymbol]

    /// The map: blocks of every size, as a treemap is.
    static let mapSymbol = "mosaic"
    /// Volumes macOS keeps unmounted, which have no icon of their own to draw.
    static let hiddenVolumesSymbol = "internaldrive"
    /// What the scan couldn't see: a dashed square with a question mark, as the map's hatched block is.
    static let notMeasuredSymbol = "questionmark.square.dashed"
    /// Copies of the disk as it was earlier.
    static let snapshotsSymbol = "clock.arrow.circlepath"
    /// Space the map counts at more than one copy.
    static let overcountedSymbol = "plus.square.on.square"
    /// Clones, which share their blocks with another copy.
    static let clonesSymbol = "square.on.square"
    /// Space macOS can take back when it needs room.
    static let purgeableSymbol = "arrow.3.trianglepath"
}

extension DiskAccounting {
    /// The bytes the map draws as its Not measured block, at its root: exactly the figure the Not measured row gives, or
    /// nil when there's no such row, as when the walk found all the volumes use.
    public var notMeasuredBlock: UInt64? {
        guard let notMeasured, notMeasured > 0 else { return nil }
        return notMeasured
    }

    /// "Where the space is" for `result`, the map it accounts for, in order: the disk's used space, then each part of
    /// it there's something to say about. `trash` is the Trash's size as that map shows it, or nil when the map can't
    /// read the Trash, and `trashIsEmpty` whether it holds nothing by Pith's rule (`KnownPlaces.trashHoldsNothing`), as
    /// its icon shows wherever it shows: its row shows only when the map can read it, and it holds something. An emptied
    /// Trash still holds Finder's .DS_Store once Finder has shown it, which the map counts, but emptying it frees nothing
    /// more, so it has no row. `disk` is the disk's icon as Pith's rule gives it (`KnownPlaces.volumeKey`): its own, or
    /// the drive for a disk macOS guards.
    public func rows(result: DiskResult?, trash: UInt64?, trashIsEmpty: Bool = false, disk: IconKey) -> [SpaceRow] {
        var rows = [
            SpaceRow("Used on this disk", .bytes(used), note: nil, icon: .item(disk), isTotal: true),
            SpaceRow("On the map", .bytes(scanned), note: "What the scan found, other volumes on this disk included.", icon: .symbol(SpaceRow.mapSymbol)),
        ]
        if let trash, trash > 0, !trashIsEmpty {
            rows.append(SpaceRow("In the Trash", .bytes(trash), note: "Part of the map, until you empty the Trash.", icon: .item(.place("trash"))))
        }
        if hiddenVolumes > 0 {
            rows.append(SpaceRow("Hidden volumes", .bytes(hiddenVolumes), note: "Volumes macOS keeps unmounted, such as Recovery.",
                                 icon: .symbol(SpaceRow.hiddenVolumesSymbol)))
        }
        if let notMeasured = notMeasuredBlock {
            rows.append(SpaceRow("Not measured", .bytes(notMeasured), note: notMeasuredNote, icon: .symbol(SpaceRow.notMeasuredSymbol)))
        }
        if let snapshots, snapshots > 0 {
            let size = notMeasuredBlock == nil ? "macOS doesn’t say how much space they hold." : "Their space is part of Not measured."
            rows.append(SpaceRow("Local snapshots", .count(snapshots), note: "Copies of the disk as it was earlier, for Time Machine and macOS updates. \(size)",
                                 icon: .symbol(SpaceRow.snapshotsSymbol)))
        }
        if overcounted > 0 {
            rows.append(SpaceRow("Counted twice", .bytes(overcounted),
                                 note: "Clones changed since they were made still share some blocks, and the map counts those at every copy.",
                                 icon: .symbol(SpaceRow.overcountedSymbol)))
        }
        if let clones = result?.summary.clones, clones.bytes > 0 {
            let files = clones.files == 1 ? "file is a clone" : "files are clones"
            rows.append(SpaceRow("Clones counted once", .bytes(clones.bytes),
                                 note: "\(clones.files.formatted()) \(files) of another file, sharing all its blocks. The map counts that space at the copy made first.",
                                 icon: .symbol(SpaceRow.clonesSymbol)))
        }
        if let purgeable, purgeable > 0 {
            rows.append(SpaceRow("Purgeable", .bytes(purgeable), note: "Caches and snapshots macOS can remove when it needs room. They count as used until it does.",
                                 icon: .symbol(SpaceRow.purgeableSymbol)))
        }
        if let cloud = result?.summary.cloudOnly, cloud.files > 0 {
            let downloaded = cloud.files == 1 ? "file isn’t" : "files aren’t", take = cloud.files == 1 ? "it takes" : "they take"
            rows.append(SpaceRow("Only in iCloud", .bytes(cloud.bytes), note: "\(cloud.files.formatted()) \(downloaded) downloaded, so \(take) almost no space here.",
                                 icon: .item(.place("icloud-drive"))))
        }
        return rows
    }

    /// Why the scan couldn't see the Not measured space. The local snapshots, which have a row of their own, say there
    /// that their space is part of it.
    private var notMeasuredNote: String {
        var causes: [String] = []
        if unreadableFolders > 0 {
            causes.append("\(unreadableFolders.formatted()) \(unreadableFolders == 1 ? "folder" : "folders") Pith couldn’t read")
        }
        causes.append("the file system’s own records")
        let list = causes.count > 1 ? causes.dropLast().joined(separator: ", ") + " and " + causes[causes.count - 1] : causes[0]
        return "Space the scan couldn’t see: \(list). macOS doesn’t say how much \(causes.count > 1 ? "each takes" : "they take")."
    }
}
