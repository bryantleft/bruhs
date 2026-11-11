import AppKit
import PithCore
import WebKit

/// The smoke test's checks of the column beside the map: it scrolls as one, holding its width and starting at its top
/// in each folder opened, its copy says each fact once, and its rows name their items, their folders below the open one.
extension AppDelegate {
    /// The column beside the map is one scroll area, in which every section, Largest files included, takes its natural
    /// height, so each row of each is reachable however long the column gets. The check makes it taller than the window
    /// with a folder of its own holding 24 files of 1 MiB each, the least the live map lists by name, seven folders nobody
    /// may list and a folder holding one more file, with what grew and who wrote put in memory, as `checkSideLists` puts
    /// them. Then:
    /// - The column overflows, nothing in it scrolls on its own, and Largest files' last row is out of view at the top.
    ///   Scrolled to Largest files, its first rows show; scrolled to the end, its last row does; and from the top, the
    ///   last row focused, as a keyboard focuses it, scrolls into view. No row is hidden from VoiceOver.
    /// - Scrolled down, the column keeps its place through a map sent again, as the live map sends one every two seconds
    ///   while the disk changes, and starts at its top in a folder opened, and again after Back.
    /// - Its width stays as it is in a folder whose column fits, so its rows never take on other cuts as it overflows.
    /// - Couldn't read, in the check's folder, shows six of its seven folders and says only how many more there are.
    /// - By kind has no sentence under it; Wrote the most since says only what its heading doesn't, that macOS doesn't
    ///   say which folders the apps wrote to, and since then, its date being Grew since's. With Keep a week of history
    ///   off, held in memory as every setting of a smoke run, Pith sends no writers, and the section doesn't show.
    /// - Grew since leads each row with the item's name and the folder it's in below the open folder on a second line, as
    ///   Largest files does, an item right in the open folder having none, the growth where Largest files has the size,
    ///   and VoiceOver hears the three.
    /// A picture of the window, the column scrolled to Largest files, is saved at `picture`.
    func checkSideColumn(_ fixture: String, picture: URL) async -> [String: Bool] {
        let names = ["side_column_scrolls_as_one", "side_column_says_each_fact_once", "grew_since_rows_lead_with_the_name",
                     "side_column_starts_at_its_top_in_each_folder", "side_column_keeps_its_width"]
        let files = FileManager.default, mark = UUID().uuidString.prefix(8).lowercased()
        let tall = (fixture as NSString).appendingPathComponent("pith-smoke-tall-\(mark)")
        let made = (0..<24).map { (tall as NSString).appendingPathComponent("tall-\($0).bin") }
        let locked = (0..<7).map { (tall as NSString).appendingPathComponent("locked-\($0)") }
        let short = (tall as NSString).appendingPathComponent("short"), shortFile = (short as NSString).appendingPathComponent("short.bin")
        let kept = (writers: disk.writers, growth: disk.growth, since: disk.growthSince, history: activity.keepsHistory)
        func restore() {
            disk.writers = kept.writers
            if activity.keepsHistory != kept.history { activity.keepsHistory = kept.history }
            disk.smokeTestShowsGrowth(kept.growth, since: kept.since)
        }
        func clear() {
            // Readable again first: a folder nobody may list can't be emptied to remove.
            for folder in locked { try? files.setAttributes([.posixPermissions: 0o755], ofItemAtPath: folder) }
            try? files.removeItem(atPath: tall)
        }
        defer {
            restore()
            clear()
        }
        let listed = { (self.disk.result?.topFiles.map(\.path)).map { Set(made + [shortFile]).isSubset(of: Set($0)) } == true }
        guard let web = webView, (try? files.createDirectory(atPath: short, withIntermediateDirectories: true)) != nil,
              (made + [shortFile]).allSatisfy({ files.createFile(atPath: $0, contents: Data(count: 1 << 20)) }),
              locked.allSatisfy({ (try? files.createDirectory(atPath: $0, withIntermediateDirectories: false, attributes: [.posixPermissions: 0])) != nil }),
              await liveMapShows(listed), await mapSettles() else {
            print("side column: the check's files never reached the map")
            return Dictionary(uniqueKeysWithValues: names.map { ($0, false) })
        }
        let sub = (fixture as NSString).appendingPathComponent("sub"), deeper = (sub as NSString).appendingPathComponent("deeper")
        let other = (fixture as NSString).appendingPathComponent("other"), finder = "/System/Library/CoreServices/Finder.app"
        disk.writers = { since in
            .apps([DiskWriter(name: "Finder", bytes: 3_000_000, bundle: finder), DiskWriter(name: "pith-smoke-tool", bytes: 1_000_000)], since: since)
        }
        let grown: [String: Int64] = [deeper: 2_000_000, other: 1_000_000]
        // A newer map compares itself with the baseline again, which drops a growth put in memory, so it's put back.
        let keepGrowth = { if self.disk.growth != grown { self.disk.smokeTestShowsGrowth(grown, since: Date()) } }
        let column = await pageAnswer(web, Self.sideColumnScrolls) { (column: [String: Any]?) in
            keepGrowth()
            return column?["writers"] as? Int == 2 && column?["grew"] as? Int == 2 && (column?["rows"] as? Int ?? 0) >= made.count
        }
        let flags = ["overflows", "hiddenAtTop", "firstShown", "lastShown", "focused", "spoken"]
        let scrolls = column.map { column in flags.allSatisfy { column[$0] as? Bool == true } && column["scrollers"] as? Int == 0 } ?? false
        print("side column: \(column?["rows"] as? Int ?? 0) rows in Largest files; "
              + flags.map { "\($0) \(column?[$0] as? Bool == true)" }.joined(separator: ", ") + ", \(column?["scrollers"] as? Int ?? -1) lists scrolling on their own")
        _ = try? await web.callAsyncJavaScript(Self.scrollColumn, arguments: ["toLargest": true], in: nil, contentWorld: .page)
        try? await Task.sleep(for: .milliseconds(200))
        if let view = web.window?.contentView, let image = view.bitmapImageRepForCachingDisplay(in: view.bounds) {
            view.cacheDisplay(in: view.bounds, to: image)
            try? image.representation(using: .png, properties: [:])?.write(to: picture)
        }

        let folders = await checkColumnAcrossFolders(web, fixture: fixture, tall: tall, short: short, file: made[0])

        _ = try? await web.callAsyncJavaScript(Self.scrollColumn, arguments: ["toLargest": false], in: nil, contentWorld: .page)
        // Back at the root, Grew since and Wrote the most since show again once the growth put in memory does.
        let copy = await pageAnswer(web, Self.sideColumnCopy) { (copy: [String: Any]?) in
            keepGrowth()
            return (copy?["grew"] as? [[String: Any]])?.count == 2 && copy?["writersHeading"] is String
        }
        let note = ["macOS doesn’t say which folders they wrote to."]
        let said = copy?["kinds"] as? [String] == [] && copy?["writers"] as? [String] == note
            && copy?["writersHeading"] as? String == "Wrote the most since then" && folders.unreadable == ["And 1 more."]
        let rows = copy?["grew"] as? [[String: Any]] ?? []
        let deep = rows.first, top = rows.dropFirst().first
        let largest = copy?["largest"] as? [String: [String]] ?? [:]
        let led = rows.count == 2
            && deep?["lines"] as? [String] == ["deeper", "sub"] && deep?["figure"] as? String == "+2.00 MB"
            && deep?["label"] as? String == "deeper, +2.00 MB, in sub"
            && top?["lines"] as? [String] == ["other"] && top?["figure"] as? String == "+1.00 MB" && top?["label"] as? String == "other, +1.00 MB"
            && largest[(sub as NSString).appendingPathComponent("video.mov")] == ["video.mov", "sub"]
            && largest[made[0]] == ["tall-0.bin", (tall as NSString).lastPathComponent] && folders.inTall == ["tall-0.bin"]
        print("side column copy: By kind's sentences \(copy?["kinds"] ?? "none"), Wrote the most since's heading \(copy?["writersHeading"] ?? "none") "
              + "and sentences \(copy?["writers"] ?? "none"), Couldn't read's in the check's folder \(folders.unreadable ?? []); Grew since's rows \(rows); "
              + "Largest files' lines \(largest)")

        // Keep a week of history off: Pith sends no writers, and the section goes.
        disk.writers = kept.writers
        activity.keepsHistory = false
        disk.smokeTestShowsGrowth(grown, since: Date())
        let hidden = await pageAnswer(web, Self.writersShown) { (shown: [String: Any]?) in
            keepGrowth()
            return shown?["grew"] as? Bool == true && shown?["writers"] as? Bool == false
        }
        let offHides = hidden?["grew"] as? Bool == true && hidden?["writers"] as? Bool == false
        print("side column with Keep a week of history off: Grew since shows \(hidden?["grew"] as? Bool == true), Wrote the most since "
              + "\(hidden?["writers"] as? Bool == true ? "shows" : "doesn't show")")
        restore()
        clear()
        let gone = await liveMapShows { self.disk.result?.item(at: tall) == nil }
        let settled = await mapSettles()
        return [names[0]: scrolls && gone && settled, names[1]: said && offHides, names[2]: led, names[3]: folders.startsAtTop,
                names[4]: folders.keepsWidth]
    }

    /// What the column does across folders, in the column's own words: its place through a map sent again, at the top of
    /// the check's folder and back at the fixture's root after Back, its width in a folder whose column fits beside the
    /// root's, which overflows, Couldn't read's sentences in the check's folder, and the lines of `file`'s Largest files
    /// row there, right in the open folder.
    private func checkColumnAcrossFolders(_ web: WKWebView, fixture: String, tall: String, short: String, file: String) async
        -> (startsAtTop: Bool, keepsWidth: Bool, unreadable: [String]?, inTall: [String]?) {
        func column() async -> [String: Any]? { try? await web.callAsyncJavaScript(Self.columnState, in: nil, contentWorld: .page) as? [String: Any] }
        func scrollTop(_ state: [String: Any]?) -> Double { (state?["top"] as? NSNumber)?.doubleValue ?? -1 }
        // Scrolled down to Largest files at the root, the column keeps its place through the same map sent again.
        _ = try? await web.callAsyncJavaScript(Self.scrollColumn, arguments: ["toLargest": true], in: nil, contentWorld: .page)
        let down = await pageAnswer(web, Self.columnState) { (state: [String: Any]?) in scrollTop(state) > 0 }
        let maps = (try? await web.callAsyncJavaScript(Self.countMaps, in: nil, contentWorld: .page) as? Int) ?? -1
        disk.revision = UUID()
        let sentAgain = await pageAnswer(web, Self.countMaps) { (count: Int?) in (count ?? -1) > maps }
        try? await Task.sleep(for: .milliseconds(150))
        let afterMap = await column()
        _ = try? await web.callAsyncJavaScript(Self.uncountMaps, in: nil, contentWorld: .page)
        let kept = (sentAgain ?? -1) > maps && scrollTop(down) > 0 && abs(scrollTop(afterMap) - scrollTop(down)) < 1
        // The check's folder opened starts at its top, as its own folder does after Back.
        disk.pageCommand?(.open(tall))
        let opened = await eventually { self.disk.openFolder == tall }
        let atTop = await pageAnswer(web, Self.columnState) { (state: [String: Any]?) in scrollTop(state) == 0 && (state?["rows"] as? Int ?? 0) > 0 }
        let inTall = await pageAnswer(web, Self.columnState, arguments: ["path": file]) { (state: [String: Any]?) in
            (state?["unreadable"] as? [String])?.isEmpty == false && state?["lines"] is [String]
        }
        _ = try? await web.callAsyncJavaScript(Self.scrollColumn, arguments: ["toLargest": true], in: nil, contentWorld: .page)
        let downInTall = await pageAnswer(web, Self.columnState) { (state: [String: Any]?) in scrollTop(state) > 0 }
        disk.pageCommand?(.back)
        let back = await eventually { self.disk.openFolder == fixture }
        let atTopAgain = await pageAnswer(web, Self.columnState) { (state: [String: Any]?) in scrollTop(state) == 0 && state?["overflows"] as? Bool == true }
        // A folder whose column fits keeps the root's width, where the column overflows.
        let wide = (atTopAgain?["width"] as? NSNumber)?.doubleValue
        disk.pageCommand?(.open(short))
        let inShort = await eventually { self.disk.openFolder == short }
        let fits = await pageAnswer(web, Self.columnState) { (state: [String: Any]?) in state?["overflows"] as? Bool == false && (state?["rows"] as? Int ?? 0) > 0 }
        let narrow = (fits?["width"] as? NSNumber)?.doubleValue
        disk.pageCommand?(.open(fixture))
        let home = await eventually { self.disk.openFolder == fixture }
        let startsAtTop = kept && opened && scrollTop(atTop) == 0 && scrollTop(downInTall) > 0 && back && scrollTop(atTopAgain) == 0 && home
        let keepsWidth = inShort && wide != nil && wide == narrow && fits?["overflows"] as? Bool == false && atTopAgain?["overflows"] as? Bool == true
        print("side column across folders: scrolled to \(Int(scrollTop(down))) px, then \(Int(scrollTop(afterMap))) px after the map was sent again; "
              + "opening the check's folder \(opened) put it at \(Int(scrollTop(atTop))) px, scrolled there to \(Int(scrollTop(downInTall))) px, then after Back "
              + "\(back) at \(Int(scrollTop(atTopAgain))) px; its width \(wide.map { "\($0)" } ?? "none") overflowing at the root, \(narrow.map { "\($0)" } ?? "none") "
              + "fitting in a short folder \(inShort)")
        return (startsAtTop, keepsWidth, inTall?["unreadable"] as? [String], inTall?["lines"] as? [String])
    }

    /// The column beside the map: the nearest element around Largest files that scrolls, by its computed style.
    private static let findColumn = """
        const scrolls = (element) => ["auto", "scroll"].includes(getComputedStyle(element).overflowY);
        const largest = document.querySelector('[aria-label="Largest files"]');
        let column = largest?.parentElement ?? null;
        while (column && column !== document.body && !scrolls(column)) column = column.parentElement;
        if (column === document.body) column = null;
        """

    /// The column found, and what scrolling it shows: whether it overflows, how many lists in it scroll on their own,
    /// whether Largest files' last row is out of view at the top, its first rows in view once the column is scrolled to
    /// it, its last row in view at the end, and focused from the top, as a keyboard focuses it, and whether any row is
    /// hidden from VoiceOver. Also how many rows Grew since and Wrote the most since have, so the check waits for both.
    private static let sideColumnScrolls = findColumn + """
        const count = (heading) => document.querySelectorAll('[aria-labelledby="' + heading + '"] li').length;
        const found = { grew: count("grew-heading"), writers: count("writers-heading"), rows: largest?.querySelectorAll("li button").length ?? 0 };
        if (!largest || !column) return { ...found, column: false };
        const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
        const rows = [...largest.querySelectorAll("li button")];
        const inView = (element) => {
          const box = element.getBoundingClientRect(), view = column.getBoundingClientRect();
          return box.height > 0 && box.top >= view.top - 0.5 && box.bottom <= view.bottom + 0.5;
        };
        const scrollers = [...column.querySelectorAll("*")].filter((element) => scrolls(element) && element.scrollHeight > element.clientHeight + 1).length;
        column.scrollTop = 0;
        await frame();
        const overflows = column.scrollHeight > column.clientHeight + 1, hiddenAtTop = !inView(rows.at(-1));
        largest.scrollIntoView({ block: "start" });
        await frame();
        const firstShown = rows.slice(0, 3).every(inView);
        column.scrollTop = column.scrollHeight;
        await frame();
        const lastShown = inView(rows.at(-1));
        column.scrollTop = 0;
        await frame();
        rows.at(-1).focus();
        await frame();
        const focused = document.activeElement === rows.at(-1) && inView(rows.at(-1));
        rows.at(-1).blur();
        const spoken = rows.every((row) => row.closest('[aria-hidden="true"], [inert]') === null && row.checkVisibility());
        column.scrollTop = 0;
        return { ...found, column: true, overflows, hiddenAtTop, scrollers, firstShown, lastShown, focused, spoken };
        """

    /// The column's place, whether it overflows, its width for its content, how many rows Largest files has, Couldn't
    /// read's sentences, and the lines of the Largest files row of `path`, when it's given and has one.
    private static let columnState = findColumn + """
        if (!column) return null;
        const wanted = typeof path === "string" ? path : null;
        const row = [...largest.querySelectorAll("li button")].find((button) => button.title === wanted);
        const text = row ? [...row.children].at(-2) : null;
        return { top: column.scrollTop, overflows: column.scrollHeight > column.clientHeight + 1, width: column.clientWidth,
          rows: largest.querySelectorAll("li button").length,
          unreadable: [...document.querySelectorAll('[aria-labelledby="unreadable-heading"] p')].map((p) => p.textContent),
          lines: text ? [...text.children].map((line) => line.textContent) : null };
        """

    /// Scrolls the column to Largest files, or back to its top.
    private static let scrollColumn = findColumn + """
        if (toLargest) largest?.scrollIntoView({ block: "start" });
        else column?.scrollTo({ top: 0 });
        """

    /// Counts the maps Pith gives the page from now on, in `window.pithSmokeColumnMaps`: how many so far.
    private static let countMaps = """
        const kept = window.pithSmokeColumnMaps ?? { receive: window.pithReceive, maps: 0 };
        if (!window.pithSmokeColumnMaps) {
          window.pithSmokeColumnMaps = kept;
          window.pithReceive = (...values) => { kept.maps += 1; return kept.receive(...values); };
        }
        return kept.maps;
        """

    /// The page's own receiver back in its place.
    private static let uncountMaps = """
        const kept = window.pithSmokeColumnMaps;
        if (kept) window.pithReceive = kept.receive;
        delete window.pithSmokeColumnMaps;
        """

    /// The column's sentences under By kind and Wrote the most since, and the latter's heading, Grew since's rows, each
    /// one's lines of text, its figure, and what VoiceOver hears of it, and Largest files' rows' lines, by path.
    private static let sideColumnCopy = """
        const sentences = (heading) => [...document.querySelectorAll('[aria-labelledby="' + heading + '"] p')].map((p) => p.textContent);
        const lines = (button) => [...[...button.children].at(-2).children].map((line) => line.textContent);
        const grew = [...document.querySelectorAll('[aria-labelledby="grew-heading"] li button')].map((button) => {
          const figure = [...button.children].at(-1);
          return { lines: lines(button), figure: figure.textContent, label: button.getAttribute("aria-label") };
        });
        const largest = Object.fromEntries([...document.querySelectorAll('[aria-label="Largest files"] li button')].map((button) => [button.title, lines(button)]));
        return { kinds: sentences("kinds-heading"), writers: sentences("writers-heading"),
          writersHeading: document.getElementById("writers-heading")?.textContent ?? null, grew, largest };
        """

    /// Whether Grew since and Wrote the most since show.
    private static let writersShown = """
        return { grew: document.getElementById("grew-heading") !== null, writers: document.getElementById("writers-heading") !== null };
        """
}
