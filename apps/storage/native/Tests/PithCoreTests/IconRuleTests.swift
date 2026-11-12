import XCTest
@testable import PithCore

/// Pith's icon rule and the disk map page's copy of it (`iconKey` in native-web/icon-rule.ts) read one fixture,
/// tests/icon-keys.json: the table native sends the page for a test home, and the key each item gets by the rule.
/// tests/icon-rule.test.ts checks the page against the same cases, so the two can't drift apart.
final class IconRuleTests: XCTestCase {
    private struct Fixture: Decodable {
        struct Case: Decodable {
            let why: String
            /// An item of the map, as the scanner writes one.
            let node: DiskNode
            let asking: Bool
            /// Whether the Trash holds nothing, by the scanner's word, which the rule carries (`KnownPlaces.trashHoldsNothing`).
            let emptyTrash: Bool?
            /// What the scanner says of the Trash beside a map that doesn't draw it, from which Pith's rule finds `emptyTrash`.
            let place: LivePlace?
            let key: String
        }

        let home: String
        let rule: IconRule
        let cases: [Case]
    }

    private func fixture() throws -> Fixture {
        let storage = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        return try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: storage.appendingPathComponent("tests/icon-keys.json")))
    }

    /// The test Mac's file systems: its startup disk's volumes, an external disk and a share, the two macOS guards.
    private static let mounts = MountTable([
        .init(path: "/", from: "/dev/disk3s1s1", isInternal: true), .init(path: "/System/Volumes/Data", from: "/dev/disk3s5", isInternal: true),
        .init(path: "/System/Volumes/Preboot", from: "/dev/disk3s2", isInternal: true), .init(path: "/Volumes/Archive", from: "/dev/disk4s1", isInternal: false),
        .init(path: "/Volumes/share", from: "//me@nas.local/share", isLocal: false),
    ])

    /// The places of `home`, laid out as `FileManager.urls(for:in:)` lays a home out, as the rule has them while Pith hasn't
    /// Full Disk Access: the volumes macOS guards shown as a drive. Without apps: an app changes a place's icon, never its
    /// key.
    private func places(home: String) -> KnownPlaces {
        let home = URL(fileURLWithPath: home, isDirectory: true)
        return KnownPlaces(home: home, searchPaths: [
            .applicationDirectory: URL(fileURLWithPath: "/Applications", isDirectory: true),
            .desktopDirectory: home.appendingPathComponent("Desktop"),
            .documentDirectory: home.appendingPathComponent("Documents"),
            .downloadsDirectory: home.appendingPathComponent("Downloads"),
            .moviesDirectory: home.appendingPathComponent("Movies"),
            .musicDirectory: home.appendingPathComponent("Music"),
            .picturesDirectory: home.appendingPathComponent("Pictures"),
            .trashDirectory: home.appendingPathComponent(".Trash"),
        ], mounts: { Self.mounts }) { _ in nil }.guardingVolumes(GuardedVolumes(Self.mounts), fullDiskAccess: false)
    }

    func testNativeSendsThePageTheFixturesTable() throws {
        let fixture = try fixture()
        let places = places(home: fixture.home)
        XCTAssertEqual(places.iconRule(asking: false), fixture.rule)
        XCTAssertEqual(places.iconRule(asking: true),
                       IconRule(places: fixture.rule.places, guarded: fixture.rule.guarded, asking: true, emptyTrash: false, guardedVolumes: fixture.rule.guardedVolumes))
        XCTAssertEqual(places.iconRule(asking: false, trashIsEmpty: true),
                       IconRule(places: fixture.rule.places, guarded: fixture.rule.guarded, asking: false, emptyTrash: true, guardedVolumes: fixture.rule.guardedVolumes))
        XCTAssertEqual(fixture.rule.guardedVolumes, ["/Volumes/Archive", "/Volumes/share"], "the disk and the share, not the startup disk's volumes")
    }

    func testTheTableTravelsAsTheFixtureSpellsIt() throws {
        let rule = places(home: try fixture().home).iconRule(asking: true)
        XCTAssertEqual(try JSONDecoder().decode(IconRule.self, from: JSONEncoder().encode(rule)), rule)
        let sent = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(rule)) as? [String: Any])
        XCTAssertEqual(Set(sent.keys), ["places", "guarded", "asking", "emptyTrash", "guardedVolumes"])
        XCTAssertEqual(sent["asking"] as? Bool, true)
        XCTAssertEqual(sent["emptyTrash"] as? Bool, false)
    }

    func testEachItemGetsTheFixturesKey() throws {
        let fixture = try fixture()
        let places = places(home: fixture.home)
        XCTAssertGreaterThan(fixture.cases.count, 30)
        for item in fixture.cases {
            XCTAssertEqual(places.iconKey(for: item.node, asking: item.asking, trashIsEmpty: item.emptyTrash ?? false).string, item.key, item.why)
        }
    }

    /// The cases that give the Trash's place: beside a map that folds the Trash into the home folder's smaller items, the
    /// state Pith's rule finds from what the scanner says of it is the one the case gives the page's rule.
    func testTheTrashsStateComesFromWhatTheScannerSaysOfIt() throws {
        let fixture = try fixture()
        let places = places(home: fixture.home)
        let folded = DiskNode(kind: .dir, name: "zo\u{eb}", path: fixture.home, size: 1, files: 1, children: [
            DiskNode(kind: .aggregate, name: "(smaller items)", path: fixture.home + "/__other__", size: 1, files: 1, children: nil),
        ])
        let given = fixture.cases.filter { $0.place != nil }
        XCTAssertGreaterThanOrEqual(given.count, 5)
        for item in given {
            XCTAssertEqual(places.trashHoldsNothing(in: folded, scan: nil, live: item.place.map { [$0] } ?? []), item.emptyTrash ?? false, item.why)
        }
    }

    /// The page decides what's guarded from the table alone, so the table holds every location `isProtected` checks
    /// by path, and nothing else.
    func testTheGuardedLocationsAreTheOnesMacOSGuards() throws {
        let places = places(home: try fixture().home)
        for path in places.guarded {
            XCTAssertTrue(places.isProtected(path), path)
            XCTAssertTrue(places.isProtected(path + "/inside"), path)
        }
        for place in places.places {
            XCTAssertEqual(places.guarded.contains(place.path), place.isProtected, place.id)
        }
    }
}
