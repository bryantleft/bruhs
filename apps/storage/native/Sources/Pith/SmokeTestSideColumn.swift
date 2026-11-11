import AppKit
import PithCore
import WebKit

/// The smoke test's checks of the column beside the map: it scrolls as one, its copy says each fact once, and Grew since
/// leads its rows with the items' names.
extension AppDelegate {
    /// The column beside the map is one scroll area, in which every section, Largest files included, takes its natural
    /// height, so each row of each is reachable however long the column gets. The check makes it taller than the window
    /// with 24 files of its own, 1 MiB each, the least the live map lists by name, in a folder of its own, with what grew
    /// and who wrote put in memory, as `checkSideLists` puts them. Then:
    /// - The column overflows, nothing in it scrolls on its own, and Largest files' last row is out of view at the top.
    ///   Scrolled to Largest files, its first rows show; scrolled to the end, its last row does; and from the top, the
    ///   last row focused, as a keyboard focuses it, scrolls into view. No row is hidden from VoiceOver.
    /// - By kind has no sentence under it, and Wrote the most since says only what its heading doesn't: that macOS
    ///   doesn't say which folders the apps wrote to. With Keep a week of history off, held in memory as every setting of
    ///   a smoke run, Pith sends no writers, and the section doesn't show.
    /// - Grew since leads each row with the item's name and the folder it's in on a second line, as Largest files does, the
    ///   growth where Largest files has the size, and VoiceOver hears the three; an item right in the open folder has no
    ///   folder line.
    /// A picture of the window, the column scrolled to Largest files, is saved at `picture`.
    func checkSideColumn(_ fixture: String, picture: URL) async -> [String: Bool] {
        let names = ["side_column_scrolls_as_one", "side_column_says_each_fact_once", "grew_since_rows_lead_with_the_name"]
        let files = FileManager.default, mark = UUID().uuidString.prefix(8).lowercased()
        let tall = (fixture as NSString).appendingPathComponent("pith-smoke-tall-\(mark)")
        let made = (0..<24).map { (tall as NSString).appendingPathComponent("tall-\($0).bin") }
        let kept = (writers: disk.writers, growth: disk.growth, since: disk.growthSince, history: activity.keepsHistory)
        func restore() {
            disk.writers = kept.writers
            if activity.keepsHistory != kept.history { activity.keepsHistory = kept.history }
            disk.smokeTestShowsGrowth(kept.growth, since: kept.since)
        }
        defer {
            restore()
            try? files.removeItem(atPath: tall)
        }
        guard let web = webView, (try? files.createDirectory(atPath: tall, withIntermediateDirectories: false)) != nil,
              made.allSatisfy({ files.createFile(atPath: $0, contents: Data(count: 1 << 20)) }),
              await liveMapShows({ Set(made).isSubset(of: Set(self.disk.result?.topFiles.map(\.path) ?? [])) }), await mapSettles() else {
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
        _ = try? await web.callAsyncJavaScript(Self.scrollColumn, arguments: ["toLargest": false], in: nil, contentWorld: .page)

        let copy = await pageAnswer(web, Self.sideColumnCopy) { (copy: [String: Any]?) in keepGrowth(); return copy != nil }
        let note = ["macOS doesn’t say which folders they wrote to."]
        let said = copy?["kinds"] as? [String] == [] && copy?["writers"] as? [String] == note
        let base = (fixture as NSString).lastPathComponent
        let rows = copy?["grew"] as? [[String: Any]] ?? []
        let deep = rows.first, top = rows.dropFirst().first
        let led = rows.count == 2
            && deep?["lines"] as? [String] == ["deeper", "\(base)/sub"] && deep?["figure"] as? String == "+2.00 MB"
            && deep?["label"] as? String == "deeper, +2.00 MB, in \(base)/sub"
            && top?["lines"] as? [String] == ["other"] && top?["figure"] as? String == "+1.00 MB" && top?["label"] as? String == "other, +1.00 MB"
        print("side column copy: By kind's sentences \(copy?["kinds"] ?? "none"), Wrote the most since's \(copy?["writers"] ?? "none"); Grew since's rows \(rows)")

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
        try? files.removeItem(atPath: tall)
        let gone = await liveMapShows { self.disk.result?.item(at: tall) == nil }
        let settled = await mapSettles()
        return [names[0]: scrolls && gone && settled, names[1]: said && offHides, names[2]: led]
    }

    /// The column beside the map, found as the nearest element around Largest files that scrolls, and what scrolling it
    /// shows: whether it overflows, how many lists in it scroll on their own, whether Largest files' last row is out of
    /// view at the top, its first rows in view once the column is scrolled to it, its last row in view at the end, and
    /// focused from the top, as a keyboard focuses it, and whether any row is hidden from VoiceOver. Also how many rows
    /// Grew since and Wrote the most since have, so the check waits for both.
    private static let sideColumnScrolls = """
        const largest = document.querySelector('[aria-label="Largest files"]');
        const scrolls = (element) => ["auto", "scroll"].includes(getComputedStyle(element).overflowY);
        let column = largest?.parentElement ?? null;
        while (column && column !== document.body && !scrolls(column)) column = column.parentElement;
        const count = (heading) => document.querySelectorAll('[aria-labelledby="' + heading + '"] li').length;
        const found = { grew: count("grew-heading"), writers: count("writers-heading"), rows: largest?.querySelectorAll("li button").length ?? 0 };
        if (!largest || !column || column === document.body) return { ...found, column: false };
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

    /// The column's sentences under By kind and Wrote the most since, and Grew since's rows: each one's lines of text, its
    /// figure, and what VoiceOver hears of it.
    private static let sideColumnCopy = """
        const sentences = (heading) => [...document.querySelectorAll('[aria-labelledby="' + heading + '"] p')].map((p) => p.textContent);
        const grew = [...document.querySelectorAll('[aria-labelledby="grew-heading"] li button')].map((button) => {
          const [text, figure] = [...button.children].slice(-2);
          return { lines: [...text.children].map((line) => line.textContent), figure: figure.textContent, label: button.getAttribute("aria-label") };
        });
        return { kinds: sentences("kinds-heading"), writers: sentences("writers-heading"), grew };
        """

    /// Scrolls the column beside the map to Largest files, or back to its top.
    private static let scrollColumn = """
        const largest = document.querySelector('[aria-label="Largest files"]');
        if (toLargest) largest?.scrollIntoView({ block: "start" });
        else largest?.closest("div.overflow-y-auto")?.scrollTo({ top: 0 });
        """

    /// Whether Grew since and Wrote the most since show.
    private static let writersShown = """
        return { grew: document.getElementById("grew-heading") !== null, writers: document.getElementById("writers-heading") !== null };
        """
}
