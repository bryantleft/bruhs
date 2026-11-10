import XCTest
@testable import PithCore

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
    private func places(missing: Set<String> = [], trashIsEmpty: Bool = false) -> KnownPlaces {
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
        return KnownPlaces(home: home, searchPaths: searchPaths, trashIsEmpty: trashIsEmpty) { missing.contains($0) ? nil : self.apps[$0] }
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

    func testTheTrashShowsWhetherItHoldsAnything() {
        XCTAssertEqual(places().place(id: "trash")?.icon, .type("com.apple.trash-full"))
        XCTAssertEqual(places(trashIsEmpty: true).place(id: "trash")?.icon, .type("com.apple.trash-empty"))
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
            LivePlace(path: path("Library/Mobile Documents"), size: nil),
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
        XCTAssertEqual(sent.places.first { $0.id == "mail" }, PlacesTable.Place(id: "mail", name: "Mail", path: path("Library/Mail"), key: "place/mail", size: nil))
        XCTAssertNil(try XCTUnwrap(sent.places.first { $0.id == "icloud-drive" }).size, "waiting on macOS's question")
        XCTAssertEqual(table.placesTable(for: homeMap, mapRoot: "/", live: []).places, [], "a map whose index names no place")
    }

    func testThePlacesTableTravelsAsThePageReadsIt() throws {
        let sent = PlacesTable(shownAt: ["/", "/Users/x"], places: [
            PlacesTable.Place(id: "mail", name: "Mail", path: "/Users/x/Library/Mail", key: "place/mail", size: nil),
            PlacesTable.Place(id: "developer", name: "Developer", path: "/Users/x/Library/Developer", key: "place/developer", size: 6_000_000_000),
        ])
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(sent)) as? [String: Any])
        XCTAssertEqual(Set(json.keys), ["shownAt", "places"])
        let places = try XCTUnwrap(json["places"] as? [[String: Any]])
        XCTAssertEqual(places.map { Set($0.keys) }, [["id", "name", "path", "key", "size"], ["id", "name", "path", "key", "size"]])
        XCTAssertTrue(places[0]["size"] is NSNull, "no size where Pith can't read it")
        XCTAssertEqual(places[1]["size"] as? UInt64, 6_000_000_000)
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
