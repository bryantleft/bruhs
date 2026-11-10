import XCTest
@testable import PithCore

/// The disks a test mounts, which it can change between looks, as an eject and a mount do.
final class Disks: @unchecked Sendable {
    private let lock = NSLock()
    private var mounted: MountTable

    init(_ table: MountTable) { mounted = table }

    var table: MountTable {
        get { lock.lock(); defer { lock.unlock() }; return mounted }
        set { lock.lock(); mounted = newValue; lock.unlock() }
    }
}

final class KnownPlacesTests: XCTestCase {
    /// A home folder of the test's own. Nothing in it exists: making the table must not touch a folder.
    private let home = FileManager.default.temporaryDirectory.appendingPathComponent("pith-test-home-\(UUID().uuidString)")
    /// Every app the table asks for, at made-up paths, so no test depends on what this Mac has installed.
    private let apps: [String: URL] = [
        "com.apple.Photos": URL(fileURLWithPath: "/Test Apps/Photos.app"),
        "com.apple.mail": URL(fileURLWithPath: "/Test Apps/Mail.app"),
        "com.apple.MobileSMS": URL(fileURLWithPath: "/Test Apps/Messages.app"),
        "com.apple.dt.Xcode": URL(fileURLWithPath: "/Test Apps/Xcode.app"),
        "com.apple.finder.Open-iCloudDrive": URL(fileURLWithPath: "/Test Apps/iCloud Drive.app"),
        "com.apple.Music": URL(fileURLWithPath: "/Test Apps/Music.app"),
        "com.apple.TV": URL(fileURLWithPath: "/Test Apps/TV.app"),
        "com.apple.iBooksX": URL(fileURLWithPath: "/Test Apps/Books.app"),
        "com.apple.podcasts": URL(fileURLWithPath: "/Test Apps/Podcasts.app"),
    ]

    private func path(_ relative: String) -> String { home.appendingPathComponent(relative).path }

    /// The table for the test home, as `FileManager.urls(for:in:)` lays a home out, with the apps not in `missing`.
    private func places(missing: Set<String> = []) -> KnownPlaces {
        let searchPaths: [FileManager.SearchPathDirectory: URL] = [
            .applicationDirectory: URL(fileURLWithPath: "/Applications"),
            .desktopDirectory: home.appendingPathComponent("Desktop"),
            .documentDirectory: home.appendingPathComponent("Documents"),
            .downloadsDirectory: home.appendingPathComponent("Downloads"),
            .moviesDirectory: home.appendingPathComponent("Movies"),
            .musicDirectory: home.appendingPathComponent("Music"),
            .picturesDirectory: home.appendingPathComponent("Pictures"),
            .trashDirectory: home.appendingPathComponent(".Trash"),
        ]
        return KnownPlaces(home: home, searchPaths: searchPaths) { missing.contains($0) ? nil : self.apps[$0] }
    }

    func testPlacesSitWhereTheTestHomeKeepsThem() {
        let table = places()
        let expected: [String: (path: String, name: String)] = [
            "photos-library": (path("Pictures/Photos Library.photoslibrary"), "Photos Library"),
            "mail": (path("Library/Mail"), "Mail"),
            "messages": (path("Library/Messages"), "Messages"),
            "developer": (path("Library/Developer"), "Developer"),
            "icloud-drive": (path("Library/Mobile Documents"), "iCloud Drive"),
            "downloads": (path("Downloads"), "Downloads"),
            "documents": (path("Documents"), "Documents"),
            "desktop": (path("Desktop"), "Desktop"),
            "applications": ("/Applications", "Applications"),
            "trash": (path(".Trash"), "Trash"),
            "backups": (path("Library/Application Support/MobileSync/Backup"), "iPhone and iPad backups"),
            "music": (path("Music/Music"), "Music"),
            "tv": (path("Movies/TV"), "TV"),
            "books": (path("Library/Containers/com.apple.BKAgentService/Data/Documents/iBooks/Books"), "Books"),
            "podcasts": (path("Library/Group Containers/243LU875E5.groups.com.apple.podcasts/Library/Cache"), "Podcasts"),
        ]
        XCTAssertEqual(Set(table.places.map(\.id)), Set(expected.keys))
        for place in table.places {
            XCTAssertEqual(place.path, expected[place.id]?.path, place.id)
            XCTAssertEqual(place.name, expected[place.id]?.name, place.id)
        }
        XCTAssertFalse(FileManager.default.fileExists(atPath: home.path), "making the table touched the home folder")
    }

    func testAPlaceWithoutItsSearchPathIsLeftOut() {
        let table = KnownPlaces(home: home, searchPaths: [:]) { _ in nil }
        XCTAssertNil(table.place(id: "documents"))
        XCTAssertNil(table.place(id: "trash"))
        XCTAssertEqual(table.place(id: "mail")?.path, path("Library/Mail"), "places in the home folder's Library need no search path")
    }

    func testSpecialFoldersDrawTheirOwnTypes() {
        let table = places()
        XCTAssertEqual(table.place(id: "documents")?.icon, .type("com.apple.documents-folder"))
        XCTAssertEqual(table.place(id: "downloads")?.icon, .type("com.apple.downloads-folder"))
        XCTAssertEqual(table.place(id: "desktop")?.icon, .type("com.apple.desktop-folder"))
        XCTAssertEqual(table.place(id: "applications")?.icon, .type("com.apple.applications-folder"))
        XCTAssertEqual(table.place(id: "backups")?.icon, .type("public.folder"), "the spec names no icon for backups")
    }

    func testFoundAppsGiveTheirPlacesTheirIcons() {
        let table = places()
        XCTAssertEqual(table.place(id: "mail")?.icon, .app(bundleID: "com.apple.mail", path: "/Test Apps/Mail.app"))
        XCTAssertEqual(table.place(id: "messages")?.icon, .app(bundleID: "com.apple.MobileSMS", path: "/Test Apps/Messages.app"))
        XCTAssertEqual(table.place(id: "photos-library")?.icon, .app(bundleID: "com.apple.Photos", path: "/Test Apps/Photos.app"))
        XCTAssertEqual(table.place(id: "developer")?.icon, .app(bundleID: "com.apple.dt.Xcode", path: "/Test Apps/Xcode.app"))
        XCTAssertEqual(table.place(id: "icloud-drive")?.icon,
                       .app(bundleID: "com.apple.finder.Open-iCloudDrive", path: "/Test Apps/iCloud Drive.app"))
        XCTAssertEqual(table.place(id: "music")?.icon, .app(bundleID: "com.apple.Music", path: "/Test Apps/Music.app"))
        XCTAssertEqual(table.place(id: "tv")?.icon, .app(bundleID: "com.apple.TV", path: "/Test Apps/TV.app"))
        XCTAssertEqual(table.place(id: "books")?.icon, .app(bundleID: "com.apple.iBooksX", path: "/Test Apps/Books.app"))
        XCTAssertEqual(table.place(id: "podcasts")?.icon, .app(bundleID: "com.apple.podcasts", path: "/Test Apps/Podcasts.app"))
    }

    func testAMissingAppFallsBackAsTheSpecSays() {
        let table = places(missing: Set(apps.keys))
        XCTAssertEqual(table.place(id: "developer")?.icon, .type("com.apple.developer-folder"), "Developer without Xcode")
        XCTAssertEqual(table.place(id: "icloud-drive")?.icon, .symbol("icloud"), "iCloud Drive without its app in Finder")
        XCTAssertEqual(table.place(id: "photos-library")?.icon, .type("com.apple.photos.library"), "the library's own package icon")
        for id in ["mail", "messages", "music", "tv", "books", "podcasts"] {
            XCTAssertEqual(table.place(id: id)?.icon, .type("public.folder"), id)
        }
        // One app missing leaves the others alone.
        XCTAssertEqual(places(missing: ["com.apple.mail"]).place(id: "messages")?.icon,
                       .app(bundleID: "com.apple.MobileSMS", path: "/Test Apps/Messages.app"))
    }

    func testATypeThisMacDoesntDeclareFallsBackToAPlainFolder() {
        XCTAssertEqual(KnownPlaces.icon(choosing: [.type("app.bruhs.pith.no-such-folder")]) { _ in nil }, .type("public.folder"))
        XCTAssertEqual(KnownPlaces.icon(choosing: [.type("app.bruhs.pith.no-such-folder"), .type("com.apple.documents-folder")]) { _ in nil },
                       .type("com.apple.documents-folder"))
        XCTAssertEqual(KnownPlaces.icon(choosing: []) { _ in nil }, .type("public.folder"))
    }

    /// The Trash has two icons, macOS's full and empty Trash, each under a key of its own, so a key always draws the same
    /// art and the icon store can keep it. The empty one is the Trash's state, not a place of its own: it's at the same
    /// path, and no list of places names it.
    func testTheTrashHasAnIconForEachState() throws {
        let table = places()
        let trash = try XCTUnwrap(table.place(id: "trash")), empty = try XCTUnwrap(table.place(id: "trash-empty"))
        XCTAssertEqual(trash.icon, .type("com.apple.trash-full"))
        XCTAssertEqual(empty.icon, .type("com.apple.trash-empty"))
        XCTAssertEqual(table.drawnIcon(of: empty), .type("com.apple.trash-empty"))
        XCTAssertEqual([empty.path, empty.name], [trash.path, trash.name])
        XCTAssertTrue(empty.isProtected)
        XCTAssertEqual(table.place(at: trash.path)?.id, "trash")
        XCTAssertFalse(table.places.contains { $0.id == "trash-empty" })
        XCTAssertFalse(table.iconRule(asking: false).places.contains { $0.id == "trash-empty" }, "the page's rule finds the Trash by its path")
        XCTAssertNil(KnownPlaces(home: home, searchPaths: [:]) { _ in nil }.place(id: "trash-empty"), "no Trash, no empty Trash")
    }

    /// The Trash holds nothing, by what the scanner says of it: the live map's index has listed it and counts no bytes in
    /// it (its place in the tree line; a Trash found and not listed yet isn't named), and the tree, where it draws the
    /// Trash, draws nothing in it. A scanned map, which lists every folder it can read, says so by its tree alone, and a
    /// live map's tree never does: before its first tree's places come, nothing says so.
    func testTheTrashHoldsNothingOnlyOnceTheScannerSaysSo() {
        let table = places(), trash = path(".Trash")
        func inHome(_ children: [DiskNode]) -> DiskNode {
            DiskNode(kind: .dir, name: home.lastPathComponent, path: home.path, size: 1, files: 1, children: children)
        }
        let folded = inHome([DiskNode(kind: .aggregate, name: "(smaller items)", path: home.path + "/__other__", size: 1, files: 1, children: nil)])
        let drawn = inHome([DiskNode(kind: .dir, name: ".Trash", path: trash, size: 0, files: 0, children: nil)])
        let emptyFiles = inHome([DiskNode(kind: .dir, name: ".Trash", path: trash, size: 0, files: 2, children: [
            DiskNode(kind: .aggregate, name: "(smaller items)", path: trash + "/__other__", size: 0, files: 2, children: nil),
        ])])
        XCTAssertTrue(table.trashHoldsNothing(in: folded, scanned: false, live: [LivePlace(path: trash, size: 0)]), "listed, no bytes, folded away")
        XCTAssertTrue(table.trashHoldsNothing(in: drawn, scanned: false, live: [LivePlace(path: trash, size: 0)]), "listed, drawn holding nothing")
        XCTAssertFalse(table.trashHoldsNothing(in: drawn, scanned: false, live: []), "found and not listed yet: the scanner names no such place")
        XCTAssertFalse(table.trashHoldsNothing(in: folded, scanned: false, live: [LivePlace(path: trash, size: nil)]), "the map can't read it")
        XCTAssertFalse(table.trashHoldsNothing(in: folded, scanned: false, live: [LivePlace(path: trash, size: 2_000_000_000)]))
        XCTAssertFalse(table.trashHoldsNothing(in: emptyFiles, scanned: false, live: [LivePlace(path: trash, size: 0)]), "it draws empty files in it")
        XCTAssertTrue(table.trashHoldsNothing(in: drawn, scanned: true, live: []), "a scan's own folder, listed")
        XCTAssertFalse(table.trashHoldsNothing(in: nil, scanned: false, live: []), "no map")
        XCTAssertFalse(table.trashHoldsNothing(in: folded, scanned: true, live: []), "a scan that doesn't draw it says nothing of it")
        XCTAssertFalse(table.trashHoldsNothing(in: inHome([DiskNode(kind: .unreadable, name: ".Trash", path: trash, size: 0, reason: .protected, files: nil, children: nil)]),
                                               scanned: true, live: []), "a scan that couldn't read it")
        XCTAssertFalse(KnownPlaces(home: home, searchPaths: [:]) { _ in nil }.trashHoldsNothing(in: drawn, scanned: false, live: [LivePlace(path: trash, size: 0)]),
                       "no Trash")
    }

    /// The Trash shows macOS's empty Trash while it holds nothing, by the scanner's word (`trashHoldsNothing`), and the
    /// map's own block of it, if it draws one, draws nothing in it; otherwise the full Trash, as when the map couldn't
    /// read it or hasn't listed it yet.
    func testTheTrashsIconSaysWhetherItHoldsAnything() {
        let table = places()
        func trash(_ kind: DiskNode.Kind = .dir, size: UInt64 = 0, files: UInt64? = 0, children: [DiskNode]? = nil) -> DiskNode {
            DiskNode(kind: kind, name: ".Trash", path: path(".Trash"), size: size, reason: kind == .unreadable ? .protected : nil, files: files, children: children)
        }
        let emptyFiles = DiskNode(kind: .aggregate, name: "(smaller items)", path: path(".Trash/__other__"), size: 0, files: 2, children: nil)
        XCTAssertEqual(table.iconKey(for: trash(), asking: false, trashIsEmpty: true), .place("trash-empty"), "the scanner leaves an empty folder's children out")
        XCTAssertEqual(table.iconKey(for: trash(children: []), asking: true, trashIsEmpty: true), .place("trash-empty"))
        XCTAssertEqual(table.iconKey(for: trash(files: nil), asking: false, trashIsEmpty: true), .place("trash-empty"), "as the path bar has it above a map's root")
        XCTAssertEqual(table.iconKey(for: trash(), asking: false, trashIsEmpty: false), .place("trash"), "found and not listed yet, it looks empty")
        XCTAssertEqual(table.iconKey(for: trash(size: 4096, files: 1), asking: false, trashIsEmpty: true), .place("trash"))
        XCTAssertEqual(table.iconKey(for: trash(files: 2, children: [emptyFiles]), asking: false, trashIsEmpty: true), .place("trash"), "empty files are something")
        XCTAssertEqual(table.iconKey(for: trash(.unreadable, files: nil), asking: false, trashIsEmpty: true), .place("trash"), "the map can't read it")
        XCTAssertEqual(table.ownerKey(for: path(".Trash")) { _ in nil }, .place("trash"), "a Trash the map couldn't read, in the unreadable list")
        let downloads = DiskNode(kind: .dir, name: "Downloads", path: path("Downloads"), size: 0, files: 0, children: nil)
        XCTAssertEqual(table.iconKey(for: downloads, asking: false, trashIsEmpty: true), .place("downloads"), "only the Trash has an empty state")
    }

    /// Places gives the Trash the state it has everywhere else: empty once the scanner has listed it and counts no bytes in
    /// it, whether the map folds it into the home folder's smaller items, as it does an empty Trash, or draws it, as when
    /// it's the folder open. A Trash found and not listed yet has no row.
    func testPlacesGivesTheTrashTheStateItHasEverywhere() {
        let table = places(), trash = path(".Trash")
        func key(_ tree: DiskNode, _ live: [LivePlace]) -> String? {
            table.placesTable(for: tree, mapRoot: "/", live: live).places.first { $0.id == "trash" }?.key
        }
        let open = DiskNode(kind: .dir, name: home.lastPathComponent, path: home.path, size: 1, files: 1, children: [
            DiskNode(kind: .dir, name: ".Trash", path: trash, size: 0, files: 0, children: nil),
        ])
        XCTAssertEqual(key(homeMap, [LivePlace(path: trash, size: 0)]), "place/trash-empty", "folded into the smaller items")
        XCTAssertEqual(key(open, [LivePlace(path: trash, size: 0)]), "place/trash-empty", "the folder open, holding nothing")
        XCTAssertEqual(key(homeMap, [LivePlace(path: trash, size: 2_000_000_000)]), "place/trash")
        XCTAssertEqual(key(homeMap, [LivePlace(path: trash, size: nil)]), "place/trash", "the map can't read it")
        XCTAssertNil(key(homeMap, []), "found and not listed yet")
        XCTAssertEqual(key(homeMap, [LivePlace(path: path("Library/Developer"), size: 0), LivePlace(path: trash, size: 0)]), "place/trash-empty",
                       "among the other places")
    }

    func testPlacesAreFoundByIDAndByPath() {
        let table = places()
        XCTAssertEqual(table.place(at: path("Documents"))?.id, "documents")
        XCTAssertEqual(table.place(at: "/Applications")?.id, "applications")
        XCTAssertNil(table.place(at: path("Documents/Taxes")), "a folder inside a place isn't the place")
        XCTAssertNil(table.place(at: home.path))
        XCTAssertEqual(table.place(id: "mail")?.path, path("Library/Mail"))
        XCTAssertNil(table.place(id: "nowhere"))
    }

    func testLocationsMacOSGuards() {
        let table = places()
        for guarded in ["Desktop", "Documents", "Documents/Taxes/2026", "Downloads/Pith.dmg", "Library/Mobile Documents/com~apple~CloudDocs",
                        "Library/Mail/V10", "Library/Messages", ".Trash", "Pictures/Photos Library.photoslibrary/originals",
                        "Library/Containers/com.apple.Notes/Data", "Library/Group Containers/group.com.apple.notes", "Library/CloudStorage/Dropbox",
                        "Library/Application Support/MobileSync/Backup/0000", "Library/Containers/com.apple.BKAgentService/Data/Documents/iBooks/Books",
                        "Library/Group Containers/243LU875E5.groups.com.apple.podcasts/Library/Cache"] {
            XCTAssertTrue(table.isProtected(path(guarded)), guarded)
        }
        XCTAssertTrue(table.isProtected("/Volumes/Archive/Old.photoslibrary/database"), "any Photos library, as Move to Trash treats one")
        for open in ["", "Library", "Library/Developer/Xcode/DerivedData", "Music/Music", "DocumentsOld", "Projects/Desktop"] {
            XCTAssertFalse(table.isProtected(path(open)), open)
        }
        XCTAssertFalse(table.isProtected("/Applications/Xcode.app"))
        XCTAssertFalse(table.isProtected("/"))
    }

    /// The live map shows a folder it has found in its parent's listing, but not listed itself, with no size, files or
    /// contents, whether or not macOS is holding its listing at that moment, as in the first half second of a listing
    /// macOS blocks, or after a launch, when folders still waiting on macOS at the last save are listed again.
    func testAFolderTheMapHasntListedIsntLookedUpByItsPathWhereMacOSGuards() {
        let table = places()
        func folder(_ relative: String, size: UInt64 = 0, files: UInt64 = 0, children: [DiskNode] = []) -> DiskNode {
            DiskNode(kind: .dir, name: (relative as NSString).lastPathComponent, path: path(relative), size: size, files: files, children: children)
        }
        let file = DiskNode(kind: .file, name: "a.pdf", path: path("Documents/New/a.pdf"), size: 0, children: nil)
        XCTAssertEqual(table.iconKey(for: folder("Documents/New"), asking: false), .folder, "not listed yet")
        XCTAssertEqual(table.iconKey(for: folder("Library/Containers/com.apple.Notes/Data"), asking: false), .folder)
        XCTAssertEqual(table.iconKey(for: folder("Documents/New", size: 4096), asking: false), .item(path("Documents/New")))
        XCTAssertEqual(table.iconKey(for: folder("Documents/New", files: 2), asking: false), .item(path("Documents/New")), "empty files")
        XCTAssertEqual(table.iconKey(for: folder("Documents/New", children: [file]), asking: false), .item(path("Documents/New")))
        XCTAssertEqual(table.iconKey(for: folder("Documents/New", size: 4096), asking: true), .folder, "listed, but macOS is asking")
        // Outside the locations macOS guards, a folder not listed yet is looked up by its path as any other.
        XCTAssertEqual(table.iconKey(for: folder("Projects/New"), asking: false), .item(path("Projects/New")))
    }

    /// The places the disk map's Places section offers are the ones the spec names, in the table's order: Apple's Storage
    /// categories and its checklist's backups, not every folder the table keeps an icon for.
    func testTheSectionOffersThePlacesTheSpecNames() {
        let table = places()
        XCTAssertEqual(table.shortcuts.map(\.id), ["photos-library", "mail", "messages", "developer", "icloud-drive", "downloads", "documents",
                                                   "applications", "trash", "backups"])
        XCTAssertEqual(table.home, home.path)
    }

    private func folder(_ relative: String, size: UInt64, children: [DiskNode] = []) -> DiskNode {
        DiskNode(kind: .dir, name: (relative as NSString).lastPathComponent, path: path(relative), size: size, files: 1, children: children)
    }

    /// A live map of the test home, as the page has it: Developer has a block of its own, Mail couldn't be read, and
    /// Downloads is too small for a block, so it's among the home folder's smaller items.
    private var homeMap: DiskNode {
        DiskNode(kind: .dir, name: home.lastPathComponent, path: home.path, size: 9_000_000_000, files: 12, children: [
            folder("Library", size: 7_000_000_000, children: [
                folder("Library/Developer", size: 6_000_000_000),
                DiskNode(kind: .unreadable, name: "Mail", path: path("Library/Mail"), size: 0, reason: .protected, children: nil),
                folder("Library/Caches", size: 1_000_000_000),
            ]),
            DiskNode(kind: .aggregate, name: "(smaller items)", path: home.path + "/__other__", size: 2_000_000_000, files: 11, children: nil),
        ])
    }

    func testThePlacesSectionGivesEachPlaceTheFigureTheMapShows() throws {
        let table = places()
        let live = [
            // The index has moved on since the map was made: Move to Trash took an item out of the map, which the live
            // map's next tree catches up with.
            LivePlace(path: path("Library/Developer"), size: 6_100_000_000),
            LivePlace(path: path("Library/Mail"), size: nil),
            LivePlace(path: path("Library/Mobile Documents"), size: nil, asking: true),
            LivePlace(path: path("Downloads"), size: 800_000_000),
            // Known places the section doesn't offer.
            LivePlace(path: path("Desktop"), size: 5_000_000_000),
            LivePlace(path: path("Music/Music"), size: 5_000_000_000),
        ]
        let sent = table.placesTable(for: homeMap, mapRoot: "/", live: live)
        XCTAssertEqual(sent.shownAt, ["/", home.path], "the startup disk's root and the home folder")
        XCTAssertEqual(sent.places.map(\.id), ["mail", "developer", "icloud-drive", "downloads"], "the table's order, with only the places the index has")
        let developer = try XCTUnwrap(sent.places.first { $0.id == "developer" })
        XCTAssertEqual(developer, PlacesTable.Place(id: "developer", name: "Developer", path: path("Library/Developer"), key: "place/developer", size: 6_000_000_000),
                       "the figure the map shows")
        XCTAssertEqual(sent.places.first { $0.id == "downloads" }?.size, 800_000_000, "the index's own figure for a place the map folds away")
        XCTAssertEqual(sent.places.first { $0.id == "mail" }, PlacesTable.Place(id: "mail", name: "Mail", path: path("Library/Mail"), key: "place/mail", size: nil),
                       "macOS keeps Pith out, until it has Full Disk Access")
        let iCloud = try XCTUnwrap(sent.places.first { $0.id == "icloud-drive" })
        XCTAssertNil(iCloud.size)
        XCTAssertTrue(iCloud.asking, "waiting on the person's answer to macOS's question")
        XCTAssertFalse(developer.asking)
        XCTAssertEqual(table.placesTable(for: homeMap, mapRoot: "/", live: []).places, [], "a map whose index names no place")
    }

    func testThePlacesTableTravelsAsThePageReadsIt() throws {
        let sent = PlacesTable(shownAt: ["/", "/Users/x"], places: [
            PlacesTable.Place(id: "mail", name: "Mail", path: "/Users/x/Library/Mail", key: "place/mail", size: nil, asking: true),
            PlacesTable.Place(id: "developer", name: "Developer", path: "/Users/x/Library/Developer", key: "place/developer", size: 6_000_000_000),
        ])
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(sent)) as? [String: Any])
        XCTAssertEqual(Set(json.keys), ["shownAt", "places"])
        let places = try XCTUnwrap(json["places"] as? [[String: Any]])
        XCTAssertEqual(places.map { Set($0.keys) }, [["id", "name", "path", "key", "size", "asking"], ["id", "name", "path", "key", "size", "asking"]])
        XCTAssertTrue(places[0]["size"] is NSNull, "no size where Pith can't read it")
        XCTAssertEqual(places[0]["asking"] as? Bool, true)
        XCTAssertEqual(places[1]["size"] as? UInt64, 6_000_000_000)
        XCTAssertEqual(places[1]["asking"] as? Bool, false)
    }

    /// A folder the map couldn't read shows the icon of the app it belongs to when Pith can tell, without looking the
    /// folder up: LaunchServices is asked only for a container's app, by the container's bundle ID.
    func testAFolderTheMapCouldntReadShowsTheAppThatOwnsIt() {
        let table = places()
        let found = ["com.apple.Notes": URL(fileURLWithPath: "/Test Apps/Notes.app"), "com.example.Downloaded": URL(fileURLWithPath: path("Downloads/Downloaded.app"))]
        var asked: [String] = []
        func owner(_ relative: String) -> IconKey {
            table.ownerKey(for: relative.hasPrefix("/") ? relative : path(relative)) { asked.append($0); return found[$0] }
        }
        XCTAssertEqual(owner("Library/Mail"), .place("mail"), "a known place shows its own icon")
        XCTAssertEqual(owner("Library/Mail/V10"), .item("/Test Apps/Mail.app"), "inside a place, the app it belongs to")
        XCTAssertEqual(owner("Library/Developer/CoreSimulator/Devices"), .item("/Test Apps/Xcode.app"))
        XCTAssertEqual(owner("Pictures/Photos Library.photoslibrary/database"), .item("/Test Apps/Photos.app"))
        XCTAssertEqual(asked, [], "a place's app was found with the table")
        XCTAssertEqual(owner("Library/Containers/com.apple.Notes"), .item("/Test Apps/Notes.app"), "another app's container, by its bundle ID")
        XCTAssertEqual(owner("Library/Containers/com.apple.Notes/Data"), .item("/Test Apps/Notes.app"), "and what's inside it")
        XCTAssertEqual(owner("Library/Containers/com.example.Gone/Data"), .folder, "a container whose app this Mac doesn't have")
        XCTAssertEqual(owner("Library/Containers/com.example.Downloaded/Data"), .folder, "an app where macOS guards is never looked up")
        XCTAssertEqual(asked, ["com.apple.Notes", "com.apple.Notes", "com.example.Gone", "com.example.Downloaded"])
        for plain in ["Documents/Locked", "Library/Containers", "Library/Group Containers/group.com.apple.notes", "Library/Safari", "/private/var/db/sudo"] {
            XCTAssertEqual(owner(plain), .folder, plain)
        }
        XCTAssertEqual(places(missing: ["com.apple.mail"]).ownerKey(for: path("Library/Mail/V10")) { _ in nil }, .folder, "a place without its app")
    }

    /// macOS guards removable and network volumes, so an app on another disk, a share or an automount is never looked
    /// up: a container's app found there, a place's app found there, and an app the page names all show none.
    func testAnAppOnAnotherDiskIsNeverLookedUp() {
        let table = KnownPlaces(home: home, searchPaths: [:], mounts: { MountTableTests.table }) {
            $0 == "com.apple.mail" ? URL(fileURLWithPath: "/Volumes/Archive/Mail.app") : nil
        }
        let notes = path("Library/Containers/com.apple.Notes/Data")
        XCTAssertEqual(table.ownerKey(for: notes) { _ in URL(fileURLWithPath: "/Volumes/Archive/Notes.app") }, .folder, "a container's app on another disk")
        XCTAssertEqual(table.ownerKey(for: notes) { _ in URL(fileURLWithPath: "/System/Applications/Notes.app") }, .item("/System/Applications/Notes.app"))
        XCTAssertEqual(table.ownerKey(for: path("Library/Mail/V10")) { _ in nil }, .folder, "a place's app on another disk")
        for app in ["/Volumes/Archive/Tool.app", "/Volumes/share/Tool.app", "/System/Volumes/Data/home/tester/Tool.app", path("Library/Containers/x/Data/Tool.app")] {
            XCTAssertFalse(table.mayShowApp(app), app)
        }
        XCTAssertTrue(table.mayShowApp("/Applications/Tool.app"))
        XCTAssertTrue(table.mayShowApp("/System/Volumes/Preboot/Cryptexes/App/System/Applications/Safari.app"))
    }

    /// Activity's app icons follow the Disk tab's rule: an app Pith may look up by its bundle's path (`mayShowApp`) shows
    /// its own icon, any other app the generic application icon, running or not, since macOS's icon for a running app
    /// is drawn from its bundle's path too, and anything else the generic executable's.
    func testActivitysAppIconsFollowThePrivacyRule() {
        let table = KnownPlaces(home: home, searchPaths: [.downloadsDirectory: home.appendingPathComponent("Downloads")], mounts: { MountTableTests.table }) { _ in nil }
        XCTAssertEqual(table.appIconSource(for: "/Applications/Safari.app"), .bundle("/Applications/Safari.app"))
        XCTAssertEqual(table.appIconSource(for: "/Applications/Xcode.app/Contents/MacOS/Xcode"), .bundle("/Applications/Xcode.app"), "an app's executable, by its bundle")
        XCTAssertEqual(table.appIconSource(for: "/System/Volumes/Preboot/Cryptexes/App/System/Applications/Safari.app"),
                       .bundle("/System/Volumes/Preboot/Cryptexes/App/System/Applications/Safari.app"))
        for elsewhere in [path("Downloads/Tool.app"), path("Downloads/Tool.app/Contents/MacOS/Tool"), "/Volumes/Archive/Tool.app",
                          "/Volumes/share/Apps/Tool.app/Contents/MacOS/Tool", "/System/Volumes/Data/home/tester/Tool.app",
                          path("Library/Containers/com.example.x/Data/Helper.app")] {
            XCTAssertEqual(table.appIconSource(for: elsewhere), .application, elsewhere)
        }
        for tool in ["/usr/bin/swift", "/opt/homebrew/bin/node", "", path("Downloads/tool")] {
            XCTAssertEqual(table.appIconSource(for: tool), .executable, tool)
        }
    }

    /// A known place's app is looked up by its bundle's path only where Pith may look an app up (`mayShowApp`): Xcode in
    /// Downloads, which macOS guards, gives Developer its special folder's icon instead, and Mail on another disk a plain
    /// folder, as each would have without its app. An app on the startup disk, outside them, still gives its place its
    /// icon.
    func testAPlacesAppWhereMacOSGuardsOrOnAnotherDiskIsntLookedUp() {
        let found = ["com.apple.dt.Xcode": home.appendingPathComponent("Downloads/Xcode.app"), "com.apple.mail": URL(fileURLWithPath: "/Volumes/Archive/Mail.app"),
                     "com.apple.Photos": URL(fileURLWithPath: "/System/Applications/Photos.app")]
        let table = KnownPlaces(home: home, searchPaths: [.downloadsDirectory: home.appendingPathComponent("Downloads"),
                                                          .picturesDirectory: home.appendingPathComponent("Pictures")],
                                mounts: { MountTableTests.table }) { found[$0] }
        XCTAssertEqual(table.place(id: "developer")?.icon, .type("com.apple.developer-folder"), "Xcode where macOS guards")
        XCTAssertEqual(table.place(id: "mail")?.icon, .type("public.folder"), "Mail on another disk")
        XCTAssertEqual(table.place(id: "photos-library")?.icon, .app(bundleID: "com.apple.Photos", path: "/System/Applications/Photos.app"))
        for id in ["developer", "mail", "photos-library"] {
            let place = table.place(id: id)
            XCTAssertEqual(place.map(table.drawnIcon), place?.icon, id)
        }
    }

    /// The table is made once, at launch, but the disks can change after it: a place's app on a disk that was ejected
    /// since, with another mounted where it was, isn't drawn by its path. The place draws the icon it would have without
    /// the app.
    func testAPlacesAppOnADiskEjectedSinceIsDrawnAsWithoutIt() throws {
        let disks = Disks(MountTable([.init(path: "/", from: "/dev/disk3s1s1"), .init(path: "/Volumes/Fast", from: "/dev/disk3s7")]))
        let table = KnownPlaces(home: home, searchPaths: [:], mounts: { disks.table }) {
            ["com.apple.dt.Xcode": URL(fileURLWithPath: "/Volumes/Fast/Xcode.app"), "com.apple.mail": URL(fileURLWithPath: "/Volumes/Fast/Mail.app")][$0]
        }
        let developer = try XCTUnwrap(table.place(id: "developer")), mail = try XCTUnwrap(table.place(id: "mail"))
        XCTAssertEqual(developer.icon, .app(bundleID: "com.apple.dt.Xcode", path: "/Volumes/Fast/Xcode.app"), "a volume of the startup disk's container")
        XCTAssertEqual(table.drawnIcon(of: developer), developer.icon)
        disks.table = MountTable([.init(path: "/", from: "/dev/disk3s1s1"), .init(path: "/Volumes/Fast", from: "/dev/disk5s1")])
        XCTAssertEqual(table.drawnIcon(of: developer), .type("com.apple.developer-folder"))
        XCTAssertEqual(table.drawnIcon(of: mail), .type("public.folder"))
        let iCloud = try XCTUnwrap(table.place(id: "icloud-drive"))
        XCTAssertEqual(table.drawnIcon(of: iCloud), .symbol("icloud"), "an icon that's no app draws as it is")
    }

    func testTheMapsUnreadableFoldersNameTheAppsThatOwnThem() {
        let table = places()
        let notes = path("Library/Containers/com.apple.Notes/Data"), devices = path("Library/Developer/Devices")
        let tree = DiskNode(kind: .dir, name: home.lastPathComponent, path: home.path, size: 2, files: 2, children: [
            folder("Library", size: 2, children: [
                DiskNode(kind: .unreadable, name: "Mail", path: path("Library/Mail"), size: 0, reason: .protected, children: nil),
                folder("Library/Developer", size: 1, children: [
                    DiskNode(kind: .unreadable, name: "Devices", path: devices, size: 0, reason: .denied, children: nil),
                    folder("Library/Developer/Xcode", size: 1),
                ]),
                folder("Library/Containers", size: 1, children: [
                    folder("Library/Containers/com.apple.Notes", size: 1, children: [
                        DiskNode(kind: .unreadable, name: "Data", path: notes, size: 0, reason: .protected, children: nil),
                    ]),
                ]),
                DiskNode(kind: .unreadable, name: "Safari", path: path("Library/Safari"), size: 0, reason: .protected, children: nil),
            ]),
        ])
        let owners = table.owners(in: tree) { $0 == "com.apple.Notes" ? URL(fileURLWithPath: "/Test Apps/Notes.app") : nil }
        // Mail shows its place's icon by the rule, and Safari's folder has no owner Pith can tell: a plain folder.
        XCTAssertEqual(owners, [devices: .item("/Test Apps/Xcode.app"), notes: .item("/Test Apps/Notes.app")])
        // A map of a folder inside a container or a place, as when the person chose one, names its owners too.
        let container = folder("Library/Containers/com.apple.Notes", size: 1, children: [
            DiskNode(kind: .unreadable, name: "Data", path: notes, size: 0, reason: .protected, children: nil),
        ])
        XCTAssertEqual(table.owners(in: container) { _ in URL(fileURLWithPath: "/Test Apps/Notes.app") }, [notes: .item("/Test Apps/Notes.app")])
        let developer = folder("Library/Developer", size: 1, children: [
            DiskNode(kind: .unreadable, name: "Devices", path: devices, size: 0, reason: .denied, children: nil),
        ])
        XCTAssertEqual(table.owners(in: developer) { _ in nil }, [devices: .item("/Test Apps/Xcode.app")])
    }

    func testTheIconRuleForItemsOfTheMap() {
        let table = places()
        func node(_ kind: DiskNode.Kind, _ path: String) -> DiskNode {
            DiskNode(kind: kind, name: (path as NSString).lastPathComponent, path: path, size: 1, children: kind == .dir ? [] : nil)
        }
        // A file's icon comes from its type alone, so Pith never opens it.
        XCTAssertEqual(table.iconKey(for: node(.file, "/Users/x/Movie.MOV"), asking: false), .type("mov"))
        XCTAssertEqual(table.iconKey(for: node(.file, "/Users/x/.zshrc"), asking: false), .type(""))
        XCTAssertEqual(table.iconKey(for: node(.file, path("Documents/Report.pdf")), asking: true), .type("pdf"))
        // Folders, packages, apps and volumes the map has read show their own icons.
        XCTAssertEqual(table.iconKey(for: node(.dir, "/Applications/Xcode.app"), asking: true), .item("/Applications/Xcode.app"))
        XCTAssertEqual(table.iconKey(for: node(.dir, "/"), asking: false), .item("/"))
        XCTAssertEqual(table.iconKey(for: node(.volume, "/System/Volumes/Preboot"), asking: true), .item("/System/Volumes/Preboot"))
        // A known place shows its own icon, read or not, and never by its path.
        XCTAssertEqual(table.iconKey(for: node(.dir, path("Documents")), asking: true), .place("documents"))
        XCTAssertEqual(table.iconKey(for: node(.unreadable, path("Library/Mail")), asking: false), .place("mail"))
        // What the map couldn't read, and what it groups.
        XCTAssertEqual(table.iconKey(for: node(.unreadable, "/private/var/db/sudo"), asking: false), .folder)
        XCTAssertEqual(table.iconKey(for: node(.aggregate, "/Users/x/__other__"), asking: false), .group)
        // Inside a location macOS guards, a folder is looked up by its path only once macOS has stopped asking.
        XCTAssertEqual(table.iconKey(for: node(.dir, path("Documents/Taxes")), asking: false), .item(path("Documents/Taxes")))
        XCTAssertEqual(table.iconKey(for: node(.dir, path("Documents/Taxes")), asking: true), .folder)
        XCTAssertEqual(table.iconKey(for: node(.dir, path("Library/Containers/com.apple.Notes")), asking: true), .folder)
        XCTAssertEqual(table.iconKey(for: node(.dir, path("Projects")), asking: true), .item(path("Projects")))
    }
}
