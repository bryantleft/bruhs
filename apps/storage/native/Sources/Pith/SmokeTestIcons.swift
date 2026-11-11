import AppKit
import PithCore
import WebKit

/// The smoke test's checks of the icons Pith shows: known places and the types most files are draw as macOS's own art,
/// never the generic document, and the bar under the map shows the store's drawing for the window's appearance, as
/// the window's own pixels have it (`cornerShows`). The side lists, the hover card and the map itself lead with
/// macOS's icons, and the map shows By kind's glyphs while Differentiate Without Color is on. The page loads the
/// icons from Pith's own route, which serves only what the map shows, under a base each page and appearance gets.
extension AppDelegate {
    /// Every known place this Mac has, and the types macOS declares itself that most files on a disk are, draw as more
    /// than the generic document: macOS draws a type it has no icon for, or a special folder's type it doesn't declare,
    /// as the blank page any unknown file gets, which says nothing of what a place or a file is. Each is drawn by the
    /// app's icon store, as the map's page and the native views draw it, at 16 pt at 2x in light and in dark, and compared
    /// pixel for pixel with the generic document drawn at the same size in the same appearance
    /// (`IconStore.genericDrawings`). One that draws as it, or draws nothing, is named. CI's macOS 15 job runs it too,
    /// where the Swift tests don't run.
    func checkNoGenericIcons() async -> [String: Bool] {
        let places = Icons.places
        let keys = (places.places + [places.emptyTrash].compactMap { $0 }).map { IconKey.place($0.id) } + Self.commonTypes.map(IconKey.type)
        let generic = await Icons.store.genericDrawings(of: keys, size: IconSize(points: 16, scale: 2))
        print("generic icons: \(keys.count) keys, \(keys.count - Self.commonTypes.count) places and \(Self.commonTypes.count) types, drawn in light and "
              + "dark; \(generic.isEmpty ? "none draws as the generic document" : "the generic document for \(generic.map(\.description).joined(separator: "; "))")")
        return ["places_and_types_have_their_own_icons": generic.isEmpty]
    }

    /// Types macOS declares itself, which most files on a disk are: documents, pictures, films, music, archives, disk
    /// images and text.
    static let commonTypes = ["pdf", "png", "jpeg", "mov", "mp3", "zip", "dmg", "txt"]

    /// How closely `window`'s bottom left corner, where the bar under the map leads with the selection's icon, shows
    /// each of `drawings`, as the window's pixels are composited now (`cacheDisplay`): for each, the least mean difference,
    /// out of 255 a channel, over the pixels its drawing covers whole, at the place it matches best. Only those pixels are
    /// compared, so the bar's own colour, which follows the appearance too, counts for nothing. Each drawing is put in the
    /// window's colour space first, as macOS does to show it. Nil when the window can't be read.
    static func cornerShows(_ drawings: [CGImage], in window: NSWindow) -> [Double]? {
        guard let content = window.contentView, let picture = content.bitmapImageRepForCachingDisplay(in: content.bounds) else { return nil }
        content.cacheDisplay(in: content.bounds, to: picture)
        guard let shot = picture.cgImage, let space = shot.colorSpace ?? CGColorSpace(name: CGColorSpace.sRGB),
              let screen = Self.rgba(shot, in: space) else { return nil }
        let scale = Double(shot.width) / Double(content.bounds.width)
        // The bar is 52 pt high at least; its icon comes after its padding, well inside the first 200 pt.
        let columns = 0..<min(screen.width, Int(200 * scale)), rows = max(0, screen.height - Int(80 * scale))..<screen.height
        return drawings.map { drawing in
            guard let icon = Self.rgba(drawing, in: space) else { return .infinity }
            // The pixels it covers whole, each as its offset in the drawing.
            var covered: [(x: Int, y: Int)] = []
            for y in 0..<icon.height {
                for x in 0..<icon.width where icon.bytes[(y * icon.width + x) * 4 + 3] == 255 { covered.append((x, y)) }
            }
            guard !covered.isEmpty else { return .infinity }
            let channels = Double(covered.count * 3)
            var best = Double.infinity
            for top in rows where top + icon.height <= screen.height {
                for left in columns where left + icon.width <= screen.width {
                    let limit = best * channels
                    var sum = 0
                    for pixel in covered {
                        let at = ((top + pixel.y) * screen.width + left + pixel.x) * 4, own = (pixel.y * icon.width + pixel.x) * 4
                        for channel in 0..<3 { sum += abs(Int(screen.bytes[at + channel]) - Int(icon.bytes[own + channel])) }
                        if Double(sum) >= limit { break }
                    }
                    best = min(best, Double(sum) / channels)
                }
            }
            return best
        }
    }

    /// `image`'s pixels, premultiplied RGBA, its top row first, in the colour space `space`.
    private static func rgba(_ image: CGImage, in space: CGColorSpace) -> (width: Int, height: Int, bytes: [UInt8])? {
        var bytes = [UInt8](repeating: 0, count: image.width * image.height * 4)
        let drawn = bytes.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(data: buffer.baseAddress, width: image.width, height: image.height, bitsPerComponent: 8, bytesPerRow: image.width * 4,
                                          space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
            return true
        }
        return drawn ? (image.width, image.height, bytes) : nil
    }

    /// Selects the fixture's sub folder, as a click does, since macOS can draw a folder unlike in light and dark where it
    /// draws a file's type alike, then switches the window to light and then to dark: for each, the bar under the map
    /// shows the folder's icon as the store draws it in that appearance, off the main thread, as the window's own pixels
    /// show, and not the drawing for the other appearance, where the two differ. The selection and the window's
    /// appearance are as they were after.
    func checkSelectionIcon() async -> Bool {
        guard let window = mainWindow?.window, let root = disk.result?.root.path else { return false }
        let folder = (root as NSString).appendingPathComponent("sub"), selected = disk.selection.paths
        defer { disk.select(selected) }
        disk.select([folder])
        guard await eventually({ self.disk.selectedItems.map(\.path) == [folder] }), let item = disk.selectedItems.first else { return false }
        let key = disk.iconKey(for: item)
        let size = IconSize(points: 16, scale: window.backingScaleFactor)
        let chosen = window.appearance
        defer { window.appearance = chosen }
        let version = ProcessInfo.processInfo.operatingSystemVersion
        let macOS = "\(version.majorVersion).\(version.minorVersion).\(version.patchVersion)"
        let foldersAlike = AppearanceShown.macOSDrawsFoldersAlike()
        var verdicts: [IconAppearance: AppearanceShown] = [:], seen: [String] = []
        for appearance in IconAppearance.allCases {
            window.appearance = NSAppearance(named: appearance == .dark ? .darkAqua : .aqua)
            guard let own = await Icons.store.icon(for: IconRequest(key, size: size, appearance: appearance)),
                  let other = await Icons.store.icon(for: IconRequest(key, size: size, appearance: appearance == .dark ? .light : .dark)) else { continue }
            let alike = own.image.dataProvider?.data as Data? == other.image.dataProvider?.data as Data?
            var found: [Double] = []
            // Out of 255 a channel: the window's pixels and the store's drawing go through the same colour conversion, so
            // the drawing shown differs from them by rounding alone.
            let matches = await eventually {
                found = Self.cornerShows([own.image, other.image], in: window) ?? []
                return found.count == 2 && found[0] < 4 && (alike || found[0] + 0.5 < found[1])
            }
            verdicts[appearance] = AppearanceShown.judge(matches: matches, alike: alike, foldersAlike: foldersAlike)
            seen.append("\(appearance.rawValue) \(found.map { String(format: "%.1f", $0) })\(alike ? ", its drawings alike" : "")")
        }
        print("selection icon \(key.string): \(IconAppearance.allCases.map { "\($0.rawValue) \(verdicts[$0].map { "\($0)" } ?? "not drawn")" }); "
              + "differences from the drawing of each appearance and the other's \(seen)")
        if verdicts.values.contains(.notProvenHere) {
            print("selection icon: appearance not proven here: macOS \(macOS) draws the folder alike in light and dark, so the bar showing its "
                  + "drawing can't tell which appearance it follows")
        }
        return IconAppearance.allCases.allSatisfy { verdicts[$0] == .shown || verdicts[$0] == .notProvenHere }
    }

    /// The side lists and the hover card lead with macOS's icons, which the page loads from Pith's route at its own
    /// pixel ratio: every row of Largest files shows one that has loaded, and so does the card for the block under the
    /// pointer. Each is decorative, with an empty alt.
    func checkListIcons() async -> [String: Bool] {
        guard let web = webView else { return ["side_rows_show_icons": false, "hover_card_shows_icon": false] }
        let rows = await pageAnswer(web, Self.rowIcons) { (rows: [String: Any]?) in
            let count = rows?["rows"] as? Int ?? 0
            return count > 0 && rows?["loaded"] as? Int == count
        }
        _ = try? await web.callAsyncJavaScript(Self.pointAtMap("mousemove"), in: nil, contentWorld: .page)
        let card = await pageAnswer(web, Self.cardIcon) { (src: String?) in src != nil }
        _ = try? await web.callAsyncJavaScript(Self.pointAtMap("mouseout"), in: nil, contentWorld: .page)
        let count = rows?["rows"] as? Int ?? 0
        print("side rows: \(rows?["loaded"] as? Int ?? 0) of \(count) icons loaded, first \(rows?["first"] as? String ?? "none"); hover card \(card ?? "no icon")")
        return ["side_rows_show_icons": count > 0 && rows?["loaded"] as? Int == count, "hover_card_shows_icon": card != nil]
    }

    /// How many rows Largest files has, and how many lead with a decorative icon from the page's icon base that has
    /// loaded at the page's own scale.
    private static let rowIcons = """
        const base = window.pithIconBase;
        const scale = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio)));
        const icons = [...document.querySelectorAll('[aria-label="Largest files"] li')].map((row) => row.querySelector("img"));
        const loaded = icons.filter((icon) => icon !== null && typeof base === "string" && icon.src.startsWith(base + "16@" + scale + "x/")
          && icon.complete && icon.naturalWidth === 16 * scale && icon.alt === "");
        return { rows: icons.length, loaded: loaded.length, first: icons[0]?.src ?? null };
        """

    /// The pointer moving onto the middle of the map, or off it again, as the page hears it.
    private static func pointAtMap(_ event: String) -> String {
        """
        const canvas = document.querySelector("canvas");
        const box = canvas.getBoundingClientRect();
        canvas.dispatchEvent(new MouseEvent("\(event)", { bubbles: true, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2,
          relatedTarget: document.body }));
        """
    }

    /// The hover card's icon, once it has loaded: its URL, or null.
    private static let cardIcon = """
        const icon = document.querySelector(".tooltip img");
        return icon !== null && icon.complete && icon.naturalWidth > 0 && icon.alt === "" ? icon.src : null;
        """

    /// The map draws macOS's icons on itself and, with Differentiate Without Color on, each file kind's glyph. The
    /// fixture's sub folder shows its icon at the start of its label line, in the room the map keeps for it, drawn on
    /// the canvas from Pith's route. The setting reaches the page as macOS's notice of a display option change makes
    /// the coordinator read it again: Pith alone reads it turned the other way from this Mac's, so By kind shows its
    /// glyphs, or stops, and the map draws again; then it reads this Mac's own once more, and the page follows it back.
    /// Each notice is posted in Pith alone, and no system setting changes.
    func checkMapMarks() async -> [String: Bool] {
        let names = ["map_shows_icons", "kind_glyphs_follow_differentiate_without_color"]
        guard let web = webView, let coordinator = web.navigationDelegate as? DiskWebView.Coordinator else {
            return Dictionary(uniqueKeysWithValues: names.map { ($0, false) })
        }
        let painted = try? await web.callAsyncJavaScript(Self.mapIcon, arguments: ["name": "sub"], in: nil, contentWorld: .page) as? Double

        let system = NSWorkspace.shared.accessibilityDisplayShouldDifferentiateWithoutColor
        let reads = DiskWebView.Coordinator.differentiateWithoutColor
        let changed = { NSWorkspace.shared.notificationCenter.post(name: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification, object: NSWorkspace.shared) }
        defer { DiskWebView.Coordinator.differentiateWithoutColor = reads; changed() }
        let before = await pageAnswer(web, Self.mapMarks) { (marks: [String: Int]?) in marks != nil }
        DiskWebView.Coordinator.differentiateWithoutColor = { !system }
        changed()
        let turned = await pageAnswer(web, Self.mapMarks) { (marks: [String: Int]?) in
            ((marks?["glyphs"] ?? 0) > 0) == !system && marks?["print"] != nil && marks?["print"] != before?["print"]
        }
        DiskWebView.Coordinator.differentiateWithoutColor = reads
        changed()
        let back = await pageAnswer(web, Self.mapMarks) { (marks: [String: Int]?) in
            ((marks?["glyphs"] ?? 0) > 0) == system && marks?["print"] != nil && marks?["print"] != turned?["print"]
        }
        let followed = before != nil && ((turned?["glyphs"] ?? 0) > 0) == !system && turned?["print"] != before?["print"]
            && ((back?["glyphs"] ?? 0) > 0) == system && back?["print"] != turned?["print"] && coordinator.differentiatesWithoutColor == system
        print("map icons: sub's icon painted \(painted.map { "\(Int($0 * 100))%" } ?? "nothing") of its slot; Differentiate Without Color \(system ? "on" : "off") here, "
              + "By kind's glyphs \(before?["glyphs"] ?? -1), turned \(turned?["glyphs"] ?? -1), back \(back?["glyphs"] ?? -1), and the map drew again \(followed)")
        return [names[0]: (painted ?? 0) >= 0.25, names[1]: followed]
    }

    /// How much of the 14 px square at the start of the label line of the open folder's item `name` its icon covers:
    /// the share of the canvas's own pixels there unlike the map's ground beside it, once that's a quarter or 3 s have
    /// passed. The item is found by selecting it in the map's list of items, and the selection is cleared after.
    private static let mapIcon = mapScript("""
        const box = await boxOf(name);
        if (!box) return null;
        const frame = canvas.getBoundingClientRect(), scale = canvas.width / frame.width;
        const context = canvas.getContext("2d");
        const read = (x, y, size) => context.getImageData(Math.round((box.left - frame.left + x) * scale),
          Math.round((box.top - frame.top + y) * scale), Math.max(1, Math.round(size * scale)), Math.max(1, Math.round(size * scale))).data;
        const covered = () => {
          const slot = read(4, 3, 14), ground = read(2, 10, 1);
          let unlike = 0;
          for (let i = 0; i < slot.length; i += 4) {
            if ([0, 1, 2, 3].some((channel) => Math.abs(slot[i + channel] - ground[channel]) > 24)) unlike += 1;
          }
          return unlike / (slot.length / 4);
        };
        await until(() => covered() >= 0.25);
        const share = covered();
        canvas.parentElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        return share;
        """)

    /// How many glyphs By kind shows, and a print of the map's pixels, which changes whenever the map draws anything else.
    private static let mapMarks = """
        const canvas = document.querySelector("canvas");
        const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        let print = 0;
        for (let i = 0; i < pixels.length; i += 4) print = (print * 31 + pixels[i] + 3 * pixels[i + 1] + 7 * pixels[i + 2] + 11 * pixels[i + 3]) | 0;
        return { glyphs: document.querySelectorAll('[aria-labelledby="kinds-heading"] svg').length, print };
        """

    /// Grew since, Wrote the most since and Couldn't read lead with their items' icons too. A folder of the fixture that
    /// nobody may list shows under Couldn't read. What grew and who wrote are put in memory, since Pith keeps its record
    /// of them with the person's scans, history and settings, which the smoke test never reads or writes: the fixture's
    /// sub folder grew, and an app with a real bundle and a tool without one wrote. They reach the page as any writers
    /// do, so the route has to allow the app's icon by its bundle, and the tool shows none.
    func checkSideLists(_ fixture: String) async -> [String: Bool] {
        let names = ["grew_since_shows_icons", "wrote_the_most_shows_app_icons", "couldnt_read_shows_icons"]
        let files = FileManager.default
        let locked = URL(fileURLWithPath: fixture).appendingPathComponent("pith-smoke-locked-\(UUID().uuidString)")
        defer {
            // Readable again first: a folder nobody may list can't be emptied to remove.
            try? files.setAttributes([.posixPermissions: 0o755], ofItemAtPath: locked.path)
            try? files.removeItem(at: locked)
        }
        guard let web = webView,
              (try? files.createDirectory(at: locked, withIntermediateDirectories: false, attributes: [.posixPermissions: 0])) != nil else {
            return Dictionary(uniqueKeysWithValues: names.map { ($0, false) })
        }
        let listed = await liveMapShows { self.disk.result?.root.children?.contains { $0.path == locked.path && $0.kind == .unreadable } == true }
        let sub = (fixture as NSString).appendingPathComponent("sub"), app = "/System/Library/CoreServices/Finder.app"
        let kept = (writers: disk.writers, growth: disk.growth, since: disk.growthSince)
        disk.writers = { since in
            .apps([DiskWriter(name: "Finder", bytes: 3_000_000, bundle: app), DiskWriter(name: "pith-smoke-tool", bytes: 1_000_000)], since: since)
        }
        let grown: [String: Int64] = [sub: 2_000_000]
        let lists = await pageAnswer(web, Self.sideListIcons, arguments: ["grewKey": IconKey.item(sub).string, "appKey": IconKey.item(app).string]) {
            (lists: [String: Bool]?) in
            // A newer map compares itself with the baseline again, which drops a growth put in memory, so it's put back.
            if self.disk.growth != grown { self.disk.smokeTestShowsGrowth(grown, since: Date()) }
            return lists?["grew"] == true && lists?["wrote"] == true && lists?["unreadable"] == true
        }
        disk.writers = kept.writers
        disk.smokeTestShowsGrowth(kept.growth, since: kept.since)
        print("side lists: grew \(lists?["grew"] ?? false), wrote \(lists?["wrote"] ?? false), couldn't read \(lists?["unreadable"] ?? false) "
              + "(the locked folder listed \(listed))")
        return [names[0]: lists?["grew"] == true, names[1]: lists?["wrote"] == true, names[2]: listed && lists?["unreadable"] == true]
    }

    /// Whether the side lists lead with loaded, decorative icons: the folder that grew with its own, the app that wrote
    /// with its bundle's while the tool after it shows none, and the folder nobody may read with a plain folder.
    private static let sideListIcons = """
        const loaded = (icon) => icon !== null && icon.complete && icon.naturalWidth > 0 && icon.alt === "";
        const rows = (heading) => [...(document.querySelector('[aria-labelledby="' + heading + '"]')?.querySelectorAll("li") ?? [])]
          .map((row) => row.querySelector("img"));
        const grew = rows("grew-heading"), wrote = rows("writers-heading"), unreadable = rows("unreadable-heading");
        return {
          grew: grew.some((icon) => loaded(icon) && icon.src.endsWith("/" + grewKey + ".png")),
          wrote: wrote.length === 2 && loaded(wrote[0]) && wrote[0].src.endsWith("/" + appKey + ".png") && wrote[1] === null,
          unreadable: unreadable.some((icon) => loaded(icon) && icon.src.endsWith("/folder.png")),
        };
        """

    /// The icons' base and rule reach the page once it's ready and again when either changes, never with each map: a map
    /// sent again leaves them alone, and a reloaded page gets them before its first map, so its rows lead with their
    /// icons again.
    func checkIconsReachEveryPage() async -> [String: Bool] {
        let names = ["icon_base_not_resent_with_maps", "icons_reach_a_reloaded_page"]
        guard let web = webView else { return Dictionary(uniqueKeysWithValues: names.map { ($0, false) }) }
        _ = try? await web.callAsyncJavaScript(Self.countReceipts, in: nil, contentWorld: .page)
        disk.revision = UUID()
        let counts = await pageAnswer(web, "return window.pithSmokeCounts ?? null") { (counts: [String: Int]?) in (counts?["maps"] ?? 0) > 0 }
        let before = await pageIconBase(web)
        web.reload()
        // The page that counted is gone once the reloaded one answers.
        let rows = await pageAnswer(web, "if (window.pithSmokeCounts !== undefined) return null;\n" + Self.rowIcons) { (rows: [String: Any]?) in
            let count = rows?["rows"] as? Int ?? 0
            return count > 0 && rows?["loaded"] as? Int == count
        }
        let after = await pageIconBase(web)
        let count = rows?["rows"] as? Int ?? 0
        print("icons across maps: \(counts?["maps"] ?? 0) maps and \(counts?["bases"] ?? -1) bases sent; after a reload \(rows?["loaded"] as? Int ?? 0) "
              + "of \(count) icons loaded from \(after ?? "no base"), before \(before ?? "no base")")
        return [names[0]: (counts?["maps"] ?? 0) > 0 && counts?["bases"] == 0,
                names[1]: before != nil && after == before && count > 0 && rows?["loaded"] as? Int == count]
    }

    /// Counts the maps and the icons' bases Pith gives the page from now on, in `window.pithSmokeCounts`.
    private static let countReceipts = """
        const counts = { maps: 0, bases: 0 };
        window.pithSmokeCounts = counts;
        const receive = window.pithReceive, base = window.pithReceiveIconBase;
        window.pithReceive = (...values) => { counts.maps += 1; return receive(...values); };
        window.pithReceiveIconBase = (...values) => { counts.bases += 1; return base(...values); };
        """

    /// The map's page loads icons from Pith's own scheme, so a canvas can read them back. The map's own folder draws on
    /// a canvas whose pixels `getImageData` returns, which it refuses for an image from another origin, while a folder
    /// outside the map and a key of no kind get a 404. When the page stops loads while their icons are still being
    /// drawn, WebKit stops the route's requests, and each of their drawings still comes and goes unanswered, since
    /// WebKit raises an exception for an answer to a stopped request; the route then answers a URL it hasn't served. A
    /// new appearance gives the page a new base, a generation on, whose icons load too.
    func checkIconRoute(_ fixture: String) async -> [String: Bool] {
        let names = ["icon_route_draws_on_canvas", "icon_route_refuses_what_the_map_doesnt_show", "icon_route_survives_stopped_loads",
                     "icon_base_follows_appearance"]
        guard let web = webView, let window = web.window, let assets = web.configuration.urlSchemeHandler(forURLScheme: "pith") as? BundledAssets else {
            return Dictionary(uniqueKeysWithValues: names.map { ($0, false) })
        }
        let own = IconKey.item(fixture).string
        // Whether `key`'s icon loads at `points` pt at 2x and draws on a canvas, with how many of its pixels show, and
        // which of `others` load. WebKit keeps an image for as long as its URL stays the same, so only a URL the page
        // hasn't loaded reaches the route.
        func draw(_ key: String, points: Int = 16, others: [String] = []) async -> (drawn: Bool, painted: Int, loaded: [Bool]) {
            let result = try? await web.callAsyncJavaScript(Self.drawIcons, arguments: ["keys": [key] + others, "size": "\(points)@2x"], in: nil,
                                                            contentWorld: .page) as? [String: Any]
            let painted = result?["painted"] as? Int ?? 0
            return (result?["width"] as? Int == points * 2 && painted > 0, painted, result?["loaded"] as? [Bool] ?? [])
        }
        let before = await pageIconBase(web)
        let first = await draw(own, others: [IconKey.item("/Applications").string, "thing/x"])

        let stoppedBefore = assets.stoppedWhileDrawing, lateBefore = assets.drawnAfterStopping
        let unfinished = (try? await web.callAsyncJavaScript(Self.stopIcons, in: nil, contentWorld: .page)) as? Int ?? -1
        // WebKit can tell the route of a stop after the page's loads have ended, so the stops are counted once no request
        // waits for its drawing: each was either answered or stopped by then.
        let settled = await eventually { assets.waitingForDrawings == 0 }
        let stopped = assets.stoppedWhileDrawing - stoppedBefore
        let caughtUp = await eventually { assets.drawnAfterStopping - lateBefore >= stopped }
        let late = assets.drawnAfterStopping - lateBefore
        // At a size the page hasn't loaded, so the route answers it.
        let afterStopping = await draw(own, points: 12)

        let chosen = window.appearance
        defer { window.appearance = chosen }
        let other: IconAppearance = before?.hasSuffix("/dark/") == true ? .light : .dark
        let expected = before.flatMap(Self.generation).map { IconPolicy.base(generation: $0 + 1, appearance: other) }
        window.appearance = NSAppearance(named: other == .dark ? .darkAqua : .aqua)
        let after = await pageIconBase(web) { $0 == expected }
        // The new base makes these URLs the page hasn't loaded too.
        let inOther = await draw(own)
        print("icon route from \(before ?? "no base"): \(own) painted \(first.painted) pixels, others loaded \(first.loaded); "
              + "\(stopped) requests stopped while drawing, \(late) of their drawings came unanswered, \(unfinished) of 120 loads unfinished on the page, "
              + "then a new size drew \(afterStopping.drawn); \(other.rawValue) gave \(after ?? "no base") for \(expected ?? "nothing"), drew \(inOther.drawn)")
        return [names[0]: first.drawn, names[1]: first.loaded == [false, false], names[2]: settled && stopped > 0 && caughtUp && afterStopping.drawn,
                names[3]: expected != nil && after == expected && inOther.drawn]
    }

    /// Loads `keys`' icons from the page's icon base at `size`, and draws the first on a canvas: its width, how many of
    /// its pixels show, and which of the rest loaded. `getImageData` throws for a canvas another origin's image drew on.
    private static let drawIcons = """
        const base = window.pithIconBase;
        if (typeof base !== "string") return null;
        const load = async (key) => {
          const image = new Image();
          image.src = base + size + "/" + key + ".png";
          try { await image.decode(); return image; } catch { return null; }
        };
        const [first, ...rest] = await Promise.all(keys.map(load));
        let painted = 0;
        if (first) {
          const canvas = document.createElement("canvas");
          canvas.width = first.naturalWidth;
          canvas.height = first.naturalHeight;
          const context = canvas.getContext("2d");
          context.drawImage(first, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) painted += 1;
        }
        return { width: first ? first.naturalWidth : 0, painted, loaded: rest.map((image) => image !== null) };
        """

    /// Asks for 120 icons nothing has drawn, each at a size of its own, since macOS draws an icon at a new size slowly
    /// the first time, then stops every load once the first has come, while most are still being drawn: how many of
    /// the loads didn't finish.
    private static let stopIcons = """
        const base = window.pithIconBase;
        if (typeof base !== "string") return -1;
        const loads = Array.from({ length: 120 }, (_, n) => {
          const image = new Image();
          image.src = base + (8 + n) + "@1x/type/pith-smoke-" + n + ".png";
          return image.decode().then(() => true, () => false);
        });
        await Promise.race(loads);
        window.stop();
        return (await Promise.all(loads)).filter((loaded) => !loaded).length;
        """

    /// The page's icon base, once `wanted` holds for it or the smoke test's patience runs out.
    private func pageIconBase(_ web: WKWebView, until wanted: (String?) -> Bool = { _ in true }) async -> String? {
        await pageAnswer(web, "return window.pithIconBase ?? null", until: wanted)
    }

    /// The generation in an icon base, `pith://app/icon/<generation>/<appearance>/`.
    private static func generation(_ base: String) -> Int? {
        let prefix = "pith://app/icon/"
        return base.hasPrefix(prefix) ? Int(base.dropFirst(prefix.count).prefix { $0 != "/" }) : nil
    }
}
