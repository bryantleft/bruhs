import XCTest
import AppKit
import Darwin
@testable import PithCore

final class IconKeyTests: XCTestCase {
    func testEachKindSpellsItsKey() {
        XCTAssertEqual(IconKey.type("pdf").string, "type/pdf")
        XCTAssertEqual(IconKey.type("").string, "type/", "a file with no extension")
        XCTAssertEqual(IconKey.place("photos-library").string, "place/photos-library")
        XCTAssertEqual(IconKey.folder.string, "folder")
        XCTAssertEqual(IconKey.group.string, "group")
        XCTAssertEqual(IconKey.item("/").string, "item/%2F")
        // Slashes are escaped too, so a key stays whole in a URL and WebKit can't resolve `..` out of it on the way.
        XCTAssertEqual(IconKey.item("/Applications/Xcode.app").string, "item/%2FApplications%2FXcode.app")
    }

    func testKeysRoundTripExactly() {
        let paths = [
            "/", "/Users/me/My Folder", "/Volumes/Untitled 1/日本語/naïve résumé.pdf", "/tmp/100% done?#&+=;,@!'()$*[]:.txt",
            "/Users/me/Cafe\u{301}", "/Users/me/Caf\u{e9}", "/a/..b/c../...", "/a/.hidden/~tilde", "/emoji/☕️ 👩🏽‍💻",
        ]
        let keys = paths.map(IconKey.item) + [.type("pdf"), .type("TAR"), .type(""), .type("weird ext%"), .place("documents"), .folder, .group]
        for key in keys {
            let string = key.string
            XCTAssertEqual(IconKey(string: string), key, string)
            XCTAssertEqual(IconKey(string: string)?.string, string, "one spelling: \(string)")
            // Safe to put in a URL's path as it is.
            XCTAssertTrue(string.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || "-._~%/".contains($0)) }, string)
            XCTAssertNotNil(URL(string: "pith://app/icon/1/dark/32/\(string).png"), string)
        }
        // The two spellings of é are different file names, and stay different spellings.
        XCTAssertEqual(IconKey.item("/Users/me/Cafe\u{301}").string, "item/%2FUsers%2Fme%2FCafe%CC%81")
        XCTAssertEqual(IconKey.item("/Users/me/Caf\u{e9}").string, "item/%2FUsers%2Fme%2FCaf%C3%A9")
        XCTAssertEqual(IconKey.item("/Users/me/My Folder").string, "item/%2FUsers%2Fme%2FMy%20Folder")
    }

    func testParsingRefusesPathsThatArentAbsoluteOrClimbOut() {
        let refused = [
            "item/%2FUsers%2F..%2Fetc", // a `..` component
            "item/%2F..", "item/..", "item/%2FUsers%2Fme%2F..",
            "item/%2FUsers%2F%2E%2E%2Fetc", // an escaped `..`
            "item/Users%2Fme", "item/Users", "item/", "item", // not absolute
            "item/%2FUsers%2F.%2Fme", "item/%2FUsers%2F%2Fme", "item/%2FUsers%2F", // `.`, empty and trailing components
            "item/%2FUsers/me", // a bare slash: a key's payload is one escaped piece
            "item/%2Fa%00b", // NUL
        ]
        for string in refused { XCTAssertNil(IconKey(string: string), string) }
    }

    func testParsingRefusesAnythingButTheOneSpelling() {
        let refused = [
            "item/%2Fcaf%c3%a9", // lowercase escapes
            "item/%2Fcaf\u{e9}", "item/%2Fa b", // characters that should be escaped
            "item/%2F%41", "type/p%64f", // needless escapes
            "item/%2F%zz", "item/%2F%", "item/%2F%FF", // broken escapes and bytes that aren't UTF-8
            "type/a%2Fb", "place/", "place/a%2Fb", "place/a/b", // a type or place with a slash, or no place at all
            "thing/x", "folder/", "Folder", "group/x", "", "/", "type", // unknown kinds and stray text
        ]
        for string in refused { XCTAssertNil(IconKey(string: string), string) }
    }
}

final class IconStoreTests: XCTestCase {
    /// Draws a plain square of the size asked, after `delay`, recording how and where each drawing ran.
    private final class RecordingRenderer: IconRenderer, @unchecked Sendable {
        struct Drawing {
            let request: IconRequest
            let onMainThread: Bool
            /// This thread's iCloud download policy while it drew.
            let materializing: Int32
        }

        private let lock = NSLock()
        private let delay: TimeInterval
        private var drawings: [Drawing] = []
        private var running = 0
        private var most = 0

        init(delay: TimeInterval = 0) { self.delay = delay }

        var recorded: [Drawing] { lock.lock(); defer { lock.unlock() }; return drawings }
        var mostAtOnce: Int { lock.lock(); defer { lock.unlock() }; return most }

        func render(_ request: IconRequest) -> CGImage? {
            let drawing = Drawing(request: request, onMainThread: Thread.isMainThread,
                                  materializing: getiopolicy_np(IOPOL_TYPE_VFS_MATERIALIZE_DATALESS_FILES, IOPOL_SCOPE_THREAD))
            lock.lock(); drawings.append(drawing); running += 1; most = max(most, running); lock.unlock()
            if delay > 0 { Thread.sleep(forTimeInterval: delay) }
            lock.lock(); running -= 1; lock.unlock()
            let pixels = request.size.pixels
            guard let space = CGColorSpace(name: CGColorSpace.sRGB),
                  let context = CGContext(data: nil, width: pixels, height: pixels, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
            context.setFillColor(CGColor(srgbRed: 1, green: 0.5, blue: 0, alpha: 1))
            context.fill(CGRect(x: 0, y: 0, width: pixels, height: pixels))
            return context.makeImage()
        }
    }

    /// The store's answers, which arrive on its threads.
    private final class Answers: @unchecked Sendable {
        private let lock = NSLock()
        private var icons: [Int: RenderedIcon] = [:]

        func keep(_ icon: RenderedIcon?, at index: Int) { lock.lock(); icons[index] = icon; lock.unlock() }
        func all(_ count: Int) -> [RenderedIcon?] { lock.lock(); defer { lock.unlock() }; return (0..<count).map { icons[$0] } }
    }

    private let small = IconSize(points: 16, scale: 2)

    /// Asks `store` for each request and waits for every answer.
    private func draw(_ requests: [IconRequest], in store: IconStore, timeout: TimeInterval = 10) -> [RenderedIcon?] {
        let answers = Answers()
        let done = expectation(description: "every icon answered")
        done.expectedFulfillmentCount = max(1, requests.count)
        for (index, request) in requests.enumerated() {
            store.icon(for: request) { icon in
                answers.keep(icon, at: index)
                done.fulfill()
            }
        }
        wait(for: [done], timeout: timeout)
        return answers.all(requests.count)
    }

    func testIconsAskedForOnTheMainThreadAreDrawnOffIt() {
        XCTAssertTrue(Thread.isMainThread, "the test asks from the main thread")
        let renderer = RecordingRenderer()
        let store = IconStore(renderer: renderer)
        let icon = draw([IconRequest(.folder, size: small, appearance: .dark)], in: store).first ?? nil
        XCTAssertNotNil(icon)
        XCTAssertEqual(renderer.recorded.count, 1)
        XCTAssertEqual(renderer.recorded.first?.onMainThread, false, "the store drew on the main thread")
    }

    func testIconThreadsTurnICloudDownloadsOff() {
        let renderer = RecordingRenderer()
        _ = draw([IconRequest(.type("pdf"), size: small, appearance: .light)], in: IconStore(renderer: renderer))
        XCTAssertEqual(renderer.recorded.first?.materializing, IOPOL_MATERIALIZE_DATALESS_FILES_OFF)
    }

    func testEachDrawingIsKeptByKeyAppearanceAndSize() {
        let renderer = RecordingRenderer()
        let store = IconStore(renderer: renderer)
        let first = IconRequest(.folder, size: small, appearance: .light)
        XCTAssertNil(store.cachedIcon(for: first))
        _ = draw([first], in: store)
        XCTAssertNotNil(store.cachedIcon(for: first))
        _ = draw([first], in: store)
        XCTAssertEqual(renderer.recorded.count, 1, "a kept icon isn't drawn again")
        let others = [
            IconRequest(.folder, size: small, appearance: .dark),
            IconRequest(.folder, size: IconSize(points: 32, scale: 1), appearance: .light), // the same pixels, other artwork
            IconRequest(.folder, size: IconSize(points: 32, scale: 2), appearance: .light),
            IconRequest(.group, size: small, appearance: .light),
        ]
        _ = draw(others, in: store)
        XCTAssertEqual(renderer.recorded.count, 5)
        XCTAssertEqual(Set(renderer.recorded.map(\.request)), Set([first] + others))
    }

    func testAskingAgainWhileAnIconDrawsWaitsForThatDrawing() {
        let renderer = RecordingRenderer(delay: 0.2)
        let store = IconStore(renderer: renderer)
        let request = IconRequest(.item("/Applications"), size: small, appearance: .dark)
        let icons = draw([request, request, request], in: store)
        XCTAssertEqual(renderer.recorded.count, 1)
        XCTAssertEqual(icons.compactMap { $0?.png }.count, 3)
        XCTAssertEqual(Set(icons.compactMap { $0?.png }).count, 1, "every caller gets the one drawing")
    }

    func testItDrawsAFewAtATime() {
        XCTAssertTrue((4...8).contains(IconStore.defaultConcurrency), "the queue runs four to eight drawings at once")
        let renderer = RecordingRenderer(delay: 0.05)
        let store = IconStore(renderer: renderer, concurrency: 4)
        let requests = (0..<16).map { IconRequest(.type("ext\($0)"), size: small, appearance: .light) }
        _ = draw(requests, in: store)
        XCTAssertEqual(renderer.recorded.count, 16)
        XCTAssertLessThanOrEqual(renderer.mostAtOnce, 4)
        XCTAssertGreaterThan(renderer.mostAtOnce, 1, "drawings run side by side")
        XCTAssertTrue(renderer.recorded.allSatisfy { !$0.onMainThread })
    }

    func testTheOldestDrawingsGoOnceTheStoreIsFull() throws {
        let renderer = RecordingRenderer()
        let request = { (n: Int) in IconRequest(.type("ext\(n)"), size: IconSize(pixels: 32, scale: 2), appearance: .light) }
        // Room for two of these drawings and no more.
        let one = try XCTUnwrap(draw([request(0)], in: IconStore(renderer: renderer)).first ?? nil)
        let store = IconStore(renderer: renderer, budget: 2 * one.bytes + one.bytes / 2)
        _ = draw([request(1)], in: store)
        _ = draw([request(2)], in: store)
        _ = draw([request(3)], in: store)
        XCTAssertNil(store.cachedIcon(for: request(1)), "the oldest went")
        XCTAssertNotNil(store.cachedIcon(for: request(2)))
        XCTAssertNotNil(store.cachedIcon(for: request(3)))
    }

    func testAnIconComesAsPNGAndAsAnImage() throws {
        let store = IconStore(renderer: RecordingRenderer())
        let icon = try XCTUnwrap(draw([IconRequest(.folder, size: small, appearance: .light)], in: store).first ?? nil)
        XCTAssertEqual(icon.image.width, 32)
        let decoded = try XCTUnwrap(NSBitmapImageRep(data: icon.png), "the PNG decodes")
        XCTAssertEqual(decoded.pixelsWide, 32)
        XCTAssertEqual(decoded.pixelsHigh, 32)
        XCTAssertEqual(icon.nsImage.size, NSSize(width: 16, height: 16), "an image of the icon's point size")
    }

    func testSizesAndAppearances() {
        XCTAssertEqual(IconSize(points: 16, scale: 2), IconSize(pixels: 32, scale: 2))
        XCTAssertEqual(IconSize(points: 16, scale: 2).points, 16)
        XCTAssertEqual(IconSize(pixels: 0, scale: 0), IconSize(pixels: 1, scale: 1))
        XCTAssertEqual(IconSize(pixels: 100_000, scale: 2).pixels, 1024, "a page can't ask for a huge drawing")
        XCTAssertEqual(IconSize(points: .nan, scale: .infinity), IconSize(pixels: 1, scale: 1))
        XCTAssertEqual(IconSize(points: 1e300, scale: 2).pixels, 1024)
        XCTAssertEqual(IconAppearance(NSAppearance(named: .darkAqua)!), .dark)
        XCTAssertEqual(IconAppearance(NSAppearance(named: .aqua)!), .light)
        XCTAssertEqual(IconAppearance(NSAppearance(named: .accessibilityHighContrastDarkAqua)!), .dark)
        XCTAssertEqual(IconAppearance(rawValue: "dark"), .dark, "the appearance's name in an icon's URL")
    }
}

/// macOS's own icons, drawn by the store's real renderer on its own threads.
final class SystemIconTests: XCTestCase {
    private let size = IconSize(points: 16, scale: 2)

    private func draw(_ key: IconKey, _ appearance: IconAppearance, places: KnownPlaces = .current()) async -> RenderedIcon? {
        await IconStore(renderer: SystemIconRenderer(places: places)).icon(for: IconRequest(key, size: size, appearance: appearance))
    }

    private func pixels(_ image: CGImage) -> Data? { image.dataProvider?.data as Data? }

    func testIconsAreDrawnInTheAppearanceAskedFor() async throws {
        let drawnLight = await draw(.folder, .light), drawnDark = await draw(.folder, .dark)
        let light = try XCTUnwrap(drawnLight), dark = try XCTUnwrap(drawnDark)
        XCTAssertEqual(light.image.width, 32)
        XCTAssertEqual(dark.image.width, 32)
        XCTAssertNotEqual(pixels(light.image), pixels(dark.image), "macOS draws a folder differently in light and dark")
    }

    func testEveryKindOfKeyDraws() async {
        for key: IconKey in [.type("pdf"), .type(""), .type("no-such-extension-pith"), .item("/Applications"), .item("/"), .folder, .group,
                             .place("documents")] {
            let drawn = await draw(key, .dark)
            XCTAssertNotNil(drawn, key.string)
        }
        let unknown = await draw(.place("nowhere"), .dark)
        XCTAssertNil(unknown, "a place the table doesn't have has no icon")
    }

    /// A special folder's type, or an app, that this macOS draws as a blank document would show a place as nothing.
    func testEveryPlaceOnThisMacHasAnIconOfItsOwn() async throws {
        let places = KnownPlaces.current()
        let generic = await draw(.type(""), .dark, places: places)
        let document = try XCTUnwrap(generic)
        for place in places.places {
            let drawn = await draw(.place(place.id), .dark, places: places)
            let icon = try XCTUnwrap(drawn, place.id)
            XCTAssertNotEqual(pixels(icon.image), pixels(document.image), "\(place.id) draws as a generic document")
        }
    }

    func testASymbolStandsInWhereMacOSHasNoIcon() async throws {
        let home = FileManager.default.temporaryDirectory.appendingPathComponent("pith-test-home")
        let places = KnownPlaces(home: home, searchPaths: [:]) { _ in nil }
        XCTAssertEqual(places.place(id: "icloud-drive")?.icon, .symbol("icloud"))
        let drawnLight = await draw(.place("icloud-drive"), .light, places: places)
        let drawnDark = await draw(.place("icloud-drive"), .dark, places: places)
        let light = try XCTUnwrap(drawnLight), dark = try XCTUnwrap(drawnDark)
        XCTAssertNotEqual(pixels(light.image), pixels(dark.image), "the symbol takes the appearance's colour")
    }
}
