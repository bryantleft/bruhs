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
    }

    func testAMissingAppFallsBackAsTheSpecSays() {
        let table = places(missing: Set(apps.keys))
        XCTAssertEqual(table.place(id: "developer")?.icon, .type("com.apple.developer-folder"), "Developer without Xcode")
        XCTAssertEqual(table.place(id: "icloud-drive")?.icon, .symbol("icloud"), "iCloud Drive without its app in Finder")
        XCTAssertEqual(table.place(id: "photos-library")?.icon, .type("com.apple.photos.library"), "the library's own package icon")
        for id in ["mail", "messages", "music", "tv"] {
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
                        "Library/Application Support/MobileSync/Backup/0000"] {
            XCTAssertTrue(table.isProtected(path(guarded)), guarded)
        }
        XCTAssertTrue(table.isProtected("/Volumes/Archive/Old.photoslibrary/database"), "any Photos library, as Move to Trash treats one")
        for open in ["", "Library", "Library/Developer/Xcode/DerivedData", "Music/Music", "DocumentsOld", "Projects/Desktop"] {
            XCTAssertFalse(table.isProtected(path(open)), open)
        }
        XCTAssertFalse(table.isProtected("/Applications/Xcode.app"))
        XCTAssertFalse(table.isProtected("/"))
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
