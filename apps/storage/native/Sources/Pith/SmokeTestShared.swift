import AppKit
import PithCore
import WebKit

/// What the smoke test's checks wait for and drive the app and the map's page with, in each of its files.
extension AppDelegate {
    /// Diagnostic budget: 20 seconds covers startup, scan and WebKit initialization.
    static let patience: TimeInterval = 20

    /// Waits for a checked outcome; a timeout is that check failing, not the whole run.
    func eventually(_ predicate: () -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(Self.patience)
        while !predicate() {
            guard Date() < deadline, (try? await Task.sleep(for: .milliseconds(100))) != nil else { return false }
        }
        return true
    }

    /// Waits for a prerequisite; the run stops, naming what never happened.
    func waitUntil(_ what: String, _ predicate: () -> Bool) async throws {
        guard await eventually(predicate) else { throw DiskFailure("Native UI diagnostic timed out waiting for \(what).") }
    }

    /// Waits for `model`'s live map, the run's own unless another is given, to show a change a check made on the disk,
    /// as `eventually` waits, but with the patience counted only while the live map has no folder waiting to be listed
    /// (`LiveMapPatience`): on a loaded Mac a slow listing's cooldown can hold the fixture's folder past the whole
    /// patience while the map is only behind. A change that never shows still fails the wait, once nothing has waited
    /// for the whole patience, or after `LiveEdits.longestHold` in all, as long as Pith itself holds a change of the
    /// person's for the live map's index to show. A passing wait ends as soon as the change shows, as before.
    func liveMapShows(in model: DiskModel? = nil, _ predicate: () -> Bool) async -> Bool {
        let model = model ?? disk
        var patience = LiveMapPatience(patience: Self.patience, longest: LiveEdits.longestHold, at: Date())
        while !predicate() {
            guard patience.mayGoOn(at: Date(), waiting: Self.hasFoldersWaiting(model.live)),
                  (try? await Task.sleep(for: .milliseconds(100))) != nil else { return false }
        }
        return true
    }

    /// Whether `live` has folders waiting to be listed, as the scanner's last status line counts them, its cooldowns'
    /// included, or is still making or catching up its map: a change on the disk is on its way to the map.
    private static func hasFoldersWaiting(_ live: LiveMap?) -> Bool {
        switch live?.state {
        case .live(let waiting)?: waiting > 0
        case .opening?, .mapping?, .catchingUp?: true
        case .off?, .unmapped?, .failed?, nil: false
        }
    }

    /// What `script` returns in the map's page, given `arguments`, once `done` holds for it or the smoke test's patience
    /// runs out.
    func pageAnswer<Answer>(_ web: WKWebView, _ script: String, arguments: [String: Any] = [:], until done: (Answer?) -> Bool) async -> Answer? {
        let deadline = Date().addingTimeInterval(Self.patience)
        while true {
            let answer = (try? await web.callAsyncJavaScript(script, arguments: arguments, in: nil, contentWorld: .page)) as? Answer
            if done(answer) || Date() >= deadline { return answer }
            try? await Task.sleep(for: .milliseconds(100))
        }
    }

    /// Waits until no map has reached the page for `quiet` seconds, as once the live map has answered every request:
    /// the fixture doesn't change meanwhile, and the live map answers it within milliseconds.
    func mapSettles(quiet: TimeInterval = 0.6) async -> Bool {
        var last = disk.revision, since = Date()
        return await eventually {
            if self.disk.revision != last { last = self.disk.revision; since = Date() }
            return Date().timeIntervalSince(since) >= quiet
        }
    }

    /// A script that drives the map: `body` runs after what every such script needs.
    /// - `canvas`, the map.
    /// - `pause(ms)`, and `until(done, ms)`, which waits up to `ms` (3 s unless given) for `done()` and says if it came.
    /// - `draws`, each time the map drew while the script ran, with the time and what the canvas said it showed.
    /// - `mouse(type, at, detail)`, `click(at, detail)`, and `leave()`, which moves the pointer off the map.
    /// - `boxOf(name)`, the painted box of the open folder's item `name` in the page, found by selecting the item in the
    ///   map's list of items and reading the ring that outlines it once Pith has answered with the selection, or null;
    ///   `blockOf(name)`, that box's middle.
    /// - `card()`, what the hover card says, or nothing when it's closed.
    static func mapScript(_ body: String) -> String {
        """
        const canvas = document.querySelector("canvas");
        const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const until = async (done, ms = 3000) => {
          const end = performance.now() + ms;
          while (!done() && performance.now() < end) await pause(20);
          return done();
        };
        const draws = [];
        const clearRect = CanvasRenderingContext2D.prototype.clearRect;
        CanvasRenderingContext2D.prototype.clearRect = function (...rect) {
          if (this.canvas === canvas) draws.push({ at: performance.now(), label: canvas.getAttribute("aria-label") ?? "" });
          return clearRect.apply(this, rect);
        };
        const mouse = (type, at, detail = 0) => canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window,
          clientX: at.x, clientY: at.y, button: 0, buttons: type === "mousedown" ? 1 : 0, detail }));
        const click = (at, detail) => { mouse("mousedown", at, detail); mouse("mouseup", at, detail); mouse("click", at, detail); };
        const leave = () => canvas.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
        const boxOf = async (name) => {
          const ring = () => canvas.parentElement.querySelector("div.pointer-events-none.absolute");
          const button = [...document.querySelectorAll('[aria-label^="Items in"] button')].find((button) => button.textContent.startsWith(name + " "));
          button?.click();
          // The selection's rings come before any other, once Pith's answer shows the item's row selected.
          if (!button || !(await until(() => button.hasAttribute("data-selected") && ring() !== null))) return null;
          return ring().getBoundingClientRect();
        };
        const blockOf = async (name) => {
          const box = await boxOf(name);
          return box && { x: box.left + box.width / 2, y: box.top + box.height / 2 };
        };
        const card = () => canvas.parentElement.querySelector(".tooltip")?.textContent ?? "";
        try {
        \(body)
        } finally {
          CanvasRenderingContext2D.prototype.clearRect = clearRect;
        }
        """
    }

    /// Presses Command and `key` as AppKit routes a key equivalent: to the window's views first, the map's page among
    /// them when it has the focus, then to the main menu.
    func pressCommand(_ key: String, keyCode: UInt16, in window: NSWindow) {
        guard let event = NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: .command, timestamp: ProcessInfo.processInfo.systemUptime,
                                           windowNumber: window.windowNumber, context: nil, characters: key, charactersIgnoringModifiers: key,
                                           isARepeat: false, keyCode: keyCode) else { return }
        if !window.performKeyEquivalent(with: event) { _ = NSApp.mainMenu?.performKeyEquivalent(with: event) }
    }

    func firstView<T: NSView>(_ type: T.Type, in view: NSView) -> T? {
        if let match = view as? T { return match }
        return view.subviews.lazy.compactMap { self.firstView(type, in: $0) }.first
    }

    /// Writes `mebibytes` of zeros to `path` from another process, as most large files come.
    static func fill(_ path: String, mebibytes: Int) -> Bool {
        let write = Process()
        write.executableURL = URL(fileURLWithPath: "/bin/dd")
        write.arguments = ["if=/dev/zero", "of=\(path)", "bs=1048576", "count=\(mebibytes)"]
        write.standardError = FileHandle.nullDevice
        guard (try? write.run()) != nil else { return false }
        write.waitUntilExit()
        return write.terminationStatus == 0
    }
}
