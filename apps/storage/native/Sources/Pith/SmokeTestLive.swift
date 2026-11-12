import AppKit
import PithCore
import WebKit

/// The smoke test's checks of the live map: it holds still under the pointer, answers the person's own actions at
/// once, follows changes on the disk by itself, and reopens on the index it saved, without walking again.
extension AppDelegate {
    /// Check Again is the person's own action: the live map lists the folder again, everything in it, and once that has
    /// landed, its map comes at once, though nothing in the fixture changed, and goes to the page marked to show at once,
    /// as Refresh's does, though the pointer would hold the map still.
    func checkCheckAgainShowsAtOnce(_ fixture: String) async -> [String: Bool] {
        let name = "check_again_shows_at_once"
        guard disk.liveView == fixture, await mapSettles() else { return [name: false] }
        let shown = disk.liveMapsShown
        let maps = MapsGoingOut(disk)
        let asked = Date()
        disk.checkAgain(fixture)
        let came = await eventually { maps.answering.contains(true) && self.disk.liveMapsShown > shown }
        let took = Date().timeIntervalSince(asked)
        print("check again: a map answering the person came \(came) after \(String(format: "%.2f", took)) s; whether each map since did: \(maps.answering)")
        maps.stop()
        let settled = await mapSettles()
        return [name: came && took < 2 && settled]
    }

    /// A live map looks whether Pith still has Full Disk Access only while another app is in front. The access changes
    /// only by the person's hand, in System Settings or a terminal, which take Pith out of the front, and Pith looks again
    /// as it becomes active. The check says itself whether Pith is in front, so it needs no other app, and brings a map of
    /// the live one with Check Again each way: with Pith in front the map looks for nothing, and with another app in front
    /// it looks.
    func checkLiveMapsProbeOnlyBehind(_ fixture: String) async -> [String: Bool] {
        let name = "live_map_probes_access_only_in_the_background"
        guard disk.liveView == fixture, await mapSettles() else { return [name: false] }
        let active = disk.pithIsActive
        defer { disk.pithIsActive = active }
        /// Whether a map of the live one came after Check Again, and how many times the maps looked meanwhile.
        func checkedAgain() async -> (came: Bool, looks: Int) {
            let shown = disk.liveMapsShown, looks = disk.liveMapProbes
            disk.checkAgain(fixture)
            let came = await eventually { self.disk.liveMapsShown > shown }
            _ = await mapSettles()
            return (came, disk.liveMapProbes - looks)
        }
        disk.pithIsActive = { true }
        let inFront = await checkedAgain()
        disk.pithIsActive = { false }
        let behind = await checkedAgain()
        print("access probe with live maps: with Pith in front a map came \(inFront.came) and looked \(inFront.looks) times; with another app in "
              + "front a map came \(behind.came) and looked \(behind.looks) times")
        return [name: inFront.came && inFront.looks == 0 && behind.came && behind.looks > 0]
    }

    /// The live map holds still. A double-click opens the folder its first click was aimed at, though a newer map
    /// arrives between its clicks and puts another folder there. The check makes two folders of its own in the
    /// fixture, so it needs nothing else of it, and both maps from the live one: in the first, the aimed-at folder is
    /// as big as everything else, so it has a large block; in the newer one it's a byte and the other folder a
    /// thousand times everything else, so that one covers the map. The page holds what it showed while a second click
    /// can still come and the hover card is open, and draws nothing meanwhile. As a control, the newer map shown before
    /// the clicks sends the same double-click into the other folder. Then, with the folders gone, a map sent again, or
    /// with a file a byte bigger, draws nothing either, while one that changes visibly draws.
    func checkMapHoldsStill(_ fixture: String) async -> [String: Bool] {
        let names = ["double_click_opens_the_folder_clicked", "map_draws_nothing_when_nothing_shows"]
        let files = FileManager.default, mark = UUID().uuidString
        let aimed = (fixture as NSString).appendingPathComponent("pith-smoke-aimed-\(mark)")
        let covering = (fixture as NSString).appendingPathComponent("pith-smoke-covering-\(mark)")
        let folders = [aimed, covering]
        func listed(_ path: String) -> Bool { disk.result?.root.children?.contains { $0.path == path } == true }
        defer { for folder in folders { try? files.removeItem(atPath: folder) } }
        // A folder needs something in it for the map to list it.
        let made = folders.allSatisfy { folder in
            (try? files.createDirectory(atPath: folder, withIntermediateDirectories: false)) != nil
                && files.createFile(atPath: (folder as NSString).appendingPathComponent("item.bin"), contents: Data(count: 4096))
        }
        guard let web = webView, made, await liveMapShows({ folders.allSatisfy(listed) }), disk.openFolder == fixture, await mapSettles(),
              let payload = disk.resultJSON else {
            return Dictionary(uniqueKeysWithValues: names.map { ($0, false) })
        }
        // Each run starts once the live map has answered for the folder opened last, whose map would replace the ones
        // the run sends.
        func doubleClick(between: Bool, at point: Any = NSNull()) async -> [String: Any]? {
            guard await mapSettles() else { return nil }
            return try? await web.callAsyncJavaScript(Self.doubleClickAcross, arguments: ["payload": payload, "aimed": aimed, "covering": covering,
                                                                                    "between": between, "point": point], in: nil, contentWorld: .page) as? [String: Any]
        }
        let held = await doubleClick(between: true)
        let openedAimed = await eventually { self.disk.openFolder == aimed }
        disk.pageCommand?(.open(fixture))
        let backFromAimed = await eventually { self.disk.openFolder == fixture }
        let point = held?["point"] as? [String: Double]
        var control: [String: Any]?
        if let point { control = await doubleClick(between: false, at: point) }
        let openedCovering = await eventually { self.disk.openFolder == covering }
        let landed = disk.openFolder ?? "nowhere"
        disk.pageCommand?(.open(fixture))
        let backFromCovering = await eventually { self.disk.openFolder == fixture }
        let heldDraws = held?["drawnBetween"] as? Int, controlDraws = control?["drawnBefore"] as? Int
        print("double-click at \(point.map { "\($0)" } ?? "no point") across a newer map: drew \(heldDraws ?? -1) times between the clicks, "
              + "opened the folder aimed at \(openedAimed); with that map shown before the clicks it drew \(controlDraws ?? -1) times and opened "
              + "\((landed as NSString).lastPathComponent)")

        for folder in folders { try? files.removeItem(atPath: folder) }
        let gone = await liveMapShows { !folders.contains(where: listed) }
        var draws: [String: Int]?
        if gone, await mapSettles(), let pristine = disk.resultJSON {
            draws = try? await web.callAsyncJavaScript(Self.unchangedMaps, arguments: ["payload": pristine], in: nil, contentWorld: .page) as? [String: Int]
        }
        // The live map's own map again, for whatever comes next.
        disk.revision = UUID()
        print("draws for the same map \(draws?["same"] ?? -1), a file a byte bigger \(draws?["byte"] ?? -1), visibly changed \(draws?["visible"] ?? -1)")
        return [names[0]: heldDraws == 0 && openedAimed && backFromAimed && (controlDraws ?? 0) > 0 && openedCovering && backFromCovering,
                names[1]: gone && draws?["same"] == 0 && draws?["byte"] == 0 && (draws?["visible"] ?? 0) > 0]
    }

    /// The person's own changes show at once, though the pointer rests on the map and holds a newer map from the live
    /// map still: Command-Delete takes the block under the pointer off the map, and Undo puts it back. The item is a
    /// file of the check's own. Move to Trash puts it in the run's own folder, as it does in any automated run, never
    /// in the person's Trash, and Undo moves it back from there.
    func checkOwnChangesShowAtOnce(_ fixture: String) async -> [String: Bool] {
        let names = ["trash_leaves_the_map_at_once", "undo_returns_to_the_map_at_once"]
        let files = FileManager.default
        // Short enough for the hover card to name it whole.
        let name = "pith-\(UUID().uuidString.prefix(8).lowercased()).bin"
        let item = (fixture as NSString).appendingPathComponent(name)
        var inTrash: URL?
        func listed() -> Bool { disk.result?.root.children?.contains { $0.path == item } == true }
        defer {
            try? files.removeItem(atPath: item)
            if let inTrash { try? files.removeItem(at: inTrash) }
            disk.dismissTrashNote()
        }
        // 1 MiB, the least the live map lists by name (`BIG_FILE`), so the item has a block of its own.
        guard files.createFile(atPath: item, contents: Data(count: 1 << 20)), let web = webView, await liveMapShows(listed), await mapSettles(),
              let payload = disk.resultJSON else {
            return Dictionary(uniqueKeysWithValues: names.map { ($0, false) })
        }
        let trash = try? await web.callAsyncJavaScript(Self.trashUnderPointer, arguments: ["payload": payload, "name": name], in: nil,
                                                       contentWorld: .page) as? [String: Any]
        inTrash = disk.trashed?.moves.first?.trashed
        // Into the run's own folder, not the person's Trash.
        let own = disk.trashFolder.map { folder in inTrash?.path.hasPrefix(folder.path + "/") == true } ?? false
        let after = trash?["after"] as? Double
        let left = trash?["named"] as? Bool == true && trash?["waited"] as? Bool == true && trash?["left"] as? Bool == true
            && (after ?? .infinity) < 1000 && own && !files.fileExists(atPath: item)
        print("Command-Delete under the pointer: the card named the item \(trash?["named"] as? Bool == true), a newer map waited "
              + "\(trash?["waited"] as? Bool == true), the item went to the run's own folder \(own), and its block left "
              + "\(after.map { "\(Int($0)) ms" } ?? "never") after the key")

        // Undo as the Edit menu does it, through the undo manager the move registered with.
        let undo = web.window?.undoManager
        let action = undo?.undoActionName ?? ""
        var back = false
        if let at = trash?["at"] {
            let rest = try? await web.callAsyncJavaScript(Self.restAgain, arguments: ["payload": payload, "name": name, "at": at], in: nil,
                                                          contentWorld: .page) as? [String: Any]
            undo?.undo()
            let named = try? await web.callAsyncJavaScript(Self.cardNames, arguments: ["name": name], in: nil, contentWorld: .page) as? [String: Any]
            let restored = await eventually { files.fileExists(atPath: item) }
            if restored { inTrash = nil }
            let took = named?["after"] as? Double
            back = action == "Move to Trash" && rest?["resting"] as? Bool == true && rest?["waited"] as? Bool == true
                && named?["named"] as? Bool == true && (took ?? .infinity) < 1000 && restored
            print("Undo (\(action)) with the pointer resting \(rest?["resting"] as? Bool == true) and a newer map waiting "
                  + "\(rest?["waited"] as? Bool == true): the item came back \(restored), its block under the pointer \(took.map { "\(Int($0)) ms" } ?? "never") after")
        }
        try? files.removeItem(atPath: item)
        let gone = await liveMapShows { !listed() }
        let settled = await mapSettles()
        // The live map's own map again, for whatever comes next.
        disk.revision = UUID()
        return [names[0]: left, names[1]: back && gone && settled]
    }

    /// A folder opened with a double-click shows its finer tree at once, though the pointer stays on the map. The live
    /// map lists a folder's small parts one by one only in the open folder's finer tree: the coarser tree of the map
    /// around it folds together what's under a 20,000th of the map, and at least 4 KiB. So the check makes a folder of
    /// its own, with a 2 MiB file and six parts of 4 KiB, and 100 MiB beside it, which takes the map's threshold past
    /// 4 KiB.
    func checkOpenedFolderDetail(_ fixture: String) async -> [String: Bool] {
        let check = "opened_folder_shows_its_detail_at_once"
        let files = FileManager.default, mark = UUID().uuidString.prefix(8).lowercased()
        let heavy = (fixture as NSString).appendingPathComponent("pith-heavy-\(mark)")
        let folder = (fixture as NSString).appendingPathComponent("pith-parts-\(mark)")
        let parts = 6
        func listed(_ path: String) -> Bool { disk.result?.root.children?.contains { $0.path == path } == true }
        defer { for made in [heavy, folder] { try? files.removeItem(atPath: made) } }
        var made = (try? files.createDirectory(atPath: heavy, withIntermediateDirectories: false)) != nil
            && (try? files.createDirectory(atPath: folder, withIntermediateDirectories: false)) != nil
            && files.createFile(atPath: (folder as NSString).appendingPathComponent("big.bin"), contents: Data(count: 2 << 20))
        for part in 1...parts where made {
            let path = (folder as NSString).appendingPathComponent("part-\(part)")
            made = (try? files.createDirectory(atPath: path, withIntermediateDirectories: false)) != nil
                && files.createFile(atPath: (path as NSString).appendingPathComponent("item.bin"), contents: Data(count: 4096))
        }
        if made { made = Self.fill((heavy as NSString).appendingPathComponent("fill.bin"), mebibytes: 100) }
        // The map around the folder has its 2 MiB file and a group of the parts.
        func folded() -> Bool { disk.result?.item(at: folder)?.children?.count == 2 }
        guard made, let web = webView, await liveMapShows({ listed(heavy) && folded() }), await mapSettles() else { return [check: false] }
        let answer = try? await web.callAsyncJavaScript(Self.openAndWatch, arguments: ["name": (folder as NSString).lastPathComponent, "path": folder,
                                                                                     "items": parts + 1], in: nil, contentWorld: .page) as? [String: Any]
        let opened = await eventually { self.disk.openFolder == folder }
        disk.pageCommand?(.open(fixture))
        let back = await eventually { self.disk.openFolder == fixture }
        for made in [heavy, folder] { try? files.removeItem(atPath: made) }
        let gone = await liveMapShows { !listed(heavy) && !listed(folder) }
        let settled = await mapSettles()
        let coarse = answer?["coarse"] as? Bool == true, received = answer?["received"] as? Double, drawn = answer?["drawn"] as? Double
        print("double-click opened the folder \(opened) and drew it at once \(coarse); its finer tree came "
              + "\(received.map { "\(Int($0)) ms" } ?? "never") after, and drew \(drawn.map { "\(Int($0)) ms" } ?? "never") after that")
        return [check: opened && coarse && (received ?? .infinity) < 1500 && (drawn ?? .infinity) < 250 && back && gone && settled]
    }

    /// Double-clicks the map with the newer map, in which `aimed` is a byte and `covering` a thousand times everything
    /// else, arriving between the clicks, or shown before them. Between the clicks, the first map, with `aimed` as big
    /// as everything else, shows first, and the click is at the middle of `aimed`'s block; before them, the click is at
    /// `point`. Returns that point, and how often the map drew once the map before the clicks showed and between the
    /// clicks, or null when the page didn't take a map.
    private static let doubleClickAcross = mapScript("""
        // The live map with the given folders at the given sizes, everything in each alike.
        const mapWith = (sizes) => {
          const map = JSON.parse(payload);
          for (const child of map.root.children) {
            const bytes = sizes[child.path];
            if (bytes === undefined) continue;
            const factor = child.size > 0 ? bytes / child.size : 0;
            const scale = (node) => {
              node.size = Math.max(1, Math.round(node.size * factor));
              for (const inner of node.children ?? []) scale(inner);
            };
            scale(child);
            child.size = bytes;
          }
          map.root.size = map.root.children.reduce((sum, child) => sum + child.size, 0);
          return JSON.stringify(map);
        };
        const rest = JSON.parse(payload).root.size;
        const first = mapWith({ [aimed]: rest, [covering]: Math.round(rest / 2) });
        const newer = mapWith({ [aimed]: 1, [covering]: rest * 1000 });
        // Shows `map` once the page has it, and has drawn it when `drawn` is true.
        const show = async (map, drawn) => {
          const label = canvas.getAttribute("aria-label"), before = draws.length;
          window.pithReceive(map);
          const taken = await until(() => canvas.getAttribute("aria-label") !== label && (!drawn || draws.length > before));
          await pause(250);
          return taken;
        };
        leave();
        await pause(100);
        let at = point;
        if (between) {
          if (!(await show(first, true))) return null;
          at = await blockOf(aimed.slice(aimed.lastIndexOf("/") + 1));
          if (!at) return null;
        } else if (!(await show(newer, true))) {
          return null;
        }
        const drawnBefore = draws.length;
        mouse("mousemove", at);
        await pause(100);
        click(at, 1);
        if (between && !(await show(newer, false))) return null;
        const drawnBetween = draws.length - drawnBefore;
        click(at, 2);
        mouse("dblclick", at, 2);
        leave();
        return { point: at, drawnBefore, drawnBetween };
        """)

    /// How often the map draws, with nothing holding it, for the live map sent again, with its first file a byte bigger,
    /// and with that file four times the size, each folder holding it growing with it.
    private static let unchangedMaps = mapScript("""
        leave();
        await pause(100);
        const send = async (map) => {
          const before = draws.length;
          window.pithReceive(JSON.stringify(map));
          await pause(300);
          return draws.length - before;
        };
        // The first file the map lists, and the folders down to it.
        const fileIn = (node) => {
          if (node.kind === "file") return [node];
          for (const child of node.children ?? []) {
            const found = fileIn(child);
            if (found) return [node, ...found];
          }
          return null;
        };
        const grown = (bytes) => {
          const map = JSON.parse(payload);
          const chain = fileIn(map.root) ?? [];
          const by = bytes(chain.at(-1).size);
          for (const node of chain) node.size += by;
          return map;
        };
        if (fileIn(JSON.parse(payload).root) === null) return null;
        const same = await send(JSON.parse(payload));
        const byte = await send(grown(() => 1));
        const visible = await send(grown((size) => 3 * size));
        return { same, byte, visible };
        """)

    /// Rests the pointer on the block of the open folder's item `name` and clicks it, then sends a newer map with the
    /// item four times its size, which must wait, and presses Command-Delete on the map, which moves the item to the
    /// Trash. Says where the block was, whether the card named it, whether the newer map waited, and whether, and how
    /// many milliseconds after the key, the map drew without the item's block under the pointer.
    private static let trashUnderPointer = mapScript("""
        const at = await blockOf(name);
        if (!at) return null;
        leave();
        await pause(100);
        mouse("mousemove", at);
        await pause(100);
        const named = card().includes(name);
        click(at, 1);
        await pause(100);
        const newer = JSON.parse(payload);
        const item = newer.root.children.find((child) => child.name === name);
        newer.root.size += 3 * item.size;
        item.size *= 4;
        const before = draws.length;
        window.pithReceive(JSON.stringify(newer));
        await pause(300);
        const waited = draws.length === before && card().includes(name);
        const pressed = performance.now();
        canvas.parentElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", code: "Backspace", metaKey: true, bubbles: true, cancelable: true }));
        const left = await until(() => draws.length > before && !card().includes(name));
        return { at, named, waited, left, after: performance.now() - pressed };
        """)

    /// Rests the pointer at `at` again, on whatever block is there now, which holds the map afresh, then sends a newer
    /// map without the item `name` and with the largest of the rest three times its size, which must wait. Says whether
    /// the card opened and the newer map waited.
    private static let restAgain = mapScript("""
        leave();
        await pause(100);
        mouse("mousemove", at);
        await pause(100);
        const resting = card() !== "";
        const newer = JSON.parse(payload);
        newer.root.children = newer.root.children.filter((child) => child.name !== name);
        const largest = newer.root.children.reduce((most, child) => (child.size > most.size ? child : most));
        largest.size *= 3;
        newer.root.size = newer.root.children.reduce((sum, child) => sum + child.size, 0);
        const before = draws.length;
        window.pithReceive(JSON.stringify(newer));
        await pause(300);
        return { resting, waited: draws.length === before };
        """)

    /// Whether the hover card names `name` within 3 s, and how many milliseconds that took: the card names the block
    /// under the pointer in the map drawn.
    private static let cardNames = mapScript("""
        const start = performance.now();
        const named = await until(() => card().includes(name));
        return { named, after: performance.now() - start };
        """)

    /// Double-clicks the block of the open folder's item `name`, a folder at `path`, with the pointer resting on the map
    /// and staying there, then waits for the canvas to say it shows the folder's finer tree, of `items` items. Says
    /// whether the map drew the folder at once, how many milliseconds after the double-click the page had the finer
    /// tree, and how many after that the map drew it.
    private static let openAndWatch = mapScript("""
        const at = await blockOf(name);
        if (!at) return null;
        const finer = (label) => label.startsWith(`Treemap of ${path},`) && label.includes(` in ${items} items.`);
        let received = null;
        const watch = new MutationObserver(() => {
          if (received === null && finer(canvas.getAttribute("aria-label") ?? "")) received = performance.now();
        });
        watch.observe(canvas, { attributes: true, attributeFilter: ["aria-label"] });
        try {
          leave();
          await pause(100);
          mouse("mousemove", at);
          await pause(100);
          click(at, 1);
          await pause(80);
          click(at, 2);
          const opened = performance.now();
          mouse("dblclick", at, 2);
          // The pointer stays on the map.
          const coarse = () => draws.some((draw) => draw.at >= opened && draw.label.startsWith(`Treemap of ${path},`) && !finer(draw.label));
          if (!(await until(() => received !== null, 5000))) return { coarse: coarse() };
          await until(() => draws.some((draw) => finer(draw.label)));
          const drawn = draws.find((draw) => finer(draw.label));
          return { coarse: coarse(), received: received - opened, drawn: drawn ? drawn.at - received : null };
        } finally {
          watch.disconnect();
        }
        """)

    /// Writes a file in the fixture from another process, as most changes come, then deletes it: the map follows both
    /// by itself.
    func checkLiveFollows(_ model: DiskModel, in fixture: String, prefix: String) async throws -> [String: Bool] {
        let before = model.result?.root.size ?? 0
        let added = URL(fileURLWithPath: fixture).appendingPathComponent("sub/pith-smoke-\(UUID().uuidString).bin")
        defer { try? FileManager.default.removeItem(at: added) }
        let write = Process()
        write.executableURL = URL(fileURLWithPath: "/bin/dd")
        write.arguments = ["if=/dev/zero", "of=\(added.path)", "bs=65536", "count=4"]
        write.standardError = FileHandle.nullDevice
        try write.run()
        write.waitUntilExit()
        let grew = await liveMapShows(in: model) { (model.result?.root.size ?? 0) >= before + 262_144 }
        try FileManager.default.removeItem(at: added)
        let shrank = await liveMapShows(in: model) { model.result?.root.size == before }
        print("\(prefix): before \(before), grew \(grew), back \(shrank) at \(model.result?.root.size ?? 0)")
        return ["\(prefix)_follows_a_new_file": grew, "\(prefix)_follows_a_deletion": shrank]
    }

    /// Quits the live map as Pith's quit does, which saves it, then opens it in a second model as the next launch
    /// would: it must open on the saved map, not walk again, and go on following changes.
    func checkLiveReopens(_ fixture: String, dailyChecks: inout [Bool?]) async throws -> [String: Bool] {
        guard let live = disk.live, let size = disk.result?.root.size else { return ["live_map_reopens": false] }
        final class Flag { var on = false }
        let stopped = Flag()
        live.stop(timeout: .seconds(10)) { stopped.on = true }
        try await waitUntil("the map to be saved") { stopped.on }
        let reopened = DiskModel()
        reopened.scansFolder = disk.scansFolder
        reopened.startLive(root: fixture, keep: true)
        dailyChecks.append(reopened.live?.schedulesDailyCheck)
        reopened.visibilityChanged(true)
        let opens = await eventually { reopened.result?.root.path == fixture }
        let restored = reopened.live?.restored == true && reopened.live?.rebuildReason == nil
        let same = reopened.result?.root.size == size
        print("reopened: opens \(opens), restored \(restored), size \(reopened.result?.root.size ?? 0) against \(size)")
        let follows = try await checkLiveFollows(reopened, in: fixture, prefix: "reopened_map")
        // As Pith's quit stops it: on the main thread, the scanner saving as it exits.
        let quitting = Date()
        reopened.live?.stopNow(timeout: 5)
        let quit = Date().timeIntervalSince(quitting)
        print("the reopened map stopped as at quit in \(String(format: "%.2f", quit)) s")
        return ["live_map_reopens_without_walking": opens && restored, "live_map_reopens_the_same": same, "live_map_stops_at_quit": quit < 5]
            .merging(follows) { _, new in new }
    }
}

/// The maps that go out to the page from now on, each as it does: whether it answers the person's own action
/// (`DiskModel.mapAnswersPerson`), which the page then shows at once.
@MainActor private final class MapsGoingOut {
    private(set) var answering: [Bool] = []
    private let disk: DiskModel
    private var watching = true

    init(_ disk: DiskModel) {
        self.disk = disk
        watch()
    }

    func stop() { watching = false }

    private func watch() {
        withObservationTracking { _ = disk.revision } onChange: { [weak self] in
            MainActor.assumeIsolated {
                guard let self, self.watching else { return }
                // In the turn the revision changes, before the page has taken the mark back.
                self.answering.append(self.disk.mapAnswersPerson)
                Task { @MainActor [weak self] in self?.watch() }
            }
        }
    }
}
