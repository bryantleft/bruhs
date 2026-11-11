import AppKit
import XCTest
@testable import PithCore

/// "Where the space is": a whole volume's used space, a row for each part with its figure and its icon, and the Not
/// measured block the map draws from the same figure.
final class WhereTheSpaceIsTests: XCTestCase {
    private let gb: UInt64 = 1_000_000_000

    /// The startup disk's map: 870 GB found, with Preboot's 10 GB, 12 folders Pith couldn't read, 4 GB of clones counted
    /// once and 3 GB of files only in iCloud.
    private func map(errors: UInt64 = 12, clones: UInt64 = 4_000_000_000, cloud: UInt64 = 3_000_000_000, found: UInt64 = 870_000_000_000) -> DiskResult {
        DiskResult(root: DiskNode(kind: .dir, name: "/", path: "/", size: found, files: 9, children: []), topFiles: [],
                   volumes: [DiskVolume(path: "/System/Volumes/Preboot", name: "Preboot", bytes: 10 * gb, sharesDisk: true)],
                   summary: DiskSummary(dirs: 1, files: 9, bytes: found, errors: errors, unreadable: .init(protected: errors, denied: 0, other: 0),
                                        entryErrors: 0, cloudOnly: .init(files: cloud > 0 ? 2 : 0, bytes: cloud, folders: 0), elapsedMs: 1, engine: "bulk",
                                        clones: .init(files: 3, bytes: clones)))
    }

    /// 904 GB used: the system and data volumes use 891 GB, 31 GB more than the walk found, and Recovery 3 GB.
    private func accounting(_ result: DiskResult? = nil, walked: [UInt64]? = nil, snapshots: Int? = 2, purgeable: UInt64? = 12_000_000_000) -> DiskAccounting {
        DiskAccounting(used: 904 * gb, walkedVolumes: walked ?? [12 * gb, 879 * gb], result: result ?? map(), snapshots: snapshots, purgeable: purgeable)
    }

    private func row(_ label: String, in rows: [SpaceRow]) -> SpaceRow? { rows.first { $0.label == label } }

    func testTheMapsBlockIsExactlyThePopoversNotMeasuredFigure() {
        // The walk found 860 GB of the volumes' own: 870 GB less Preboot's 10.
        let cases: [([UInt64], UInt64?)] = [([12 * gb, 879 * gb], 31 * gb), ([12 * gb, 848 * gb + 1], 1), ([12 * gb, 848 * gb], nil),
                                             ([12 * gb, 840 * gb], nil)]
        for (walked, expected) in cases {
            let accounting = accounting(walked: walked)
            let shown = row("Not measured", in: accounting.rows(result: map(), trash: nil, disk: .item("/")))
            XCTAssertEqual(accounting.notMeasuredBlock, expected, "walked \(walked)")
            XCTAssertEqual(shown?.figure, expected.map(SpaceRow.Figure.bytes), "walked \(walked)")
        }
    }

    func testNotMeasuredFollowsTheMapItsSetAgainst() throws {
        // The volume measured once: a move within it, to the Trash or back, changes none of its own figures.
        let use = VolumeUse(used: 904 * gb, walkedVolumes: [12 * gb, 879 * gb], snapshots: 2, purgeable: 12 * gb)
        let movie = DiskNode(kind: .file, name: "a.mov", path: "/Movies/a.mov", size: 5 * gb, children: nil)
        let root = DiskNode(kind: .dir, name: "/", path: "/", size: 870 * gb, files: 2, children: [
            DiskNode(kind: .dir, name: "Movies", path: "/Movies", size: 5 * gb, files: 1, children: [movie]),
            DiskNode(kind: .file, name: "rest.bin", path: "/rest.bin", size: 865 * gb, children: nil),
        ])
        let before = DiskResult(root: root, topFiles: [], volumes: map().volumes, summary: map().summary)
        let trashed = try XCTUnwrap(before.removing("/Movies"))
        XCTAssertEqual(DiskAccounting(use, result: before), accounting(before))
        XCTAssertEqual(DiskAccounting(use, result: before).notMeasuredBlock, 31 * gb)
        // Move to Trash takes the folder off the map at once. With the Trash unreadable, its 5 GB are still on the volume,
        // so they join Not measured at once, and leave On the map.
        let after = DiskAccounting(use, result: trashed)
        XCTAssertEqual(after.notMeasuredBlock, 36 * gb)
        XCTAssertEqual(row("On the map", in: after.rows(result: trashed, trash: nil, disk: .item("/")))?.figure, .bytes(865 * gb))
        XCTAssertEqual(after.used, 904 * gb, "the volume's used space doesn't move")
        // Undo puts the map from before back, and Not measured with it.
        XCTAssertEqual(DiskAccounting(use, result: before).notMeasuredBlock, 31 * gb)
    }

    func testAChangeOutsidePithMovesUsedSpaceAndLeavesNotMeasured() {
        // A 10 GB download outside Pith: the live map shows it, and the volume's space, measured again with that map,
        // holds it too.
        let use = VolumeUse(used: 904 * gb, walkedVolumes: [12 * gb, 879 * gb], snapshots: 2, purgeable: 12 * gb)
        let grown = map(found: 880 * gb)
        let measuredAgain = use.with(VolumeUse.Space(used: 914 * gb, walkedVolumes: [12 * gb, 889 * gb]))
        XCTAssertEqual(DiskAccounting(measuredAgain, result: grown).notMeasuredBlock, 31 * gb, "what the map can't see is as it was")
        XCTAssertEqual(DiskAccounting(measuredAgain, result: grown).used, 904 * gb + 10 * gb)
        // The figures from before, set against the grown map, would take the download out of Not measured.
        XCTAssertEqual(DiskAccounting(use, result: grown).notMeasuredBlock, 21 * gb)
        // The snapshots and what's purgeable, which take longer to learn, wait for the next full measure.
        XCTAssertEqual(measuredAgain.snapshots, 2)
        XCTAssertEqual(measuredAgain.purgeable, 12 * gb)
        XCTAssertEqual(VolumeUse(VolumeUse.Space(used: 1, walkedVolumes: [1]), snapshots: nil, purgeable: nil),
                       VolumeUse(used: 1, walkedVolumes: [1], snapshots: nil, purgeable: nil))
    }

    func testTheRowsAccountForTheDiskInOrder() {
        let rows = accounting().rows(result: map(), trash: 5 * gb, disk: .item("/"))
        XCTAssertEqual(rows.map(\.label), ["Used on this disk", "On the map", "In the Trash", "Hidden volumes", "Not measured", "Local snapshots",
                                           "Clones counted once", "Purgeable", "Only in iCloud"])
        XCTAssertEqual(rows.map(\.figure), [.bytes(904 * gb), .bytes(870 * gb), .bytes(5 * gb), .bytes(3 * gb), .bytes(31 * gb), .count(2),
                                            .bytes(4 * gb), .bytes(12 * gb), .bytes(3 * gb)])
        XCTAssertEqual(rows.map(\.isTotal), [true] + Array(repeating: false, count: 8))
    }

    func testARowShowsOnlyWhenItHasSomethingToSay() {
        // The volumes use just what the walk found, so nothing is not measured; 34 GB is on hidden volumes.
        let rows = accounting(map(errors: 0, clones: 0, cloud: 0), walked: [12 * gb, 848 * gb], snapshots: 0, purgeable: 0)
            .rows(result: map(errors: 0, clones: 0, cloud: 0), trash: nil, disk: .item("/"))
        XCTAssertEqual(rows.map(\.label), ["Used on this disk", "On the map", "Hidden volumes"])
    }

    func testTheTrashShowsOnlyWhenTheMapCanReadItAndItHoldsSomething() {
        XCTAssertNil(row("In the Trash", in: accounting().rows(result: map(), trash: nil, disk: .item("/"))), "the map can't read it")
        XCTAssertNil(row("In the Trash", in: accounting().rows(result: map(), trash: 0, disk: .item("/"))), "it's empty")
        XCTAssertEqual(row("In the Trash", in: accounting().rows(result: map(), trash: 1, disk: .item("/")))?.figure, .bytes(1))
    }

    func testEachRowLeadsWithItsIcon() {
        let icons = Dictionary(uniqueKeysWithValues: accounting().rows(result: map(), trash: 5 * gb, disk: .item("/")).map { ($0.label, $0.icon) })
        // Real things on this Mac, as macOS draws them: the disk by its path, as the disk menu shows it, and the Trash
        // and iCloud Drive as their known places.
        XCTAssertEqual(icons["Used on this disk"], .item(.item("/")))
        XCTAssertEqual(icons["In the Trash"], .item(.place("trash")))
        XCTAssertEqual(icons["Only in iCloud"], .item(.place("icloud-drive")))
        // Symbols where nothing real stands for the space.
        XCTAssertEqual(icons["On the map"], .symbol("mosaic"))
        XCTAssertEqual(icons["Hidden volumes"], .symbol("internaldrive"))
        XCTAssertEqual(icons["Not measured"], .symbol("questionmark.square.dashed"))
        XCTAssertEqual(icons["Local snapshots"], .symbol("clock.arrow.circlepath"))
        XCTAssertEqual(icons["Clones counted once"], .symbol("square.on.square"))
        XCTAssertEqual(icons["Purgeable"], .symbol("arrow.3.trianglepath"))
        let overcounted = DiskAccounting(used: 100, walkedVolumes: [90], result: map(), snapshots: nil, purgeable: nil).rows(result: map(), trash: nil, disk: .item("/"))
        XCTAssertEqual(row("Counted twice", in: overcounted)?.icon, .symbol("plus.square.on.square"))
    }

    /// The disk's row leads with the disk's icon as Pith's rule gives it (`KnownPlaces.volumeKey`): another disk's own, by
    /// its path, while Pith has Full Disk Access, and macOS's volume type icon while it hasn't, as macOS guards the disk.
    func testAnotherVolumesDiskShowsTheIconTheRuleGivesIt() {
        let usb = DiskResult(root: DiskNode(kind: .dir, name: "USB", path: "/Volumes/USB", size: 5, files: 1, children: []), topFiles: [],
                             summary: map().summary)
        let accounting = DiskAccounting(used: 10, walkedVolumes: [8], result: usb, snapshots: nil, purgeable: nil)
        XCTAssertEqual(accounting.rows(result: usb, trash: nil, disk: .item("/Volumes/USB")).first?.icon, .item(.item("/Volumes/USB")))
        XCTAssertEqual(accounting.rows(result: usb, trash: nil, disk: .volume).first?.icon, .item(.volume))
    }

    func testEveryFactShowsOnceWithoutSeparatorGlyphs() {
        let rows = accounting().rows(result: map(), trash: 5 * gb, disk: .item("/"))
        // The snapshots' count is their row's figure, so Not measured names them without it.
        let notMeasured = row("Not measured", in: rows)?.note ?? ""
        XCTAssertEqual(notMeasured, "Space the scan couldn’t see: 12 folders Pith couldn’t read and the file system’s own records. "
                       + "macOS doesn’t say how much each takes.")
        XCTAssertFalse(notMeasured.contains("snapshot"), notMeasured)
        let readAll = accounting(map(errors: 0)).rows(result: map(errors: 0), trash: nil, disk: .item("/"))
        XCTAssertEqual(row("Not measured", in: readAll)?.note, "Space the scan couldn’t see: the file system’s own records. macOS doesn’t say how much they take.")
        XCTAssertTrue(row("Local snapshots", in: rows)?.note?.contains("Not measured") == true)
        let separators = CharacterSet(charactersIn: "•·—–‒―‧∙›»")
        for row in rows {
            XCTAssertNil(row.label.rangeOfCharacter(from: separators), row.label)
            XCTAssertNil(row.note?.rangeOfCharacter(from: separators), row.note ?? "")
        }
        // Without a Not measured row, the snapshots say what's true of them on their own.
        let rest = accounting(walked: [12 * gb, 848 * gb]).rows(result: map(), trash: nil, disk: .item("/"))
        XCTAssertNil(row("Not measured", in: rest))
        XCTAssertFalse(row("Local snapshots", in: rest)?.note?.contains("Not measured") ?? true)
    }

    func testEverySymbolThisStepDrawsCameWithMacOS14OrEarlier() throws {
        // The popover's rows, and the notice while macOS asks.
        let drawn = SpaceRow.symbols + [AskingNotice.symbol]
        for symbol in drawn {
            XCTAssertNotNil(NSImage(systemSymbolName: symbol, accessibilityDescription: nil), symbol)
        }
        // SF Symbols' own record of the release each symbol came in, which this Mac's system keeps.
        let record = URL(fileURLWithPath: "/System/Library/CoreServices/CoreGlyphs.bundle/Contents/Resources/name_availability.plist")
        guard let data = try? Data(contentsOf: record),
              let plist = try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any],
              let symbols = plist["symbols"] as? [String: String], let releases = plist["year_to_release"] as? [String: [String: String]] else {
            throw XCTSkip("This Mac has no record of when each SF Symbol came")
        }
        for symbol in drawn {
            // A symbol the record doesn't name, or a release it doesn't date, fails rather than passing as no version.
            let release = try XCTUnwrap(symbols[symbol], "\(symbol) isn't in SF Symbols' record")
            let macOS = try XCTUnwrap(releases[release]?["macOS"], "\(symbol)'s release \(release) has no macOS version")
            let version = macOS.split(separator: ".").compactMap { Int($0) }
            XCTAssertFalse(version.isEmpty, "\(symbol) came in macOS \(macOS)")
            XCTAssertTrue(version.lexicographicallyPrecedes([14, 0, 1]), "\(symbol) came in macOS \(macOS)")
        }
    }
}
