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
    /// The Trash as its icon shows it while it holds nothing (`trashHoldsNothing`): macOS's empty Trash, under a key of its
    /// own, `place/trash-empty`, so each key always draws the same art (`iconKey(for:asking:trashIsEmpty:)`). It's the
    /// Trash's state, not a place: `place(id:)` finds it, and no list of places names it. Nil without a Trash.
    public let emptyTrash: Place?
    /// The locations macOS guards: the protected places, then other apps' containers and the cloud storage folders. A
    /// Photos library is guarded wherever it is, which `isProtected` knows by its extension.
    public private(set) var guarded: [String]
    /// The home folder the places are in.
    public let home: String
    /// Other apps' containers, `~/Library/Containers`, each named by its app's bundle ID.
    private let containers: String
    /// The file systems mounted now, as the kernel lists them (`MountTable.kernelOnly`), which say whether an app lies on
    /// the startup disk without waiting on DiskArbitration. Which volumes macOS guards comes from what Pith worked out of
    /// the table off the main thread instead (`guardingVolumes`).
    private let mounts: @Sendable () -> MountTable
    /// The roots of the volumes that show the drive (`IconKey.drive`) rather than their own icons, which are looked up by
    /// their paths: the volumes macOS guards, while Pith hasn't Full Disk Access (`guardingVolumes`). None in the table
    /// itself.
    public private(set) var guardedVolumes: [String] = []

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
                mounts: @escaping @Sendable () -> MountTable = MountTable.kernelOnly, application: (String) -> URL?) {
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
            // Apple doesn't document where Books and Podcasts keep what they download, but their own code says, as
            // read from their signatures and binaries on macOS 26.3, never from their data. Books' library agent,
            // BookKit's sandboxed com.apple.BKAgentService, registers its Documents folder's iBooks as the default
            // library (BKBookLibraryPath) and keeps the books in the library's Books, beside Books.plist; the person
            // can move the library elsewhere, which this path then misses. Books also declares the iCloud container
            // iCloud.com.apple.iBooks, so with Books in iCloud Drive turned on its books may sit under iCloud Drive's
            // place instead, which Pith doesn't look inside for them. Podcasts' one app group is
            // 243LU875E5.groups.com.apple.podcasts, and its downloads are that group's Library/Cache
            // (MTConstants.sharedCacheDirectory), which its Storage extension measures. Both lie in other apps'
            // data, which macOS guards.
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

    /// The Trash's id, and the one its key has while it holds nothing (`emptyTrash`).
    static let trashID = "trash", emptyTrashID = "trash-empty"

    public func place(at path: String) -> Place? { places.first { $0.path == path } }

    /// The places the disk map's Places section offers, in the table's order.
    public var shortcuts: [Place] { places.filter { Self.shortcutIDs.contains($0.id) } }

    /// Whether macOS guards `path`: it's a protected place, other apps' data, a cloud storage folder or a Photos
    /// library, or it's inside one.
    public func isProtected(_ path: String) -> Bool { Self.isProtected(path, guarded: guarded) }

    /// These places with `folder` among the locations macOS guards too, as a map a scan made of a volume macOS guards
    /// counts while losing Full Disk Access holds it (`DiskAccessWatch.holdsScan(of:listedSince:guards:)`).
    public func holding(_ folder: String) -> KnownPlaces {
        var held = self
        held.guarded.append(folder)
        return held
    }

    /// Whether `path` lies on the startup disk, by the file systems mounted now (`MountTable.isOnStartupDisk`).
    public func isOnStartupDisk(_ path: String) -> Bool { mounts().isOnStartupDisk(path) }

    /// These places as the rule has them while Pith has Full Disk Access or hasn't (`fullDiskAccess`, as `DiskAccessWatch`
    /// last found), by `volumes`, which volumes macOS guards as Pith last worked it out from the mount table, off the main
    /// thread (`GuardedVolumes`), or nil before the first answer lands. Without Full Disk Access, each volume macOS guards
    /// shows the drive wherever its own icon would show (`guardedVolumes`), since its own is looked up by its path, which
    /// can read the volume's custom icon and other files at its root, and so bring macOS's question about the volume. Of
    /// `shown`, the volumes Pith shows, the disks it lists and those on the map, one the answer doesn't know, as one
    /// mounted since it was worked out, shows the drive too until the next answer, and before the first every one but the
    /// startup disk does, with `mapRoot`, the map's root, which only an answer can tell from a folder: each errs on the
    /// privacy rule's side. With Full Disk Access, macOS asks nothing, and each shows its own. Nothing here reads the mount
    /// table: the rule is built with every icon.
    public func guardingVolumes(_ volumes: GuardedVolumes?, fullDiskAccess: Bool, shown: [String] = [], mapRoot: String? = nil) -> KnownPlaces {
        var guarding = self
        guard !fullDiskAccess else {
            guarding.guardedVolumes = []
            return guarding
        }
        let unknown = volumes.map { volumes in shown.filter { !volumes.knows($0) } } ?? shown + (mapRoot.map { [$0] } ?? [])
        var seen = Set(volumes?.roots ?? [])
        guarding.guardedVolumes = (volumes?.roots ?? []) + unknown.filter { $0 != "/" && seen.insert($0).inserted }
        return guarding
    }

    /// The icon of the volume mounted at `root`, wherever a disk's icon shows outside the map: the disk menu, the path
    /// bar, the list of disks and Where the space is. Its own, by its path, or the drive for one macOS guards while Pith
    /// hasn't Full Disk Access (`guardedVolumes`).
    public func volumeKey(for root: String) -> IconKey { guardedVolumes.contains(root) ? .drive : .item(root) }

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

    /// The rule as the disk map's page applies it, with `asking` and `trashIsEmpty` as `iconKey(for:asking:trashIsEmpty:)`
    /// takes them.
    public func iconRule(asking: Bool, trashIsEmpty: Bool = false) -> IconRule {
        IconRule(places: places.map { IconRule.Place(id: $0.id, path: $0.path) }, guarded: guarded, asking: asking, emptyTrash: trashIsEmpty,
                 guardedVolumes: guardedVolumes)
    }

    /// The icon key for an item of the map, by Pith's icon rule. A known place shows its own icon, read or not, and a
    /// file its type's, so Pith never opens it. A volume shows its own icon, by its path, and so does a folder, package
    /// or app outside the locations macOS guards, but for a volume macOS guards while Pith hasn't Full Disk Access
    /// (`guardedVolumes`), whose block, or a map of it with its root for its own, shows the drive. Inside one, Pith looks a folder up by its path only when the map
    /// shows it has listed it, with a size, files or contents, and only while `asking` is false, when macOS can't be
    /// holding any of the map's folders. The live map shows a folder it has found in its parent's listing, but not yet
    /// listed itself, as empty, and macOS may be holding that listing, which a lookup by its path could wait on too.
    /// Such a folder, an empty one, and a folder the map couldn't read show a plain folder, and the map's smaller items
    /// show a group. The Trash shows macOS's empty Trash while it holds nothing, by the scanner's word (`trashIsEmpty`,
    /// from `trashHoldsNothing`), and `item` draws nothing in it but Finder's `.DS_Store`; otherwise the full Trash, as
    /// when the map couldn't read it or hasn't listed it yet, which leaves it looking empty. An item that may come from an earlier map is judged by
    /// the map as it is now (`iconKey(for:in:asking:trashIsEmpty:)`), which says what the rule does once the person
    /// withdraws Pith's access.
    public func iconKey(for item: DiskNode, asking: Bool, trashIsEmpty: Bool = false) -> IconKey {
        if let place = place(at: item.path) {
            return .place(place.id == Self.trashID && trashIsEmpty && Self.drawsNothing(item) ? emptyTrash?.id ?? place.id : place.id)
        }
        if item.kind == .dir || item.kind == .volume, guardedVolumes.contains(item.path) { return .drive }
        switch item.kind {
        case .file: return .type((item.path as NSString).pathExtension.lowercased())
        case .unreadable: return .folder
        case .dir where isProtected(item.path) && (asking || !Self.showsAListing(item)): return .folder
        case .dir, .volume: return .item(item.path)
        case .aggregate: return .group
        }
    }

    /// The icon key for `item` as `iconKey(for:asking:trashIsEmpty:)` gives it, for an item that may come from an earlier
    /// map than `map`, the tree the map shows now, as one still selected from that map does. The person can withdraw
    /// Pith's access to a folder the map listed, and the map shows it listed until the scanner lists it again.
    ///
    /// A Files and Folders permission turned off records the person's answer, so macOS doesn't ask again and lets the
    /// listing fail, and a lookup by its path meanwhile brings no question. Full Disk Access turned off is another matter:
    /// it opened Desktop, Documents, Downloads, other apps' data and removable and network volumes without an answer for
    /// each, so once it's off they have none, and macOS asks at the next access, which a lookup by path could be. Pith
    /// probes for that loss at launch, as it becomes active, and with each live map while another app is in front, as
    /// only the person changes the access, in System Settings or a terminal, and from then the locations macOS guards
    /// count as asking (`asking`, `DiskAccessWatch`), a map a scan made of another disk among them (`holding`), until the
    /// scanner has listed them again. A reset of Pith's permissions leaves the locations unanswered too; Pith can't tell
    /// one from the person's own answers, but the question a lookup could bring is the one the scanner's next listing
    /// there brings, and from the moment macOS is asking it, the rule looks nothing up there.
    ///
    /// So the rule keeps a folder's own icon until the scanner's listing says otherwise, and that listing error is the
    /// signal Pith has: a folder, package, app or volume `map` shows inside a folder it couldn't read, drawn or only in its
    /// list of them (`DiskResult.couldntRead(toward:)`), or couldn't read itself, shows a plain folder, never looked up by
    /// its path. A file keeps its type's icon and a known place its own.
    public func iconKey(for item: DiskNode, in map: DiskResult?, asking: Bool, trashIsEmpty: Bool = false) -> IconKey {
        let key = iconKey(for: item, asking: asking, trashIsEmpty: trashIsEmpty)
        if case .item = key, map?.couldntRead(toward: item.path) == true { return .folder }
        return key
    }

    /// Whether the map has listed `folder`: it has a size, files or contents. A folder found in its parent's listing
    /// and not listed itself yet has none of them.
    private static func showsAListing(_ folder: DiskNode) -> Bool {
        folder.size > 0 || (folder.files ?? 0) > 0 || !(folder.children ?? []).isEmpty
    }

    /// Whether `folder` is a folder drawn with nothing in it but Finder's `.DS_Store`: no size and no children, as the
    /// scanner writes an empty folder, and as one it hasn't listed yet looks, or children that are each a file of that
    /// name, as an emptied Trash holds once Finder has shown it, which the Dock shows empty. Finder keeps the folder's view
    /// settings in it.
    private static func drawsNothing(_ folder: DiskNode) -> Bool {
        guard folder.kind == .dir else { return false }
        guard let children = folder.children, !children.isEmpty else { return folder.size == 0 }
        return children.allSatisfy { $0.kind == .file && $0.name == dsStore }
    }

    /// What Finder writes in a folder it has shown, to keep the folder's view settings.
    static let dsStore = ".DS_Store"

    /// Whether the Trash holds nothing, by what the scanner says of it with the map `tree`.
    ///
    /// Finder's `.DS_Store`, which keeps a folder's view settings, is all an emptied Trash holds once Finder has shown
    /// it, and the Dock shows that Trash empty, so Pith does too: holding nothing here means holding nothing but that.
    ///
    /// A map a scan made, `scan` its summary, lists every folder it can read and folds one too small for a block into its
    /// folder's smaller items, and an empty folder into nothing, so only a scan of the Trash itself draws it with nothing
    /// in it. It holds nothing when that scan's own folder draws nothing in it but Finder's `.DS_Store`, which a scan of
    /// so small a folder draws on its own, and the scan listed no folder below it, counted no file it doesn't draw so,
    /// and found no folder only in the cloud or entry macOS wouldn't describe. A scan counts a symbolic link nowhere, so
    /// a scanned Trash holding only one shows empty.
    ///
    /// A live map's tree draws a Trash found and not listed yet as one holding nothing, so for any other map its index
    /// says: it has listed the Trash and holds no folders there, and its listing had no entry beside Finder's
    /// `.DS_Store` (its place in `live`, the places that came with the tree, which name no Trash found and not listed
    /// yet), and the tree, where it draws the Trash, draws nothing in it but that. Bytes and files can't say so: the
    /// `.DS_Store` adds to both, the index counts a clone copy whose bytes another copy holds, and an empty file, in its
    /// files and not its bytes, and it counts a symbolic link, or a hard link counted at another link, nowhere. With no
    /// places, as before a live map's first tree, or a place that doesn't say what it holds, nothing says so. The Trash's
    /// icon shows this state wherever it shows (`iconKey(for:asking:trashIsEmpty:)`, `placesTable`, and the page's rule,
    /// which gets it with `iconRule`), and Where the space is has no row for a Trash holding nothing
    /// (`DiskAccounting.rows`).
    public func trashHoldsNothing(in tree: DiskNode?, scan: DiskSummary?, live: [LivePlace]) -> Bool {
        guard let trash = place(id: Self.trashID) else { return false }
        let node = tree?.node(at: trash.path)
        if let node, !Self.drawsNothing(node) { return false }
        // A scan's count of the folders it listed includes its own, and its files are the .DS_Store files its folder draws.
        if let scan {
            guard let node, tree?.path == trash.path else { return false }
            return scan.dirs <= 1 && scan.files == UInt64(node.children?.count ?? 0) && scan.entryErrors == 0 && scan.cloudOnly.folders == 0
        }
        return live.first { $0.path == trash.path }?.holdsNothing ?? false
    }

    /// The disk map's Places section's table for a live map, whose tree the page shows (`tree`), from what its index
    /// holds at each place (`live`, which came with that tree): each place the section offers that the index names, in
    /// the table's order, with its size as the map shows it, or none where Pith can't read it. A place the tree shows has
    /// the tree's figure, the one its block shows, which is newer than the index's when the map changed since, as when
    /// Move to Trash took an item out of the place. One the tree folds into smaller items has the index's, the figure its
    /// own map shows once it's opened. A place Move to Trash took off the map leaves `live` with it (`SideColumnFeed`).
    /// The Trash's icon shows its state as it shows everywhere (`trashHoldsNothing`). The section shows at the live map's
    /// root, the startup disk's, and at the home folder.
    public func placesTable(for tree: DiskNode, mapRoot: String, live: [LivePlace]) -> PlacesTable {
        let held = Dictionary(live.map { ($0.path, $0) }, uniquingKeysWith: { first, _ in first })
        let empty = trashHoldsNothing(in: tree, scan: nil, live: live)
        let places = shortcuts.compactMap { place -> PlacesTable.Place? in
            guard let found = held[place.path] else { return nil }
            let size = found.size.map { tree.folder(at: place.path)?.size ?? $0 }
            let key = IconKey.place(place.id == Self.trashID && empty ? Self.emptyTrashID : place.id)
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
/// icons' base: the known places by path, the locations macOS guards, whether macOS may be holding some of the map's
/// folders, whether the Trash holds nothing, by the scanner's word (`KnownPlaces.trashHoldsNothing`), and the volumes
/// that show the drive while Pith hasn't Full Disk Access. With it the page gives each item the key
/// `KnownPlaces.iconKey(for:asking:trashIsEmpty:)` gives it, so it asks the icon route for no icon the route would
/// refuse. tests/icon-keys.json holds both to the same cases.
public struct IconRule: Codable, Equatable, Sendable {
    public struct Place: Codable, Equatable, Sendable {
        public let id: String
        public let path: String
    }

    public let places: [Place]
    public let guarded: [String]
    public let asking: Bool
    public let emptyTrash: Bool
    /// The roots of the volumes that show the drive (`KnownPlaces.guardedVolumes`).
    public let guardedVolumes: [String]
}
