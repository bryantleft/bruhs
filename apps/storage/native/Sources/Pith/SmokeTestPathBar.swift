import AppKit
import PithCore

/// The smoke test's checks of the path bar over the map: it names the disk as macOS does and opens each folder of
/// its path, its disk menu lists every disk mounted with its icon and free space and retitles them while it's open,
/// and Back and Forward retrace the steps.
extension AppDelegate {
    /// The path bar over the map: its disk reads as the disk's own name, not "/", and its menu lists every disk mounted,
    /// each with its icon from the icon store, then Choose Folder. A folder of the path opens the map there, as clicking
    /// it does, and Back and Forward, typed with the map focused, retrace the steps, each only when there's somewhere to
    /// go.
    func checkPathBar(_ fixture: String, in main: MainWindowController) async -> [String: Bool] {
        let sub = (fixture as NSString).appendingPathComponent("sub")
        // Disk lists the disks off the main thread as it opens.
        let listed = await eventually { !self.disk.choices.isEmpty }
        // The fixture is on the startup disk, which the bar names as macOS does, then each folder down to the map's.
        let path = disk.folderPath
        let named = listed && path?.volume == FolderPath.Volume(path: "/", name: DiskModel.startupDiskName) && path?.folders.last == fixture
        // The path bar draws the disks' icons for the menu ahead of time.
        let appearance = IconAppearance(main.window.effectiveAppearance), scale = main.window.backingScaleFactor
        let drawn = await eventually {
            self.disk.choices.allSatisfy { Icons.store.cachedIcon(for: self.disk.menuIconRequest($0.url.path, appearance: appearance, scale: scale)) != nil }
        }
        // A disk's item reads its name, then its free space: "Macintosh HD", a tab, "Free 49.3 GB".
        let items = disk.diskMenu(appearance: appearance, scale: scale).menu.items
        let disks = items.prefix { !$0.isSeparatorItem }
        let mounted = Self.mountedDiskNames()
        let startup = disks.first { $0.title.hasPrefix(DiskModel.startupDiskName + "\tFree ") }
        let menu = drawn && !mounted.isEmpty && mounted.allSatisfy { name in disks.contains { $0.title == name || $0.title.hasPrefix(name + "\t") } }
            && disks.allSatisfy { $0.image != nil } && startup?.state == .on
            && items.count == disks.count + 2 && items.last?.title == "Choose Folder…" && items.last?.keyEquivalent == "o"
        print("path bar \(path?.volume.name ?? "none") then \(path?.folders.count ?? 0) folders; disk menu \(disks.map { $0.title }) for \(mounted.sorted())")
        // A disk icon the store doesn't have is drawn for the menu and shows once it's ready: here at 3x, which nothing on
        // a Mac's display asks for.
        let undrawn = disk.diskMenu(appearance: appearance, scale: 3).menu.items.prefix { !$0.isSeparatorItem }
        let missing = undrawn.filter { $0.image == nil }.count
        let arrive = await eventually { undrawn.allSatisfy { $0.image != nil } }
        print("disk menu at 3x: \(missing) of \(undrawn.count) icons missing, then shown \(arrive)")

        // Nothing opened yet, so Back and Forward have nowhere to go.
        let nowhere = goItem("Back")?.isEnabled == false && goItem("Forward")?.isEnabled == false
        // Sub opens in the map; then the folder enclosing it in the path, the fixture's own, opens as its button does.
        disk.pageCommand?(.open(sub))
        let opened = await eventually { self.disk.openFolder == sub && self.disk.folderPath?.folders.last == sub }
        let enclosing = disk.folderPath?.folders.dropLast().last
        if let enclosing { disk.show(enclosing) }
        let up = await eventually { self.disk.openFolder == fixture }
        // ⌘[ goes back to sub and ⌘] forward to the fixture again, typed with the map focused, as after a click on it.
        if let web = webView { main.window.makeFirstResponder(web) }
        let focused = webView.map { (main.window.firstResponder as? NSView)?.isDescendant(of: $0) == true } == true
        let canGoBack = goItem("Back")?.isEnabled == true
        pressCommand("[", keyCode: 33, in: main.window)
        let back = await eventually { self.disk.openFolder == sub }
        let canGoForward = goItem("Forward")?.isEnabled == true
        pressCommand("]", keyCode: 30, in: main.window)
        let forward = await eventually { self.disk.openFolder == fixture }
        let end = goItem("Forward")?.isEnabled == false && goItem("Back")?.isEnabled == true
        print("path bar opened \(opened), then \(enclosing ?? "nothing") \(up); nowhere \(nowhere), focused \(focused), back \(canGoBack) \(back), forward \(canGoForward) \(forward), then \(end)")
        return ["path_bar_names_the_disk": named, "disk_menu_lists_disks": menu, "disk_menu_draws_missing_icons": missing > 0 && arrive,
                "path_bar_opens_a_folder": opened && enclosing == fixture && up,
                "go_back_and_forward": nowhere && focused && canGoBack && back && canGoForward && forward && end]
    }

    /// The disk menu retitles its disks in place while it's open. The path bar's disk part is clicked as the person
    /// clicks it, through the app's event queue, and while the menu tracks, a listing of the volumes lands with figures of
    /// the smoke test's own, 7 GB more free on the first disk, as one begun as it opened does. A timer in the run loop's
    /// common modes, which run while a menu tracks, though the main queue may not, reads the open menu's first item and
    /// closes the menu once it shows them, or once the smoke test's patience runs out. The real listing comes back after.
    func checkDiskMenuRetitlesWhileOpen(in main: MainWindowController) async -> [String: Bool] {
        let name = "disk_menu_retitles_while_open"
        guard let volume = disk.choices.first, let available = volume.available, let content = main.window.contentView,
              let anchor = firstView(DiskMenuAnchor.self, in: content) else { return [name: false] }
        let fresher = available + 7_000_000_000
        let fresh = DiskVolumeChoice(url: volume.url, name: volume.name, total: volume.total, available: fresher, isStartup: volume.isStartup)
        let expected = volume.name + "\tFree " + bytes(fresher)
        let watch = OpenMenuWatch(until: Date().addingTimeInterval(Self.patience))
        let center = NotificationCenter.default
        // Posted as the menu begins and ends tracking, on the main thread, while it tracks.
        let began = center.addObserver(forName: NSMenu.didBeginTrackingNotification, object: nil, queue: nil) { [weak self] note in
            let sender = (note.object as AnyObject?).map(ObjectIdentifier.init)
            MainActor.assumeIsolated {
                guard let self, let menu = anchor.opened?.menu, sender == ObjectIdentifier(menu), watch.menu == nil else { return }
                watch.menu = menu
                watch.item = menu.items.first
                watch.opened = menu.items.first?.title
                self.disk.smokeTestListsVolumes([fresh] + self.disk.choices.dropFirst())
                self.disk.refreshChoices()
            }
        }
        let ended = center.addObserver(forName: NSMenu.didEndTrackingNotification, object: nil, queue: nil) { note in
            let sender = (note.object as AnyObject?).map(ObjectIdentifier.init)
            MainActor.assumeIsolated { if let menu = watch.menu, sender == ObjectIdentifier(menu) { watch.closed = true } }
        }
        let reader = Timer(timeInterval: 0.05, repeats: true) { _ in
            MainActor.assumeIsolated {
                guard let menu = watch.menu, !watch.closed else { return }
                if let item = menu.items.first, item === watch.item, item.title == expected { watch.retitled = true }
                if watch.retitled || Date() > watch.until { menu.cancelTracking() }
            }
        }
        RunLoop.main.add(reader, forMode: .common)
        defer {
            reader.invalidate()
            center.removeObserver(began)
            center.removeObserver(ended)
            disk.smokeTestListsVolumes(nil)
        }
        let key = await eventually { main.window.isKeyWindow }
        Self.clickThroughTheQueue(at: anchor.convert(NSPoint(x: anchor.bounds.midX, y: anchor.bounds.midY), to: nil), in: main.window)
        let closed = await eventually { watch.closed }
        disk.smokeTestListsVolumes(nil)
        disk.refreshChoices()
        let back = await eventually { self.disk.choices.first?.available != fresher }
        let opened = watch.opened.map { $0.hasPrefix(volume.name + "\tFree ") && $0 != expected } == true
        print("disk menu: the window key \(key); opened from the path bar \(watch.menu != nil), first saying \((watch.opened ?? "nothing").replacingOccurrences(of: "\t", with: " ")); "
              + "retitled while open \(watch.retitled), then closed \(closed); the real listing back \(back)")
        return [name: key && opened && watch.retitled && closed && back]
    }

    /// A click at `point` in `window` as the person's comes: its press and release wait in the app's event queue, so
    /// AppKit hands them out from its run loop, as it does a click, not from the task that makes them.
    private static func clickThroughTheQueue(at point: NSPoint, in window: NSWindow) {
        for type in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
            guard let event = NSEvent.mouseEvent(with: type, location: point, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,
                                                 windowNumber: window.windowNumber, context: nil, eventNumber: 0, clickCount: 1,
                                                 pressure: type == .leftMouseDown ? 1 : 0) else { return }
            NSApp.postEvent(event, atStart: false)
        }
    }

    /// The names of the disks mounted now that Finder's sidebar shows, as macOS gives them to this check.
    private static func mountedDiskNames() -> Set<String> {
        let keys: Set<URLResourceKey> = [.volumeLocalizedNameKey, .volumeIsBrowsableKey]
        let volumes = FileManager.default.mountedVolumeURLs(includingResourceValuesForKeys: Array(keys), options: [.skipHiddenVolumes]) ?? []
        return Set(volumes.compactMap { url in
            guard let values = try? url.resourceValues(forKeys: keys), values.volumeIsBrowsable != false else { return nil }
            return values.volumeLocalizedName
        })
    }

    /// The Go menu's item titled `title`, enabled as the menu bar shows it now.
    private func goItem(_ title: String) -> NSMenuItem? {
        let go = NSApp.mainMenu?.item(withTitle: "Go")?.submenu
        go?.update()
        return go?.item(withTitle: title)
    }
}

/// What the smoke test sees of the disk menu it opens, from a notification and a timer that run while the menu tracks.
@MainActor private final class OpenMenuWatch {
    /// The menu, once it began tracking, and its first item then, with the title it had.
    var menu: NSMenu?
    var item: NSMenuItem?
    var opened: String?
    /// The first item showed the fresher figures while the menu tracked.
    var retitled = false
    var closed = false
    /// When the timer closes the menu, retitled or not.
    let until: Date

    init(until: Date) { self.until = until }
}
