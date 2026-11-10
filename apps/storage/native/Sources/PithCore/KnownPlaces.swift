import AppKit
import UniformTypeIdentifiers

/// Folders that macOS and Apple's apps keep in known places, each with the icon Apple's Storage pane would give it:
/// a special folder's own type, which draws Finder's icon for that folder, or the icon of the app the data belongs
/// to. Every icon is confirmed when the table is made, falling back to the next choice and at last to a plain folder,
/// so a place never shows a blank or a generic document. Making the table touches no folder: its paths come from the
/// home folder and `FileManager`'s search paths, and its apps from LaunchServices.
public struct KnownPlaces: Sendable {
    public struct Place: Sendable, Equatable {
        /// The id in its icon key, `place/<id>`.
        public let id: String
        public let path: String
        public let name: String
        public let icon: Icon
        /// macOS guards it: only Full Disk Access, or the person's answer to macOS's question, lets Pith read it.
        public let isProtected: Bool
    }

    /// Where a place's icon comes from.
    public enum Icon: Sendable, Equatable {
        /// A type's icon. A special folder's type, such as `com.apple.documents-folder`, draws exactly what Finder
        /// shows for that folder, without Pith looking at it.
        case type(String)
        /// The icon of the app the place belongs to, found by its bundle ID.
        case app(bundleID: String, path: String)
        /// An SF Symbol, where macOS has no icon to draw.
        case symbol(String)
    }

    /// One choice for a place's icon, before it's confirmed on this Mac.
    enum Choice {
        case app(String)
        case type(String)
        case symbol(String)
    }

    public let places: [Place]
    /// The locations macOS guards: the protected places, then other apps' containers and the cloud storage folders. A
    /// Photos library is guarded wherever it is, which `isProtected` knows by its extension.
    public let guarded: [String]

    /// The places in `home`, and at `searchPaths` as `FileManager.urls(for:in:)` gives them, with each owning app
    /// that `application` finds by its bundle ID. A place whose search path is missing is left out. The Trash's icon
    /// shows it full unless `trashIsEmpty`: Pith names the Trash as a place only while it holds something.
    public init(home: URL, searchPaths: [FileManager.SearchPathDirectory: URL], trashIsEmpty: Bool = false, application: (String) -> URL?) {
        let library = home.appendingPathComponent("Library")
        func folder(_ directory: FileManager.SearchPathDirectory, _ inside: String? = nil) -> URL? {
            searchPaths[directory].map { url in inside.map { url.appendingPathComponent($0) } ?? url }
        }
        // Apple's Storage categories and the places Pith names: where each lives, and its icons in order of choice.
        let table: [(id: String, name: String, url: URL?, icons: [Choice], isProtected: Bool)] = [
            ("photos-library", "Photos Library", folder(.picturesDirectory, "Photos Library.photoslibrary"),
             [.app("com.apple.Photos"), .type("com.apple.photos.library")], true),
            ("mail", "Mail", library.appendingPathComponent("Mail"), [.app("com.apple.mail")], true),
            ("messages", "Messages", library.appendingPathComponent("Messages"), [.app("com.apple.MobileSMS")], true),
            ("developer", "Developer", library.appendingPathComponent("Developer"), [.app("com.apple.dt.Xcode"), .type("com.apple.developer-folder")], false),
            // The app is Finder's own, at an undocumented path, so LaunchServices finds it by its bundle ID.
            ("icloud-drive", "iCloud Drive", library.appendingPathComponent("Mobile Documents"),
             [.app("com.apple.finder.Open-iCloudDrive"), .symbol("icloud")], true),
            ("downloads", "Downloads", folder(.downloadsDirectory), [.type("com.apple.downloads-folder")], true),
            ("documents", "Documents", folder(.documentDirectory), [.type("com.apple.documents-folder")], true),
            ("desktop", "Desktop", folder(.desktopDirectory), [.type("com.apple.desktop-folder")], true),
            ("applications", "Applications", folder(.applicationDirectory), [.type("com.apple.applications-folder")], false),
            ("trash", "Trash", folder(.trashDirectory), [.type(trashIsEmpty ? "com.apple.trash-empty" : "com.apple.trash-full")], true),
            ("backups", "iPhone and iPad backups", library.appendingPathComponent("Application Support/MobileSync/Backup"), [], true),
            // The Music and TV apps keep their libraries and media in these folders unless the person moves them.
            ("music", "Music", folder(.musicDirectory, "Music"), [.app("com.apple.Music")], false),
            ("tv", "TV", folder(.moviesDirectory, "TV"), [.app("com.apple.TV")], false),
            // Apple doesn't document where Books and Podcasts keep what they download. These are the folders known to
            // hold the books added to Books and Podcasts' downloaded episodes, in other apps' data, which macOS guards.
            ("books", "Books", library.appendingPathComponent("Containers/com.apple.BKAgentService/Data/Documents/iBooks/Books"),
             [.app("com.apple.iBooksX")], true),
            ("podcasts", "Podcasts", library.appendingPathComponent("Group Containers/243LU875E5.groups.com.apple.podcasts/Library/Cache"),
             [.app("com.apple.podcasts")], true),
        ]
        places = table.compactMap { entry in
            entry.url.map { Place(id: entry.id, path: $0.path, name: entry.name, icon: Self.icon(choosing: entry.icons, application: application),
                                  isProtected: entry.isProtected) }
        }
        guarded = places.filter(\.isProtected).map(\.path) + ["Containers", "Group Containers", "CloudStorage"].map { library.appendingPathComponent($0).path }
    }

    /// This Mac's places: the home folder, the search paths, and the apps LaunchServices finds. Applications is the
    /// Mac's own folder, not the one in the home folder.
    public static func current(trashIsEmpty: Bool = false) -> KnownPlaces {
        let files = FileManager.default
        var searchPaths: [FileManager.SearchPathDirectory: URL] = [:]
        for directory: FileManager.SearchPathDirectory in [.desktopDirectory, .documentDirectory, .downloadsDirectory, .moviesDirectory, .musicDirectory,
                                                           .picturesDirectory, .trashDirectory] {
            searchPaths[directory] = files.urls(for: directory, in: .userDomainMask).first
        }
        searchPaths[.applicationDirectory] = files.urls(for: .applicationDirectory, in: .localDomainMask).first
        return KnownPlaces(home: files.homeDirectoryForCurrentUser, searchPaths: searchPaths, trashIsEmpty: trashIsEmpty) {
            NSWorkspace.shared.urlForApplication(withBundleIdentifier: $0)
        }
    }

    /// The first of `choices` this Mac has, or a plain folder: a type macOS declares, or an app it finds.
    static func icon(choosing choices: [Choice], application: (String) -> URL?) -> Icon {
        for choice in choices {
            switch choice {
            case .app(let bundleID):
                if let url = application(bundleID) { return .app(bundleID: bundleID, path: url.path) }
            case .type(let identifier):
                // CoreTypes declares the special folders' types, but they aren't among Apple's documented ones.
                if let type = UTType(identifier), !type.isDynamic { return .type(identifier) }
            case .symbol(let name):
                return .symbol(name)
            }
        }
        return .type(UTType.folder.identifier)
    }

    public func place(id: String) -> Place? { places.first { $0.id == id } }

    public func place(at path: String) -> Place? { places.first { $0.path == path } }

    /// Whether macOS guards `path`: it's a protected place, other apps' data, a cloud storage folder or a Photos
    /// library, or it's inside one.
    public func isProtected(_ path: String) -> Bool {
        let inside = { (folder: String) in path == folder || path.hasPrefix(folder + "/") }
        return guarded.contains(where: inside) || path.split(separator: "/").contains { $0.hasSuffix(".photoslibrary") }
    }

    /// The rule as the disk map's page applies it, with `asking` as `iconKey(for:asking:)` takes it.
    public func iconRule(asking: Bool) -> IconRule {
        IconRule(places: places.map { IconRule.Place(id: $0.id, path: $0.path) }, guarded: guarded, asking: asking)
    }

    /// The icon key for an item of the map, by Pith's icon rule. A known place shows its own icon, read or not, and a
    /// file its type's, so Pith never opens it. A volume shows its own icon, by its path, and so does a folder, package
    /// or app outside the locations macOS guards. Inside one, Pith looks a folder up by its path only when the map
    /// shows it has listed it, with a size, files or contents, and only while `asking` is false, when macOS can't be
    /// holding any of the map's folders. The live map shows a folder it has found in its parent's listing, but not yet
    /// listed itself, as empty, and macOS may be holding that listing, which a lookup by its path could wait on too.
    /// Such a folder, an empty one, and a folder the map couldn't read show a plain folder, and the map's smaller items
    /// show a group.
    public func iconKey(for item: DiskNode, asking: Bool) -> IconKey {
        if let place = place(at: item.path) { return .place(place.id) }
        switch item.kind {
        case .file: return .type((item.path as NSString).pathExtension.lowercased())
        case .unreadable: return .folder
        case .dir where isProtected(item.path) && (asking || !Self.showsAListing(item)): return .folder
        case .dir, .volume: return .item(item.path)
        case .aggregate: return .group
        }
    }

    /// Whether the map has listed `folder`: it has a size, files or contents. A folder found in its parent's listing
    /// and not listed itself yet has none of them.
    private static func showsAListing(_ folder: DiskNode) -> Bool {
        folder.size > 0 || (folder.files ?? 0) > 0 || !(folder.children ?? []).isEmpty
    }
}

/// Pith's icon rule as the disk map's page applies it (`iconKey` in native-web/icons.ts), which native sends with the
/// icons' base: the known places by path, the locations macOS guards, and whether macOS may be holding some of the
/// map's folders. With it the page gives each item the key `KnownPlaces.iconKey(for:asking:)` gives it, so it asks the
/// icon route for no icon the route would refuse. tests/icon-keys.json holds both to the same cases.
public struct IconRule: Codable, Equatable, Sendable {
    public struct Place: Codable, Equatable, Sendable {
        public let id: String
        public let path: String
    }

    public let places: [Place]
    public let guarded: [String]
    public let asking: Bool
}
