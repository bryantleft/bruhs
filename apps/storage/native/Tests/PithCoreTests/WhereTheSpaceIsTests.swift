import AppKit
import XCTest
@testable import PithCore

/// "Where the space is": a whole volume's used space, a row for each part with its figure and its icon, and the Not
/// measured block the map draws from the same figure.
final class WhereTheSpaceIsTests: XCTestCase {
    private let gb: UInt64 = 1_000_000_000

    /// The startup disk's map: 870 GB found, with Preboot's 10 GB, 12 folders Pith couldn't read, 4 GB of clones counted
    /// once and 3 GB of files only in iCloud.
    private func map(errors: UInt64 = 12, clones: UInt64 = 4_000_000_000, cloud: UInt64 = 3_000_000_000) -> DiskResult {
        DiskResult(root: DiskNode(kind: .dir, name: "/", path: "/", size: 870 * gb, files: 9, children: []), topFiles: [],
                   volumes: [DiskVolume(path: "/System/Volumes/Preboot", name: "Preboot", bytes: 10 * gb, sharesDisk: true)],
                   summary: DiskSummary(dirs: 1, files: 9, bytes: 870 * gb, errors: errors, unreadable: .init(protected: errors, denied: 0, other: 0),
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
            let shown = row("Not measured", in: accounting.rows(result: map(), trash: nil))
            XCTAssertEqual(accounting.notMeasuredBlock, expected, "walked \(walked)")
            XCTAssertEqual(shown?.figure, expected.map(SpaceRow.Figure.bytes), "walked \(walked)")
        }
    }

    func testTheRowsAccountForTheDiskInOrder() {
        let rows = accounting().rows(result: map(), trash: 5 * gb)
        XCTAssertEqual(rows.map(\.label), ["Used on this disk", "On the map", "In the Trash", "Hidden volumes", "Not measured", "Local snapshots",
                                           "Clones counted once", "Purgeable", "Only in iCloud"])
        XCTAssertEqual(rows.map(\.figure), [.bytes(904 * gb), .bytes(870 * gb), .bytes(5 * gb), .bytes(3 * gb), .bytes(31 * gb), .count(2),
                                            .bytes(4 * gb), .bytes(12 * gb), .bytes(3 * gb)])
        XCTAssertEqual(rows.map(\.isTotal), [true] + Array(repeating: false, count: 8))
    }

    func testARowShowsOnlyWhenItHasSomethingToSay() {
        // The volumes use just what the walk found, so nothing is not measured; 34 GB is on hidden volumes.
        let rows = accounting(map(errors: 0, clones: 0, cloud: 0), walked: [12 * gb, 848 * gb], snapshots: 0, purgeable: 0)
            .rows(result: map(errors: 0, clones: 0, cloud: 0), trash: nil)
        XCTAssertEqual(rows.map(\.label), ["Used on this disk", "On the map", "Hidden volumes"])
    }

    func testTheTrashShowsOnlyWhenTheMapCanReadItAndItHoldsSomething() {
        XCTAssertNil(row("In the Trash", in: accounting().rows(result: map(), trash: nil)), "the map can't read it")
        XCTAssertNil(row("In the Trash", in: accounting().rows(result: map(), trash: 0)), "it's empty")
        XCTAssertEqual(row("In the Trash", in: accounting().rows(result: map(), trash: 1))?.figure, .bytes(1))
    }

    func testEachRowLeadsWithItsIcon() {
        let icons = Dictionary(uniqueKeysWithValues: accounting().rows(result: map(), trash: 5 * gb).map { ($0.label, $0.icon) })
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
        let overcounted = DiskAccounting(used: 100, walkedVolumes: [90], result: map(), snapshots: nil, purgeable: nil).rows(result: map(), trash: nil)
        XCTAssertEqual(row("Counted twice", in: overcounted)?.icon, .symbol("plus.square.on.square"))
    }

    func testAnotherVolumesDiskShowsItsOwnIcon() {
        let usb = DiskResult(root: DiskNode(kind: .dir, name: "USB", path: "/Volumes/USB", size: 5, files: 1, children: []), topFiles: [],
                             summary: map().summary)
        let rows = DiskAccounting(used: 10, walkedVolumes: [8], result: usb, snapshots: nil, purgeable: nil).rows(result: usb, trash: nil)
        XCTAssertEqual(rows.first?.icon, .item(.item("/Volumes/USB")))
    }

    func testEveryFactShowsOnceWithoutSeparatorGlyphs() {
        let rows = accounting().rows(result: map(), trash: 5 * gb)
        // The snapshots' count is their row's figure, so Not measured names them without it.
        let notMeasured = row("Not measured", in: rows)?.note ?? ""
        XCTAssertEqual(notMeasured, "Space the scan couldn’t see: 12 folders Pith couldn’t read and the file system’s own records. "
                       + "macOS doesn’t say how much each takes.")
        XCTAssertFalse(notMeasured.contains("snapshot"), notMeasured)
        let readAll = accounting(map(errors: 0)).rows(result: map(errors: 0), trash: nil)
        XCTAssertEqual(row("Not measured", in: readAll)?.note, "Space the scan couldn’t see: the file system’s own records. macOS doesn’t say how much they take.")
        XCTAssertTrue(row("Local snapshots", in: rows)?.note?.contains("Not measured") == true)
        let separators = CharacterSet(charactersIn: "•·—–‒―‧∙›»")
        for row in rows {
            XCTAssertNil(row.label.rangeOfCharacter(from: separators), row.label)
            XCTAssertNil(row.note?.rangeOfCharacter(from: separators), row.note ?? "")
        }
        // Without a Not measured row, the snapshots say what's true of them on their own.
        let rest = accounting(walked: [12 * gb, 848 * gb]).rows(result: map(), trash: nil)
        XCTAssertNil(row("Not measured", in: rest))
        XCTAssertFalse(row("Local snapshots", in: rest)?.note?.contains("Not measured") ?? true)
    }

    func testTheSymbolsExistFromMacOS14() throws {
        for symbol in SpaceRow.symbols {
            XCTAssertNotNil(NSImage(systemSymbolName: symbol, accessibilityDescription: nil), symbol)
        }
        // SF Symbols' own record of the release each symbol came in, which this Mac's system keeps.
        let record = URL(fileURLWithPath: "/System/Library/CoreServices/CoreGlyphs.bundle/Contents/Resources/name_availability.plist")
        guard let data = try? Data(contentsOf: record),
              let plist = try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any],
              let symbols = plist["symbols"] as? [String: String], let releases = plist["year_to_release"] as? [String: [String: String]] else {
            throw XCTSkip("This Mac has no record of when each SF Symbol came")
        }
        for symbol in SpaceRow.symbols {
            let macOS = symbols[symbol].flatMap { releases[$0]?["macOS"] }
            let version = macOS.map { $0.split(separator: ".").compactMap { Int($0) } } ?? []
            XCTAssertTrue(version.lexicographicallyPrecedes([14, 0, 1]), "\(symbol) came in macOS \(macOS ?? "unknown")")
        }
    }
}
