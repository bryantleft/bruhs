import XCTest
@testable import PithCore

/// The disk map's icon route: which icons its page may load from `pith://app/icon/`, and how it asks for them.
final class IconPolicyTests: XCTestCase {
    /// A home folder at a made-up path: the policy only compares paths, so nothing here exists or is looked at.
    private let home = "/Users/tester"

    private var places: KnownPlaces {
        let folder = { (path: String) in URL(fileURLWithPath: path, isDirectory: true) }
        return KnownPlaces(home: folder(home), searchPaths: [
            .applicationDirectory: folder("/Applications"), .desktopDirectory: folder(home + "/Desktop"),
            .documentDirectory: folder(home + "/Documents"), .downloadsDirectory: folder(home + "/Downloads"),
        ]) { _ in nil }
    }

    private func folder(_ path: String, size: UInt64 = 1, files: UInt64 = 1, _ children: [DiskNode] = []) -> DiskNode {
        DiskNode(kind: .dir, name: (path as NSString).lastPathComponent, path: path, size: size, files: files, children: children)
    }

    private func node(_ kind: DiskNode.Kind, _ path: String) -> DiskNode {
        DiskNode(kind: kind, name: (path as NSString).lastPathComponent, path: path, size: kind == .unreadable ? 0 : 1,
                 reason: kind == .unreadable ? .denied : nil, children: nil)
    }

    /// The test home's map: projects with an app, a folder with an accent and an emoji, a file and the smaller items;
    /// Documents, with a folder the map has listed and one it hasn't; a folder it couldn't read; and a volume.
    private var map: DiskNode {
        folder(home, [
            folder(home + "/Projects", [
                folder(home + "/Projects/Pith.app"),
                folder(home + "/Projects/My Caf\u{e9} \u{2615}\u{fe0f}"),
                node(.file, home + "/Projects/notes.pdf"),
                node(.aggregate, home + "/Projects/__other__"),
            ]),
            folder(home + "/Documents", [
                folder(home + "/Documents/Taxes"),
                folder(home + "/Documents/New", size: 0, files: 0),
            ]),
            node(.unreadable, home + "/Locked"),
            node(.volume, home + "/Backup"),
        ])
    }

    private func policy(_ map: DiskNode?, volumes: Set<String> = [], apps: Set<String> = []) -> IconPolicy {
        IconPolicy(places: places, map: map, volumes: volumes, apps: apps)
    }

    /// An icon's URL as the page writes one.
    private func url(_ key: String, generation: String = "1", appearance: String = "dark", size: String = "16@2x") -> String {
        "pith://app/icon/\(generation)/\(appearance)/\(size)/\(key).png"
    }

    /// What `policy` makes of `string`, a URL as WebKit hands it over, while macOS is `asking` or not.
    private func request(_ string: String, _ policy: IconPolicy, asking: Bool = false) throws -> IconRequest? {
        policy.request(for: try XCTUnwrap(URL(string: string), string), asking: asking)
    }

    /// Whether `policy` lets the page have `key`'s icon.
    private func loads(_ key: IconKey, _ policy: IconPolicy, asking: Bool = false) throws -> Bool {
        try request(url(key.string), policy, asking: asking) != nil
    }

    func testItReadsTheIconAURLAsksFor() throws {
        let policy = policy(map)
        XCTAssertEqual(try request(url("folder", generation: "7", appearance: "light", size: "14@1x"), policy),
                       IconRequest(.folder, size: IconSize(pixels: 14, scale: 1), appearance: .light))
        XCTAssertEqual(try request(url("type/pdf"), policy), IconRequest(.type("pdf"), size: IconSize(points: 16, scale: 2), appearance: .dark))
        XCTAssertEqual(try request(url("type/"), policy)?.key, .type(""), "a file with no extension")
        XCTAssertEqual(try request(url("group", size: "12@3x"), policy)?.size, IconSize(pixels: 36, scale: 3))
        // The base native sends with each map, then a size and a key, as the page writes them.
        let base = IconPolicy.base(generation: 3, appearance: .dark)
        XCTAssertEqual(base, "pith://app/icon/3/dark/")
        let keys: [IconKey] = [.item(home), .item(home + "/Projects/Pith.app"), .item(home + "/Projects/My Caf\u{e9} \u{2615}\u{fe0f}"),
                               .item(home + "/Backup"), .type("tar"), .place("documents"), .folder, .group]
        for key in keys {
            XCTAssertEqual(try request(base + "12@2x/" + key.string + ".png", policy), IconRequest(key, size: IconSize(points: 12, scale: 2), appearance: .dark),
                           key.string)
        }
        XCTAssertEqual(try request(IconPolicy.base(generation: 0, appearance: .light) + "16@1x/folder.png", policy)?.appearance, .light)
    }

    func testFileTypesThePlainFolderAndTheGroupNeedNoMap() throws {
        let policy = policy(nil)
        for key: IconKey in [.type("pdf"), .type("TAR"), .type(""), .folder, .group] { XCTAssertTrue(try loads(key, policy), key.string) }
        XCTAssertFalse(try loads(.item(home), policy), "without a map, no item")
    }

    func testAPlaceNeedsAnIDTheTableHas() throws {
        let policy = policy(map)
        XCTAssertTrue(try loads(.place("documents"), policy))
        XCTAssertTrue(try loads(.place("mail"), policy))
        XCTAssertFalse(try loads(.place("trash"), policy), "this table has no Trash")
        XCTAssertFalse(try loads(.place("trash-empty"), policy), "nor an empty one")
        XCTAssertFalse(try loads(.place("nowhere"), policy))
    }

    /// The empty Trash's key needs no path, as the full one's doesn't, so the page may load either wherever the Trash is.
    func testBothOfTheTrashsIconsLoad() throws {
        let folder = { (path: String) in URL(fileURLWithPath: path, isDirectory: true) }
        let places = KnownPlaces(home: folder(home), searchPaths: [.trashDirectory: folder(home + "/.Trash")]) { _ in nil }
        let policy = IconPolicy(places: places)
        XCTAssertTrue(try loads(.place("trash"), policy))
        XCTAssertTrue(try loads(.place("trash-empty"), policy))
        XCTAssertEqual(try request(url("place/trash-empty"), policy)?.key, .place("trash-empty"))
    }

    func testTheMapsFoldersAppsAndVolumesLoadByTheirPaths() throws {
        let policy = policy(map)
        for path in [home, home + "/Projects", home + "/Projects/Pith.app", home + "/Projects/My Caf\u{e9} \u{2615}\u{fe0f}", home + "/Backup",
                     home + "/Documents/Taxes"] {
            XCTAssertTrue(try loads(.item(path), policy), path)
        }
    }

    /// Pith's icon rule gives each of these a key of another kind, so the page can't have Pith look any of them up by
    /// its path, Documents' folders included while macOS may be holding them.
    func testItemsTheMapShowsByAnotherKeyAreRefused() throws {
        let policy = policy(map)
        XCTAssertFalse(try loads(.item(home + "/Locked"), policy), "a folder the map couldn't read shows a plain folder")
        XCTAssertFalse(try loads(.item(home + "/Documents"), policy), "a known place shows its place's icon")
        XCTAssertFalse(try loads(.item(home + "/Documents/New"), policy), "a guarded folder the map hasn't listed shows a plain folder")
        XCTAssertFalse(try loads(.item(home + "/Projects/notes.pdf"), policy), "a file shows its type's icon")
        XCTAssertFalse(try loads(.item(home + "/Projects/__other__"), policy), "the smaller items show a group")
        XCTAssertFalse(try loads(.item(home + "/Documents/Taxes"), policy, asking: true), "while macOS may be holding a guarded folder")
        XCTAssertTrue(try loads(.item(home + "/Documents/Taxes"), policy), "and once it can't be")
        XCTAssertTrue(try loads(.item(home + "/Projects"), policy, asking: true), "outside the locations macOS guards, asking changes nothing")
    }

    func testPathsOutsideTheMapAreRefused() throws {
        let policy = policy(map)
        for path in ["/", "/etc", "/Users", "/Users/other", home + "/Nowhere", home + "/Projects/Pith.app/Contents", home + "/Projects 2",
                     home + "/Project", home + "/Backup/Photos"] {
            XCTAssertFalse(try loads(.item(path), policy), path)
        }
    }

    func testTheDiskMenusDisksAndActivitysAppsLoadByTheirPaths() throws {
        let policy = policy(nil, volumes: ["/", "/Volumes/Archive"], apps: ["/Applications/Safari.app"])
        XCTAssertTrue(try loads(.item("/"), policy, asking: true))
        XCTAssertTrue(try loads(.item("/Volumes/Archive"), policy, asking: true))
        XCTAssertTrue(try loads(.item("/Applications/Safari.app"), policy, asking: true))
        XCTAssertFalse(try loads(.item("/Volumes/Archive/Photos"), policy), "a disk's root, not what's on it")
        XCTAssertFalse(try loads(.item("/Volumes/Other"), policy))
        XCTAssertFalse(try loads(.item("/Applications/Mail.app"), policy))
        XCTAssertFalse(try loads(.item("/Applications/Safari.app/Contents"), policy))
    }

    /// An app's icon is looked up by its bundle's path, so an app the page names that runs from where macOS guards, as
    /// one opened from Downloads does, loads no icon.
    func testAppsWhereMacOSGuardsLoadNoIcon() throws {
        let guarded = [home + "/Downloads/Tool.app", home + "/Desktop/Old/Thing.app", home + "/Library/Containers/com.example.x/Data/Helper.app",
                       "/Volumes/Archive/Photos.photoslibrary/Editor.app"]
        let policy = policy(nil, apps: Set(guarded + [home + "/Applications/Fine.app"]))
        for path in guarded { XCTAssertFalse(try loads(.item(path), policy), path) }
        XCTAssertTrue(try loads(.item(home + "/Applications/Fine.app"), policy))
    }

    /// macOS guards removable and network volumes too, so an app the page names, as a writer or as a folder's owner,
    /// loads no icon when it lies on another disk, a share or the home automount: its icon would be looked up there.
    func testAppsOnOtherDisksLoadNoIcon() throws {
        let places = KnownPlaces(home: URL(fileURLWithPath: home, isDirectory: true), searchPaths: [:], mounts: { MountTableTests.table }) { _ in nil }
        let elsewhere = ["/Volumes/Archive/Tool.app", "/Volumes/share/Apps/Tool.app", "/System/Volumes/Data/home/tester/Tool.app"]
        let policy = IconPolicy(places: places, apps: Set(elsewhere + ["/Applications/Safari.app"]))
        for path in elsewhere { XCTAssertFalse(try loads(.item(path), policy), path) }
        XCTAssertTrue(try loads(.item("/Applications/Safari.app"), policy))
    }

    /// What the policy found in a map lasts until the map changes, and the disks and apps it allows are the ones set
    /// last, so nothing an earlier map, disk or app allowed lets a path through after a change.
    func testAChangeDropsWhatTheLastMapDisksAndAppsAllowed() throws {
        let policy = policy(map, volumes: ["/Volumes/Archive"], apps: ["/Applications/Safari.app"])
        XCTAssertTrue(try loads(.item(home + "/Projects/Pith.app"), policy), "found in the map")
        // A newer map without Projects or Backup, in which Locked could be read and Documents' New folder is listed.
        policy.map = folder(home, [
            folder(home + "/Documents", [folder(home + "/Documents/New", size: 4096)]),
            folder(home + "/Locked"),
            node(.unreadable, home + "/Projects 2"),
        ])
        for path in [home + "/Projects", home + "/Projects/Pith.app", home + "/Backup", home + "/Documents/Taxes"] {
            XCTAssertFalse(try loads(.item(path), policy), "\(path) went with the last map")
        }
        XCTAssertTrue(try loads(.item(home + "/Locked"), policy), "read in the newer map")
        XCTAssertTrue(try loads(.item(home + "/Documents/New"), policy), "listed in the newer map")
        XCTAssertFalse(try loads(.item(home + "/Documents/New"), policy, asking: true))
        XCTAssertFalse(try loads(.item(home + "/Projects 2"), policy), "unreadable in the newer map")
        policy.map = nil
        XCTAssertFalse(try loads(.item(home), policy), "no map, no items")
        policy.map = map
        XCTAssertTrue(try loads(.item(home + "/Projects/Pith.app"), policy), "back with the map")
        XCTAssertFalse(try loads(.item(home + "/Locked"), policy), "unreadable again")
        XCTAssertTrue(try loads(.item("/Volumes/Archive"), policy))
        XCTAssertTrue(try loads(.item("/Applications/Safari.app"), policy))
        policy.volumes = ["/Volumes/Other"]
        policy.apps = []
        XCTAssertFalse(try loads(.item("/Volumes/Archive"), policy), "a disk the menu no longer lists")
        XCTAssertTrue(try loads(.item("/Volumes/Other"), policy))
        XCTAssertFalse(try loads(.item("/Applications/Safari.app"), policy), "an app the page no longer names")
    }

    /// A `..` in an item's path, written out or escaped, would reach a folder of the map if the path were resolved, so
    /// it must be refused as it stands. Dot segments between the URL's own slashes never make an icon's URL either.
    func testEncodedClimbsAreRefused() throws {
        let policy = policy(map)
        let escapedHome = "%2FUsers%2Ftester"
        for key in ["item/\(escapedHome)%2FProjects%2F..%2FProjects", "item/\(escapedHome)%2FProjects%2F%2E%2E%2FProjects",
                    "item/\(escapedHome)%2FNowhere%2F%2E%2E", "item/\(escapedHome)%2F.%2FProjects", "item/\(escapedHome)%2F%2E%2FProjects",
                    "item/\(escapedHome)%2F%2FProjects", "item/\(escapedHome)%2FProjects%2F", "item/%2F..\(escapedHome)",
                    "item/\(escapedHome)/Projects", "item//Users/tester", "type/..%2F..%2Fetc", "place/..%2Fdocuments"] {
            XCTAssertNil(try request(url(key), policy), key)
        }
        for string in ["pith://app/icon/1/dark/16@2x/../../index.html.png", "pith://app/icon/1/dark/16@2x/%2E%2E/%2E%2E/folder.png",
                       "pith://app/icon/1/dark/16@2x/item/../folder.png", "pith://app/icon/../icon/1/dark/16@2x/folder.png",
                       "pith://app/icon/1/./dark/16@2x/folder.png"] {
            XCTAssertNil(try request(string, policy), string)
        }
    }

    func testUnknownPrefixesAreRefused() throws {
        let policy = policy(map)
        for key in ["thing/x", "items/%2FUsers%2Ftester", "Item/%2FUsers%2Ftester", "Folder", "folder/", "group/x", "type", "item", "place",
                    "places/documents", "%66older", ""] {
            XCTAssertNil(try request(url(key), policy), key)
        }
        for string in ["https://app/icon/1/dark/16@2x/folder.png", "pith://other/icon/1/dark/16@2x/folder.png", "pith://APP/icon/1/dark/16@2x/folder.png",
                       "pith://app/icons/1/dark/16@2x/folder.png", "pith://app/x/icon/1/dark/16@2x/folder.png", "pith://app/%69con/1/dark/16@2x/folder.png",
                       "pith://app/index.html", "pith://app/icon/", "pith://app/icon/1/dark/16@2x/folder.svg", "pith://app/icon/1/dark/16@2x/folder",
                       "pith://app/icon/1/dark/16@2x/folder.PNG", "pith://app/icon/1/dark/16@2x/folder.png?v=2", "pith://app/icon/1/dark/16@2x/folder.png?",
                       "pith://app/icon/1/dark/16@2x/folder.png#top", "pith://me@app/icon/1/dark/16@2x/folder.png",
                       "pith://app:8080/icon/1/dark/16@2x/folder.png", "pith://app/icon/1/dark/folder.png", "pith://app/icon/dark/16@2x/folder.png",
                       "pith://app/icon/1/16@2x/folder.png", "pith://app/icon//dark/16@2x/folder.png"] {
            XCTAssertNil(try request(string, policy), string)
        }
    }

    /// The store draws 1 to 1,024 pixels a side at 1x to 3x. A size it would change is refused rather than drawn at
    /// another size, and each size has one spelling, so each URL names one drawing.
    func testOnlySizesTheStoreDrawsAreAccepted() throws {
        let policy = policy(nil)
        for size in ["1@1x", "12@1x", "14@2x", "16@3x", "341@3x", "512@2x", "1024@1x"] {
            XCTAssertNotNil(try request(url("folder", size: size), policy), size)
        }
        for size in ["16", "16@2", "16@x", "@2x", "16@4x", "16@0x", "0@2x", "513@2x", "342@3x", "1025@1x", "016@2x", "16@02x", "+16@2x", "-16@2x",
                     "16.5@2x", "16@2.0x", "16@2X", "16x2", "16@2x@2x", "99999999999999999999@1x", "9223372036854775807@3x", ""] {
            XCTAssertNil(try request(url("folder", size: size), policy), size)
        }
    }

    func testGenerationsAndAppearances() throws {
        let policy = policy(nil)
        for generation in ["0", "1", "42", "9223372036854775807"] {
            XCTAssertNotNil(try request(url("folder", generation: generation), policy), generation)
        }
        for generation in ["", "a", "-1", "01", "1.0", "+1", "1e3", "9223372036854775808"] {
            XCTAssertNil(try request(url("folder", generation: generation), policy), generation)
        }
        XCTAssertEqual(try request(url("folder", appearance: "light"), policy)?.appearance, .light)
        XCTAssertEqual(try request(url("folder", appearance: "dark"), policy)?.appearance, .dark)
        for appearance in ["", "Dark", "auto", "darkAqua"] {
            XCTAssertNil(try request(url("folder", appearance: appearance), policy), appearance)
        }
    }
}
