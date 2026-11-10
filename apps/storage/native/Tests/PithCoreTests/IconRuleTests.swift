import XCTest
@testable import PithCore

/// Pith's icon rule and the disk map page's copy of it (`iconKey` in native-web/icons.ts) read one fixture,
/// tests/icon-keys.json: the table native sends the page for a test home, and the key each item gets by the rule.
/// tests/icons.test.ts checks the page against the same cases, so the two can't drift apart.
final class IconRuleTests: XCTestCase {
    private struct Fixture: Decodable {
        struct Case: Decodable {
            let why: String
            /// An item of the map, as the scanner writes one.
            let node: DiskNode
            let asking: Bool
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

    /// The places of `home`, laid out as `FileManager.urls(for:in:)` lays a home out. Without apps: an app changes a
    /// place's icon, never its key.
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
        ]) { _ in nil }
    }

    func testNativeSendsThePageTheFixturesTable() throws {
        let fixture = try fixture()
        let places = places(home: fixture.home)
        XCTAssertEqual(places.iconRule(asking: false), fixture.rule)
        XCTAssertEqual(places.iconRule(asking: true), IconRule(places: fixture.rule.places, guarded: fixture.rule.guarded, asking: true))
    }

    func testTheTableTravelsAsTheFixtureSpellsIt() throws {
        let rule = places(home: try fixture().home).iconRule(asking: true)
        XCTAssertEqual(try JSONDecoder().decode(IconRule.self, from: JSONEncoder().encode(rule)), rule)
        let sent = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(rule)) as? [String: Any])
        XCTAssertEqual(Set(sent.keys), ["places", "guarded", "asking"])
        XCTAssertEqual(sent["asking"] as? Bool, true)
    }

    func testEachItemGetsTheFixturesKey() throws {
        let fixture = try fixture()
        let places = places(home: fixture.home)
        XCTAssertGreaterThan(fixture.cases.count, 30)
        for item in fixture.cases {
            XCTAssertEqual(places.iconKey(for: item.node, asking: item.asking).string, item.key, item.why)
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
