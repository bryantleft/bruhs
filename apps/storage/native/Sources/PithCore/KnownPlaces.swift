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
        /// What it draws when its icon is an app Pith may no longer look up by its path, as once the disk the app was on
        /// is ejected and another mounted where it was (`drawnIcon(of:)`): the icon it would have without the app.
        public let fallback: Icon
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

        var isntApp: Bool {
            if case .app = self { return false }
            return true
        }
    }

    public let places: [Place]
    /// The Trash as its icon shows it while the map shows it holding nothing: macOS's empty Trash, under a key of its own,
    /// `place/trash-empty`, so each key always draws the same art (`iconKey(for:asking:)`). It's the Trash's state, not
    /// a place: `place(id:)` finds it, and no list of places names it. Nil without a Trash.
    public let emptyTrash: Place?
    /// The locations macOS guards: the protected places, then other apps' containers and the cloud storage folders. A
    /// Photos library is guarded wherever it is, which `isProtected` knows by its extension.
    public let guarded: [String]
    /// The home folder the places are in.
    public let home: String
    /// Other apps' containers, `~/Library/Containers`, each named by its app's bundle ID.
    private let containers: String
    /// The file systems mounted now, which say whether an app lies on the startup disk.
    private let mounts: @Sendable () -> MountTable

    /// The places the disk map's Places section offers, by id: the ones the design spec names, where Apple's Storage pane
    /// finds space, and the iPhone and iPad backups Apple's own checklist names. The table also keeps Desktop, Music, TV,
    /// Books and Podcasts, for their icons.
    private static let shortcutIDs: Set<String> = ["photos-library", "mail", "messages", "developer", "icloud-drive", "downloads", "documents",
                                                   "applications", "trash", "backups"]

    /// The places in `home`, and at `searchPaths` as `FileManager.urls(for:in:)` gives them, with each owning app
    /// that `application` finds by its bundle ID. A place whose search path is missing is left out. The Trash's own icon
    /// is macOS's full Trash, and `emptyTrash` has the empty one. `mounts` gives the file systems mounted when an app's
    /// icon is asked for: this Mac's own, or a test's.
    public init(home: URL, searchPaths: [FileManager.SearchPathDirectory: URL],
                mounts: @escaping @Sendable () -> MountTable = MountTable.current, application: (String) -> URL?) {
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
            ("trash", "Trash", folder(.trashDirectory), [.type("com.apple.trash-full")], true),
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
        let located = table.compactMap { entry in entry.url.map { (entry, $0.path) } }
        // Where macOS guards comes from the places' paths alone, so it's known before any app is chosen.
        let guarded = located.filter { $0.0.isProtected }.map(\.1) + ["Containers", "Group Containers", "CloudStorage"].map { library.appendingPathComponent($0).path }
        // A place's app is one Pith may look up by its bundle's path: on the startup disk, outside the locations macOS
        // guards. Xcode in Downloads, or Mail on another disk, leaves its place the icon it has without the app.
        let mayShow = { (app: String) in Self.mayShowApp(app, guarded: guarded, mounts: mounts) }
        places = located.map { entry, path in
            Place(id: entry.id, path: path, name: entry.name, icon: Self.icon(choosing: entry.icons, application: application, mayShow: mayShow),
                  isProtected: entry.isProtected, fallback: Self.icon(choosing: entry.icons.filter(\.isntApp), application: application))
        }
        emptyTrash = places.first { $0.id == Self.trashID }.map { trash in
            let icon = Self.icon(choosing: [.type("com.apple.trash-empty")], application: application)
            return Place(id: Self.emptyTrashID, path: trash.path, name: trash.name, icon: icon, isProtected: trash.isProtected, fallback: icon)
        }
        self.guarded = guarded
        self.home = home.path
        containers = library.appendingPathComponent("Containers").path
        self.mounts = mounts
    }

    /// This Mac's places: the home folder, the search paths, and the apps LaunchServices finds. Applications is the
    /// Mac's own folder, not the one in the home folder.
    public static func current() -> KnownPlaces {
        let files = FileManager.default
        var searchPaths: [FileManager.SearchPathDirectory: URL] = [:]
        for directory: FileManager.SearchPathDirectory in [.desktopDirectory, .documentDirectory, .downloadsDirectory, .moviesDirectory, .musicDirectory,
                                                           .picturesDirectory, .trashDirectory] {
            searchPaths[directory] = files.urls(for: directory, in: .userDomainMask).first
        }
        searchPaths[.applicationDirectory] = files.urls(for: .applicationDirectory, in: .localDomainMask).first
        return KnownPlaces(home: files.homeDirectoryForCurrentUser, searchPaths: searchPaths) {
            NSWorkspace.shared.urlForApplication(withBundleIdentifier: $0)
        }
    }

    /// The first of `choices` this Mac has, or a plain folder: a type macOS declares, or an app it finds that `mayShow`
    /// lets Pith look up by its path.
    static func icon(choosing choices: [Choice], application: (String) -> URL?, mayShow: (String) -> Bool = { _ in true }) -> Icon {
        for choice in choices {
            switch choice {
            case .app(let bundleID):
                if let url = application(bundleID), mayShow(url.path) { return .app(bundleID: bundleID, path: url.path) }
            case .type(let identifier):
                // CoreTypes declares the special folders' types, but they aren't among Apple's documented ones.
                if let type = UTType(identifier), !type.isDynamic { return .type(identifier) }
            case .symbol(let name):
                return .symbol(name)
            }
        }
        return .type(UTType.folder.identifier)
    }

    /// What `place` draws: its icon, but for an app Pith may no longer look up by its path (`mayShowApp`), as once the
    /// disk the app was on is ejected and another mounted where it was, which draws the place's fallback instead. The
    /// table is made at launch, and the disks can change after.
    public func drawnIcon(of place: Place) -> Icon {
        if case .app(_, let path) = place.icon, !mayShowApp(path) { return place.fallback }
        return place.icon
    }

    /// The place whose icon key has `id`: a place of the table, or the empty Trash.
    public func place(id: String) -> Place? { places.first { $0.id == id } ?? emptyTrash.flatMap { $0.id == id ? $0 : nil } }

    /// The Trash's id, and the one its key has while the map shows it holding nothing (`emptyTrash`).
    static let trashID = "trash", emptyTrashID = "trash-empty"

    public func place(at path: String) -> Place? { places.first { $0.path == path } }

    /// The places the disk map's Places section offers, in the table's order.
    public var shortcuts: [Place] { places.filter { Self.shortcutIDs.contains($0.id) } }

    /// Whether macOS guards `path`: it's a protected place, other apps' data, a cloud storage folder or a Photos
    /// library, or it's inside one.
    public func isProtected(_ path: String) -> Bool { Self.isProtected(path, guarded: guarded) }

    private static func isProtected(_ path: String, guarded: [String]) -> Bool {
        let inside = { (folder: String) in path == folder || path.hasPrefix(folder + "/") }
        return guarded.contains(where: inside) || path.split(separator: "/").contains { $0.hasSuffix(".photoslibrary") }
    }

    /// Whether Pith may look an app's icon up by its bundle's path: the app lies on the startup disk, outside the
    /// locations macOS guards. macOS guards removable and network volumes too, so an app on another disk, a share or the
    /// home automount is never looked up. Every app icon the Disk tab draws by a bundle's path goes by this: the known
    /// places' apps, when the table chooses them and again when they're drawn (`drawnIcon(of:)`), the owners of folders
    /// the map couldn't read, in the unreadable list and on the page, and every app the icon route serves the page.
    public func mayShowApp(_ path: String) -> Bool { Self.mayShowApp(path, guarded: guarded, mounts: mounts) }

    private static func mayShowApp(_ path: String, guarded: [String], mounts: () -> MountTable) -> Bool {
        !isProtected(path, guarded: guarded) && mounts().isOnStartupDisk(path)
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
    /// show a group. The Trash shows macOS's empty Trash while the map can read it and shows it holding nothing, and the
    /// full Trash otherwise, as when the map couldn't read it or has no listing of it.
    public func iconKey(for item: DiskNode, asking: Bool) -> IconKey {
        if let place = place(at: item.path) {
            return .place(place.id == Self.trashID && Self.holdsNothing(item) ? emptyTrash?.id ?? place.id : place.id)
        }
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

    /// Whether the map can read `folder` and shows it holding nothing: no size, no files and no children, as the scanner
    /// writes an empty folder. One with no count of its files at all is a folder the map has no listing of, as above a
    /// map's root (`FolderPath.nodes`), which says nothing of what it holds.
    private static func holdsNothing(_ folder: DiskNode) -> Bool {
        folder.kind == .dir && folder.size == 0 && folder.files == 0 && (folder.children ?? []).isEmpty
    }

    /// The disk map's Places section's table for a live map, whose tree the page shows (`tree`), from what its index
    /// holds at each place (`live`, which came with that tree): each place the section offers that the index names, in
    /// the table's order, with its size as the map shows it, or none where Pith can't read it. A place the tree shows has
    /// the tree's figure, the one its block shows, which is newer than the index's when the map changed since, as when
    /// Move to Trash took an item out of the place. One the tree folds into smaller items has the index's, the figure its
    /// own map shows once it's opened. A place Move to Trash took off the map leaves `live` with it (`SideColumnFeed`).
    /// Each place's icon is the one the icon rule gives the tree's own block of it, so the Trash shows the state the map
    /// shows it in, and the place's own where the tree folds it away. The section shows at the live map's root, the
    /// startup disk's, and at the home folder.
    public func placesTable(for tree: DiskNode, mapRoot: String, live: [LivePlace]) -> PlacesTable {
        let held = Dictionary(live.map { ($0.path, $0) }, uniquingKeysWith: { first, _ in first })
        let places = shortcuts.compactMap { place -> PlacesTable.Place? in
            guard let found = held[place.path] else { return nil }
            let shown = tree.folder(at: place.path)
            let size = found.size.map { shown?.size ?? $0 }
            let key = shown.map { iconKey(for: $0, asking: false) } ?? .place(place.id)
            return PlacesTable.Place(id: place.id, name: place.name, path: place.path, key: key.string, size: size, asking: size == nil && found.asking)
        }
        return PlacesTable(shownAt: [mapRoot, home], places: places)
    }

    /// The icon of what `folder`, a folder the map couldn't read, belongs to, when Pith can tell without looking the
    /// folder up by its path. A known place shows its own. A folder inside one shows the app the place belongs to, as one
    /// in Mail shows Mail's, and a folder in another app's container, `~/Library/Containers/<bundle ID>`, the app that
    /// `application` finds for that bundle ID. An app Pith may not look up (`mayShowApp`), where macOS guards or on
    /// another disk, isn't looked up either. Anything else shows a plain folder.
    public func ownerKey(for folder: String, application: (String) -> URL?) -> IconKey {
        if let place = place(at: folder) { return .place(place.id) }
        let app: String?
        if let place = places.first(where: { folder.hasPrefix($0.path + "/") }) {
            if case .app(_, let path) = place.icon { app = path } else { app = nil }
        } else if folder.hasPrefix(containers + "/"), let bundleID = folder.dropFirst(containers.count + 1).split(separator: "/").first {
            app = application(String(bundleID))?.path
        } else {
            app = nil
        }
        guard let app, mayShowApp(app) else { return .folder }
        return .item(app)
    }

    /// The apps the folders `tree` couldn't read belong to, by folder, as `ownerKey` finds them, for the disk map's
    /// Couldn't read rows. A known place is left out, since the icon rule gives it its own icon already, and so is a
    /// folder whose owner Pith can't tell, which keeps the rule's plain folder. Only a folder inside a place with an app
    /// of its own, or in other apps' containers, can have an owner, so only those folders are gone through, or the whole
    /// tree when it's a map of a folder inside one.
    public func owners(in tree: DiskNode, application: (String) -> URL?) -> [String: IconKey] {
        var owners: [String: IconKey] = [:]
        let owned = places.filter { if case .app = $0.icon { true } else { false } }.map(\.path) + [containers]
        var waiting = owned.contains { DiskChanges.isInside(tree.path, $0) } ? [tree] : owned.compactMap { tree.folder(at: $0) }
        while let node = waiting.popLast() {
            if node.kind == .unreadable {
                let key = ownerKey(for: node.path, application: application)
                if case .item = key { owners[node.path] = key }
            }
            waiting.append(contentsOf: node.children ?? [])
        }
        return owners
    }
}

/// What the disk map's Places section shows from, which native sends the page beside the live map, and only the live
/// map (`readPlaces` in native-web/places.ts): the folders the section shows at, and each place it can show, with its
/// size as the map shows it or none where Pith can't read it.
public struct PlacesTable: Encodable, Equatable, Sendable {
    public struct Place: Encodable, Equatable, Sendable {
        public let id: String
        /// As `KnownPlaces` names it.
        public let name: String
        public let path: String
        /// Its icon's key, `place/<id>`, or the empty Trash's, `place/trash-empty`, while the map shows the Trash holding
        /// nothing.
        public let key: String
        /// Its size as the map shows it, or nil where Pith can't read it, which travels as null.
        public let size: UInt64?
        /// Pith can't read it yet because macOS is still asking the person about it, which answering settles, rather than
        /// because only Full Disk Access would let it in.
        public let asking: Bool

        public init(id: String, name: String, path: String, key: String, size: UInt64?, asking: Bool = false) {
            self.id = id; self.name = name; self.path = path; self.key = key; self.size = size; self.asking = asking
        }

        enum CodingKeys: String, CodingKey { case id, name, path, key, size, asking }

        public func encode(to encoder: any Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(id, forKey: .id)
            try container.encode(name, forKey: .name)
            try container.encode(path, forKey: .path)
            try container.encode(key, forKey: .key)
            try container.encode(size, forKey: .size)
            try container.encode(asking, forKey: .asking)
        }
    }

    /// The startup disk's root and the home folder.
    public let shownAt: [String]
    public let places: [Place]

    public init(shownAt: [String], places: [Place]) { self.shownAt = shownAt; self.places = places }
}

/// Pith's icon rule as the disk map's page applies it (`iconKey` in native-web/icon-rule.ts), which native sends with the
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
