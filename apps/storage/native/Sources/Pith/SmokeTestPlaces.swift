import AppKit
import PithCore
import SwiftUI
import WebKit

/// The smoke test's checks of Places and of the folders the map couldn't read: Places opens the side column at the
/// map's root and the home folder with the map's own sizes, a place Pith can't read asks for Full Disk Access, and
/// each list of the folders the map couldn't read leads a row with the icon of what the folder belongs to.
extension AppDelegate {
    /// Places opens the side column at the live map's root and the home folder, from the table native makes for the
    /// startup disk's map, and the folders the map couldn't read show the apps they belong to. The smoke test gives the
    /// side column a table of known places of its own, whose home folder is inside the fixture, so both show through the
    /// same code while Pith looks at none of the person's folders and asks LaunchServices nothing: its Mail belongs to
    /// Finder, an app every Mac has.
    /// - Messages and Downloads, which nobody may read, show "Needs Full Disk Access" with their places' icons at the
    ///   fixture's root and the home folder, and Couldn't read leaves Downloads out there, since Places names it. The
    ///   section is gone further down.
    /// - Developer and Mail, under 1 GB, don't show. Each has the size the map shows once its folder is opened:
    ///   Developer's from its block, and Mail's, too small for a block of its own, from the live map's index.
    /// - Opened, Mail's Couldn't read row for a folder in it leads with its app's icon, Finder's. So does that folder's
    ///   row in Disk's list of the folders the map couldn't read, drawn as the notice's popover draws it, in a window of
    ///   its own off screen, beside the rows of Messages and Downloads with their places' icons.
    /// - A click on Downloads, which Pith can't read, asks for Full Disk Access in System Settings, as the notices'
    ///   buttons do, and leaves the map where it was. The pane is recorded in `panes`, not opened.
    func checkPlaces(_ fixture: String, report: URL, panes: SystemSettingsAsked) async -> [String: Bool] {
        let names = ["places_show_at_the_root_and_home", "places_have_the_maps_sizes", "couldnt_read_shows_owner_icons",
                     "unreadable_list_shows_owner_icons", "unreadable_places_open_full_disk_access"]
        let files = FileManager.default, mark = UUID().uuidString.prefix(8).lowercased()
        let home = (fixture as NSString).appendingPathComponent("pith-smoke-home-\(mark)")
        let library = (home as NSString).appendingPathComponent("Library"), downloads = (home as NSString).appendingPathComponent("Downloads")
        let mail = (library as NSString).appendingPathComponent("Mail"), developer = (library as NSString).appendingPathComponent("Developer")
        let messages = (library as NSString).appendingPathComponent("Messages"), inMail = (mail as NSString).appendingPathComponent("V10")
        let finder = "/System/Library/CoreServices/Finder.app"
        let locked = [messages, downloads, inMail]
        let kept = disk.sideColumn.places
        let cleanUp = {
            self.disk.sideColumn.places = kept
            // Readable again first: a folder nobody may list can't be emptied to remove.
            for folder in locked { try? files.setAttributes([.posixPermissions: 0o755], ofItemAtPath: folder) }
            try? files.removeItem(atPath: home)
        }
        defer { cleanUp() }
        let made = (try? files.createDirectory(atPath: developer, withIntermediateDirectories: true)) != nil
            && files.createFile(atPath: (developer as NSString).appendingPathComponent("tool.bin"), contents: Data(count: 1 << 20))
            && (try? files.createDirectory(atPath: mail, withIntermediateDirectories: false)) != nil
            && locked.allSatisfy { (try? files.createDirectory(atPath: $0, withIntermediateDirectories: false, attributes: [.posixPermissions: 0])) != nil }
        disk.sideColumn.places = KnownPlaces(home: URL(fileURLWithPath: home), searchPaths: [.downloadsDirectory: URL(fileURLWithPath: downloads)]) {
            $0 == "com.apple.mail" ? URL(fileURLWithPath: finder) : nil
        }
        func place(_ id: String) -> PlacesTable.Place? { disk.placesTable?.places.first { $0.id == id } }
        guard made, let web = webView, await liveMapShows({
            place("messages") != nil && place("downloads") != nil && place("developer")?.size != nil && place("mail")?.size != nil
        }) else {
            return Dictionary(uniqueKeysWithValues: names.map { ($0, false) })
        }
        let unreadable = place("messages")?.size == nil && place("downloads")?.size == nil
        let sized = (developer: place("developer")?.size, mail: place("mail")?.size)
        func showsTheUnreadable(_ rows: [[String: Any]]?) -> Bool {
            guard let rows, rows.count == 2 else { return false }
            return zip(rows, [("Messages", messages, "messages"), ("Downloads", downloads, "downloads")]).allSatisfy { row, wanted in
                (row["text"] as? String)?.contains(wanted.0) == true && (row["text"] as? String)?.contains("Needs Full Disk Access") == true
                    && row["title"] as? String == wanted.1 && (row["icon"] as? String)?.hasSuffix("/place/\(wanted.2).png") == true
            }
        }
        let atRoot = await pageAnswer(web, Self.placeRows) { showsTheUnreadable($0) }
        let askedBefore = panes.asked.count
        let clicked = try? await web.callAsyncJavaScript(Self.clickPlace, arguments: ["path": downloads], in: nil, contentWorld: .page) as? Bool
        let askedForAccess = await eventually { panes.asked.count > askedBefore } && panes.asked.last == .fullDiskAccess
        // Long enough for a folder it opened to have reached the native side.
        try? await Task.sleep(for: .milliseconds(300))
        let stayed = disk.openFolder == fixture
        disk.pageCommand?(.open(home))
        let atHome = await eventually { self.disk.openFolder == home } ? await pageAnswer(web, Self.placeRows) { showsTheUnreadable($0) } : nil
        // Downloads is named once, in Places: the home folder has nothing else it couldn't read.
        let namedOnce = await pageAnswer(web, "return document.getElementById('unreadable-heading') === null") { (none: Bool?) in none == true } == true
        disk.pageCommand?(.open(developer))
        let inDeveloper = await eventually { self.disk.openFolder == developer }
        let gone = await pageAnswer(web, "return document.getElementById('places-heading') === null") { (gone: Bool?) in gone == true } == true
        let developerShown = disk.result?.root.folder(at: developer)?.size
        // Too small for a block at the root, it opens once the live map sends its folder in detail.
        disk.pageCommand?(.open(mail))
        let inMailFolder = await eventually { self.disk.openFolder == mail }
        let mailShown = disk.result?.root.folder(at: mail)?.size
        // The row shows the rule's plain folder until the owners, found off the main thread, reach the page.
        let ownersIcon = "/" + IconKey.item(finder).string + ".png"
        let ownerIcon = await pageAnswer(web, Self.unreadableRowIcon, arguments: ["path": inMail]) { (src: String?) in src?.hasSuffix(ownersIcon) == true }
        let owned = ownerIcon?.hasSuffix(ownersIcon) == true
        let list = await checkUnreadableList([inMail: .item(finder), messages: .place("messages"), downloads: .place("downloads")],
                                             saving: report.deletingLastPathComponent().appendingPathComponent("unreadable-list.png"))
        disk.pageCommand?(.open(fixture))
        let back = await eventually { self.disk.openFolder == fixture }
        cleanUp()
        let cleared = await liveMapShows { self.disk.result?.root.children?.contains { $0.path == home } != true }
        let settled = await mapSettles()
        print("places: Messages and Downloads \(unreadable ? "can't be read" : "have sizes"), shown at the root \(showsTheUnreadable(atRoot)) and at home "
              + "\(showsTheUnreadable(atHome)), Downloads named once \(namedOnce), gone further down \(gone); Developer "
              + "\(sized.developer.map(String.init) ?? "none") against the map's \(developerShown.map(String.init) ?? "none"), Mail "
              + "\(sized.mail.map(String.init) ?? "none") against \(mailShown.map(String.init) ?? "none"); V10's Couldn't read icon \(ownerIcon ?? "none"); "
              + "Downloads clicked \(clicked == true), asked for \(panes.asked.last?.url?.absoluteString ?? "no pane") \(askedForAccess), the map stayed \(stayed)")
        return [names[0]: unreadable && showsTheUnreadable(atRoot) && showsTheUnreadable(atHome) && namedOnce && inDeveloper && gone && back
                    && cleared && settled,
                names[1]: (sized.developer ?? 0) >= 1 << 20 && sized.developer == developerShown && inMailFolder && sized.mail != nil
                    && sized.mail == mailShown,
                names[2]: inMailFolder && owned,
                names[3]: list,
                names[4]: clicked == true && askedForAccess && stayed]
    }

    /// Clicks the Places row of the place at `path`: whether there was one.
    private static let clickPlace = """
        const button = [...document.querySelectorAll('[aria-labelledby="places-heading"] li button')].find((button) => button.title === path);
        button?.click();
        return button !== undefined;
        """

    /// The rows of Places: each one's text and tooltip, and its icon once it has loaded, decorative.
    private static let placeRows = """
        return [...document.querySelectorAll('[aria-labelledby="places-heading"] li')].map((row) => {
          const icon = row.querySelector("img");
          return { text: row.innerText, title: row.querySelector("button")?.title ?? null,
            icon: icon !== null && icon.complete && icon.naturalWidth > 0 && icon.alt === "" ? icon.src : null };
        });
        """

    /// The icon of `path`'s Couldn't read row, once it has loaded, decorative: its URL, or null.
    private static let unreadableRowIcon = """
        const row = [...document.querySelectorAll('[aria-labelledby="unreadable-heading"] li')].find((row) => row.title === path);
        const icon = row?.querySelector("img") ?? null;
        return icon !== null && icon.complete && icon.naturalWidth > 0 && icon.alt === "" ? icon.src : null;
        """

    /// Disk's list of the folders the map couldn't read, the one its notice opens, leads each row with the icon of what the
    /// folder belongs to (`keys`). The list is drawn as the popover draws it, in a borderless window of its own off screen,
    /// in the appearance the main window doesn't have, so its icons are drawn for it alone: the page draws in the main
    /// window's. Each row's icon is in the icon store for the list's size and appearance, and the list's own pixels show
    /// an icon at the start of each row, which a picture of it saved at `saving` shows too.
    private func checkUnreadableList(_ keys: [String: IconKey], saving: URL) async -> Bool {
        guard let main = mainWindow?.window else { return false }
        let folders = keys.keys.sorted().map { DiskUnreadableFolder(path: $0, reason: .denied) }
        let named = folders.allSatisfy { disk.ownerKey(for: $0.path) == keys[$0.path] }
        let appearance: IconAppearance = IconAppearance(main.effectiveAppearance) == .dark ? .light : .dark
        let host = NSHostingView(rootView: UnreadableList(model: disk, folders: folders, total: UInt64(folders.count)))
        let window = NSWindow(contentRect: NSRect(x: -8000, y: -8000, width: 460, height: 200), styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.appearance = NSAppearance(named: appearance == .dark ? .darkAqua : .aqua)
        window.contentView = host
        window.orderFrontRegardless()
        defer { window.orderOut(nil); window.contentView = nil }
        let size = IconSize(points: 16, scale: window.backingScaleFactor)
        let drawn = await eventually { keys.values.allSatisfy { Icons.store.cachedIcon(for: IconRequest($0, size: size, appearance: appearance)) != nil } }
        // The rows show their icons once the store's drawings reach them.
        var icons = 0
        _ = await eventually {
            guard let picture = host.bitmapImageRepForCachingDisplay(in: host.bounds) else { return false }
            host.cacheDisplay(in: host.bounds, to: picture)
            icons = Self.iconsAtTheStartOfRows(picture, width: host.bounds.width)
            try? picture.representation(using: .png, properties: [:])?.write(to: saving)
            return icons == folders.count
        }
        print("unreadable list: \(folders.count) rows keyed \(named ? "by their owners" : "otherwise"), drawn in \(appearance.rawValue) \(drawn), "
              + "\(icons) icons painted, saved to \(saving.path)")
        return named && drawn && icons == folders.count
    }

    /// How many icons a picture of the unreadable list shows at the start of its rows. Each is a run of pixel rows,
    /// 10 to 20 pt tall, in which much of the 16 pt column after the list's 16 pt margin is unlike the list's own ground,
    /// read in that margin, bridging gaps of up to 2 pt where an icon's own light parts come close to the ground. At
    /// least one of its rows is painted all the way across, which the title's letters there never are.
    private static func iconsAtTheStartOfRows(_ picture: NSBitmapImageRep, width: CGFloat) -> Int {
        let scale = CGFloat(picture.pixelsWide) / width
        guard let ground = picture.colorAt(x: Int(4 * scale), y: Int(4 * scale))?.usingColorSpace(.deviceRGB) else { return 0 }
        func unlike(_ x: Int, _ y: Int) -> Bool {
            guard let color = picture.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else { return false }
            return max(abs(color.redComponent - ground.redComponent), abs(color.greenComponent - ground.greenComponent),
                       abs(color.blueComponent - ground.blueComponent), abs(color.alphaComponent - ground.alphaComponent)) > 0.05
        }
        let columns = Int(17 * scale)..<Int(31 * scale)
        let shares = (0..<picture.pixelsHigh).map { y in Double(columns.filter { unlike($0, y) }.count) / Double(columns.count) }
        var icons = 0, start: Int?, gap = 0, densest = 0.0
        for (y, share) in (shares + [0]).enumerated() {
            if share >= 0.35 {
                if start == nil { start = y; densest = 0 }
                gap = 0
                densest = max(densest, share)
            } else if let begun = start {
                gap += 1
                guard gap > Int(2 * scale) || y == shares.count else { continue }
                if (Int(10 * scale)...Int(20 * scale)).contains(y - gap - begun + 1), densest >= 0.95 { icons += 1 }
                start = nil; gap = 0
            }
        }
        return icons
    }
}
