import XCTest
import AppKit
import Darwin
import UniformTypeIdentifiers
@testable import PithCore

final class IconKeyTests: XCTestCase {
    func testEachKindSpellsItsKey() {
        XCTAssertEqual(IconKey.type("pdf").string, "type/pdf")
        XCTAssertEqual(IconKey.type("").string, "type/", "a file with no extension")
        XCTAssertEqual(IconKey.place("photos-library").string, "place/photos-library")
        XCTAssertEqual(IconKey.folder.string, "folder")
        XCTAssertEqual(IconKey.group.string, "group")
        XCTAssertEqual(IconKey.symbol("externaldrive").string, "symbol/externaldrive")
        XCTAssertEqual(IconKey.item("/").string, "item/%2F")
        // Slashes are escaped too, so a key stays whole in a URL and WebKit can't resolve `..` out of it on the way.
        XCTAssertEqual(IconKey.item("/Applications/Xcode.app").string, "item/%2FApplications%2FXcode.app")
    }

    func testKeysRoundTripExactly() {
        let paths = [
            "/", "/Users/me/My Folder", "/Volumes/Untitled 1/日本語/naïve résumé.pdf", "/tmp/100% done?#&+=;,@!'()$*[]:.txt",
            "/Users/me/Cafe\u{301}", "/Users/me/Caf\u{e9}", "/a/..b/c../...", "/a/.hidden/~tilde", "/emoji/☕️ 👩🏽‍💻",
        ]
        let keys = paths.map(IconKey.item) + [.type("pdf"), .type("TAR"), .type(""), .type("weird ext%"), .place("documents"), .folder, .group, .symbol("externaldrive")]
        for key in keys {
            let string = key.string
            XCTAssertEqual(IconKey(string: string), key, string)
            XCTAssertEqual(IconKey(string: string)?.string, string, "one spelling: \(string)")
            // Safe to put in a URL's path as it is.
            XCTAssertTrue(string.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || "-._~%/".contains($0)) }, string)
            XCTAssertNotNil(URL(string: "pith://app/icon/1/dark/32/\(string).png"), string)
        }
        // The two spellings of é name one item, and each key keeps its own spelling.
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
            "symbol/", "symbol/a%2Fb", "symbol/a/b", "symbol", "volume", // a symbol with a slash, or none, and a bare kind
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

    /// Encodes PNGs as the store does by default, recording how many and whether any ran on the main thread.
    private final class RecordingEncoder: @unchecked Sendable {
        private let lock = NSLock()
        private var threads: [Bool] = []

        var count: Int { lock.lock(); defer { lock.unlock() }; return threads.count }
        var onMainThread: Bool { lock.lock(); defer { lock.unlock() }; return threads.contains(true) }

        func encode(_ image: CGImage) -> Data? {
            lock.lock(); threads.append(Thread.isMainThread); lock.unlock()
            return RenderedIcon.png(of: image)
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

    /// A drawing turns its thread's materializing of dataless files off, so looking an icon up never downloads a file,
    /// and puts back whatever the thread had once it's done, since the store's threads go on to run other work. Drawn
    /// here on the test's own thread, from each setting a thread can have, the process's own setting untouched.
    func testADrawingPutsItsThreadsDownloadPolicyBack() {
        let materializing = { (scope: Int32) in getiopolicy_np(IOPOL_TYPE_VFS_MATERIALIZE_DATALESS_FILES, scope) }
        let process = materializing(IOPOL_SCOPE_PROCESS), thread = materializing(IOPOL_SCOPE_THREAD)
        defer { setiopolicy_np(IOPOL_TYPE_VFS_MATERIALIZE_DATALESS_FILES, IOPOL_SCOPE_THREAD, thread) }
        for earlier in [IOPOL_MATERIALIZE_DATALESS_FILES_DEFAULT, IOPOL_MATERIALIZE_DATALESS_FILES_ON, IOPOL_MATERIALIZE_DATALESS_FILES_OFF] {
            XCTAssertEqual(setiopolicy_np(IOPOL_TYPE_VFS_MATERIALIZE_DATALESS_FILES, IOPOL_SCOPE_THREAD, earlier), 0, "the thread set to \(earlier)")
            let during = IconStore.withoutDownloads { materializing(IOPOL_SCOPE_THREAD) }
            XCTAssertEqual(during, IOPOL_MATERIALIZE_DATALESS_FILES_OFF, "off while it draws, from \(earlier)")
            XCTAssertEqual(materializing(IOPOL_SCOPE_THREAD), earlier, "back to \(earlier) after")
        }
        XCTAssertEqual(materializing(IOPOL_SCOPE_PROCESS), process, "the process's own setting")
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

    /// A path spelled composed and decomposed is one item on APFS and HFS+, so its two keys are one key: the store draws
    /// and keeps it once, under either spelling. Each key's URL keeps its own spelling.
    func testBothSpellingsOfAPathShareOneDrawing() throws {
        let composed = IconKey.item("/Users/me/Caf\u{e9}"), decomposed = IconKey.item("/Users/me/Cafe\u{301}")
        XCTAssertEqual(composed, decomposed)
        XCTAssertEqual(composed.hashValue, decomposed.hashValue)
        XCTAssertEqual(composed.string, "item/%2FUsers%2Fme%2FCaf%C3%A9")
        XCTAssertEqual(decomposed.string, "item/%2FUsers%2Fme%2FCafe%CC%81")
        XCTAssertEqual(IconKey(string: decomposed.string), composed, "a URL in either spelling reads back as the one key")
        let renderer = RecordingRenderer()
        let store = IconStore(renderer: renderer)
        let drawn = try XCTUnwrap(draw([IconRequest(composed, size: small, appearance: .dark)], in: store).first ?? nil)
        let kept = try XCTUnwrap(store.cachedIcon(for: IconRequest(decomposed, size: small, appearance: .dark)), "kept under the other spelling")
        XCTAssertTrue(kept.image === drawn.image)
        _ = draw([IconRequest(decomposed, size: small, appearance: .dark)], in: store)
        XCTAssertEqual(renderer.recorded.count, 1, "drawn once for both spellings")
    }

    func testAskingAgainWhileAnIconDrawsWaitsForThatDrawing() {
        let renderer = RecordingRenderer(delay: 0.2)
        let store = IconStore(renderer: renderer)
        let request = IconRequest(.item("/Applications"), size: small, appearance: .dark)
        let icons = draw([request, request, request], in: store)
        XCTAssertEqual(renderer.recorded.count, 1)
        XCTAssertEqual(icons.compactMap { $0 }.count, 3)
        XCTAssertEqual(Set(icons.compactMap { $0.map { ObjectIdentifier($0.image) } }).count, 1, "every caller gets the one drawing")
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

    func testAnIconInUseOutlastsOnesUsedLessRecently() throws {
        let renderer = RecordingRenderer()
        let request = { (n: Int) in IconRequest(.type("ext\(n)"), size: IconSize(pixels: 32, scale: 2), appearance: .light) }
        let one = try XCTUnwrap(draw([request(0)], in: IconStore(renderer: renderer)).first ?? nil)
        let store = IconStore(renderer: renderer, budget: 2 * one.bytes + one.bytes / 2)
        _ = draw([request(1)], in: store)
        _ = draw([request(2)], in: store)
        // Showing the first again makes it the most recently used, so the second goes in its place.
        XCTAssertNotNil(store.cachedIcon(for: request(1)))
        _ = draw([request(3)], in: store)
        XCTAssertNil(store.cachedIcon(for: request(2)), "the least recently used went")
        XCTAssertNotNil(store.cachedIcon(for: request(3)))
        XCTAssertNotNil(store.cachedIcon(for: request(1)))
        // Asking for a kept icon with a completion uses it too.
        _ = draw([request(3)], in: store)
        _ = draw([request(4)], in: store)
        XCTAssertNil(store.cachedIcon(for: request(1)))
        XCTAssertNotNil(store.cachedIcon(for: request(3)))
        XCTAssertEqual(renderer.recorded.filter { $0.request == request(3) }.count, 1, "a kept icon isn't drawn again")
    }

    /// Through a run of icons asked for, the store draws exactly those a list of the kept icons, least recently used
    /// first, doesn't hold, and ends keeping what that list keeps.
    func testTheStoreKeepsTheIconsUsedMostRecently() throws {
        let request = { (n: Int) in IconRequest(.type("ext\(n)"), size: IconSize(pixels: 32, scale: 2), appearance: .light) }
        let one = try XCTUnwrap(draw([request(0)], in: IconStore(renderer: RecordingRenderer())).first ?? nil)
        let renderer = RecordingRenderer()
        let store = IconStore(renderer: renderer, budget: 3 * one.bytes + one.bytes / 2)
        var kept: [Int] = [], drawn: [Int] = []
        for n in [1, 2, 3, 1, 4, 4, 2, 5, 1, 6, 6, 3, 2, 1, 7, 1, 8, 2, 9, 9, 1, 3] {
            _ = draw([request(n)], in: store)
            if !kept.contains(n) { drawn.append(n) }
            kept.removeAll { $0 == n }
            kept.append(n)
            if kept.count > 3 { kept.removeFirst() }
        }
        XCTAssertEqual(renderer.recorded.map(\.request), drawn.map(request))
        XCTAssertEqual(Set((1...9).filter { store.cachedIcon(for: request($0)) != nil }), Set(kept))
    }

    func testAnIconComesAsPNGAndAsAnImage() async throws {
        let store = IconStore(renderer: RecordingRenderer())
        let request = IconRequest(.folder, size: small, appearance: .light)
        let drawn = await store.icon(for: request), png = await store.png(for: request)
        let icon = try XCTUnwrap(drawn)
        XCTAssertEqual(icon.image.width, 32)
        let decoded = try XCTUnwrap(NSBitmapImageRep(data: try XCTUnwrap(png)), "the PNG decodes")
        XCTAssertEqual(decoded.pixelsWide, 32)
        XCTAssertEqual(decoded.pixelsHigh, 32)
        XCTAssertEqual(icon.nsImage.size, NSSize(width: 16, height: 16), "an image of the icon's point size")
    }

    /// Native views show an icon's bitmap, so an icon only they ask for is never encoded as PNG: encoding costs about a
    /// tenth of a millisecond an icon, and a PNG kept for nothing would count against the budget.
    func testAnIconOnlyNativeViewsShowIsNeverEncoded() async throws {
        let encoder = RecordingEncoder()
        let store = IconStore(renderer: RecordingRenderer(), encoder: encoder.encode)
        let request = IconRequest(.folder, size: small, appearance: .dark)
        let drawn = await store.icon(for: request)
        let icon = try XCTUnwrap(drawn)
        XCTAssertEqual(icon.nsImage.size, NSSize(width: 16, height: 16))
        XCTAssertEqual(icon.image.width, 32)
        XCTAssertTrue(store.cachedIcon(for: request) === icon)
        XCTAssertEqual(encoder.count, 0, "no PNG for a native view")
        XCTAssertNil(store.cachedPNG(for: request), "none until the page asks for it")
        XCTAssertEqual(icon.bytes, icon.image.bytesPerRow * icon.image.height, "it keeps its bitmap alone")
    }

    /// The page's icon route gets an icon's PNG encoded once, off the main thread, however many of its loads ask at once,
    /// and kept with the drawing.
    @MainActor func testThePageGetsEachPNGEncodedOnceOffTheMainThread() async throws {
        let encoder = RecordingEncoder(), renderer = RecordingRenderer(delay: 0.05)
        let store = IconStore(renderer: renderer, encoder: encoder.encode)
        let request = IconRequest(.folder, size: small, appearance: .dark)
        async let first = store.png(for: request), second = store.png(for: request), third = store.png(for: request)
        let pngs = await [first, second, third]
        let png = try XCTUnwrap(pngs[0])
        XCTAssertEqual(pngs, [png, png, png])
        XCTAssertEqual(renderer.recorded.count, 1)
        XCTAssertEqual(encoder.count, 1, "encoded once")
        XCTAssertFalse(encoder.onMainThread, "never on the caller's thread")
        XCTAssertEqual(store.cachedPNG(for: request), png)
        let again = await store.png(for: request)
        XCTAssertEqual(again, png)
        XCTAssertEqual(encoder.count, 1, "kept with the drawing")
    }

    /// Encodes as the store does by default, after saying it has begun and waiting `delay`, as a slow encoding would.
    private final class SlowEncoder: @unchecked Sendable {
        private let lock = NSLock()
        private let delay: TimeInterval
        private var began = false

        init(delay: TimeInterval) { self.delay = delay }

        var hasBegun: Bool { lock.lock(); defer { lock.unlock() }; return began }

        func encode(_ image: CGImage) -> Data? {
            lock.lock(); began = true; lock.unlock()
            Thread.sleep(forTimeInterval: delay)
            return RenderedIcon.png(of: image)
        }
    }

    /// The main thread asks whether an icon has its PNG for every icon the page loads (`cachedPNG`), so asking never waits
    /// for an encoding under way, however long it takes: it answers nil until the encoding is done.
    @MainActor func testAskingForAPNGNeverWaitsForAnEncodingUnderWay() async throws {
        let encoder = SlowEncoder(delay: 0.5)
        let store = IconStore(renderer: RecordingRenderer(), encoder: encoder.encode)
        let request = IconRequest(.folder, size: small, appearance: .dark)
        _ = await store.icon(for: request)
        let encoding = Task.detached { await store.png(for: request) }
        while !encoder.hasBegun { try await Task.sleep(for: .milliseconds(5)) }
        let start = DispatchTime.now().uptimeNanoseconds
        let read = store.cachedPNG(for: request)
        let waited = TimeInterval(DispatchTime.now().uptimeNanoseconds - start) / 1e9
        XCTAssertNil(read, "not encoded yet")
        XCTAssertLessThan(waited, 0.1, "asking waited \(waited * 1000) ms for the encoding")
        let png = await encoding.value
        XCTAssertNotNil(png)
        XCTAssertEqual(store.cachedPNG(for: request), png)
    }

    /// The store counts a drawing's PNG in its budget once it's encoded, and not before.
    func testAPNGCountsInTheBudgetOnceItsEncoded() async throws {
        let request = { (n: Int) in IconRequest(.type("ext\(n)"), size: IconSize(pixels: 64, scale: 2), appearance: .light) }
        let sample = await IconStore(renderer: RecordingRenderer()).icon(for: request(0))
        let one = try XCTUnwrap(sample)
        let png = try XCTUnwrap(RenderedIcon.png(of: one.image)).count
        // Room for two bitmaps, but not for two bitmaps and a PNG.
        let store = IconStore(renderer: RecordingRenderer(), budget: 2 * one.bitmapBytes + png / 2)
        _ = await store.icon(for: request(1))
        _ = await store.icon(for: request(2))
        XCTAssertNotNil(store.cachedIcon(for: request(1)), "two bitmaps fit")
        XCTAssertNotNil(store.cachedIcon(for: request(2)))
        // The first, used least recently now, gets its PNG, which takes the store past its budget.
        let encoded = await store.png(for: request(1))
        XCTAssertEqual(encoded?.count, png)
        XCTAssertNil(store.cachedIcon(for: request(2)), "the PNG counts, so the drawing used least recently went")
        XCTAssertEqual(store.cachedPNG(for: request(1)), encoded)
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
                             .symbol("externaldrive"), .place("documents")] {
            let drawn = await draw(key, .dark)
            XCTAssertNotNil(drawn, key.string)
        }
        let unknown = await draw(.place("nowhere"), .dark)
        XCTAssertNil(unknown, "a place the table doesn't have has no icon")
    }

    /// A volume macOS guards shows the SF Symbol of an external drive, which macOS draws at runtime, at the size asked
    /// for and in the appearance's secondary text colour (`SystemIconRenderer.symbolColor`), so it reads as a symbol
    /// beside the real icons rather than as any type's icon. Drawn with a colour of the test's own for each appearance,
    /// red in dark and blue in light, what it paints takes the colour of the appearance it's drawn in.
    func testTheDriveSymbolIsDrawnInTheAppearancesSecondaryTextColour() async throws {
        let tint = NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? NSColor(srgbRed: 1, green: 0, blue: 0, alpha: 1) : NSColor(srgbRed: 0, green: 0, blue: 1, alpha: 1)
        }
        let places = KnownPlaces(home: URL(fileURLWithPath: "/Users/tester", isDirectory: true), searchPaths: [:]) { _ in nil }
        let store = IconStore(renderer: SystemIconRenderer(places: places, symbolColor: tint))
        for appearance in IconAppearance.allCases {
            let drawn = await store.icon(for: IconRequest(.drive, size: IconSize(points: 16, scale: 2), appearance: appearance))
            let icon = try XCTUnwrap(drawn, appearance.rawValue)
            XCTAssertEqual([icon.image.width, icon.image.height], [32, 32])
            let bytes = try XCTUnwrap(pixels(icon.image))
            var red = 0, blue = 0
            for pixel in stride(from: 0, to: bytes.count, by: 4) where bytes[pixel + 3] > 128 {
                if bytes[pixel] > bytes[pixel + 2] { red += 1 } else { blue += 1 }
            }
            XCTAssertGreaterThan(red + blue, 40, "\(appearance): the symbol paints")
            XCTAssertEqual(appearance == .dark ? blue : red, 0, "\(appearance): every pixel painted takes the appearance's colour")
        }
        let drive = await draw(.drive, .dark), document = await draw(.type(""), .dark)
        XCTAssertNotEqual(pixels(try XCTUnwrap(drive).image), pixels(try XCTUnwrap(document).image), "not the generic document")
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

    /// Each of the Trash's keys draws one state of macOS's Trash, the same art every time, so the store can keep it by its
    /// key: a full Trash never draws as an empty one, nor the other way round.
    func testEachOfTheTrashsKeysDrawsItsOwnState() async throws {
        let home = FileManager.default.temporaryDirectory.appendingPathComponent("pith-test-home")
        let places = KnownPlaces(home: home, searchPaths: [.trashDirectory: home.appendingPathComponent(".Trash")]) { _ in nil }
        let full = await draw(.place("trash"), .dark, places: places), empty = await draw(.place("trash-empty"), .dark, places: places)
        let fullAgain = await draw(.place("trash"), .dark, places: places), emptyAgain = await draw(.place("trash-empty"), .dark, places: places)
        let drawnFull = try XCTUnwrap(full), drawnEmpty = try XCTUnwrap(empty)
        XCTAssertNotEqual(pixels(drawnFull.image), pixels(drawnEmpty.image), "the full and empty Trash look different")
        XCTAssertEqual(pixels(drawnFull.image), fullAgain.flatMap { pixels($0.image) })
        XCTAssertEqual(pixels(drawnEmpty.image), emptyAgain.flatMap { pixels($0.image) })
    }

    /// `IconAppearance` has no Increase Contrast, since macOS draws the same artwork in the high-contrast appearances as
    /// in the plain ones, through the store's own drawing. A macOS that draws any of this sample otherwise needs the
    /// contrast in the icon's key. It runs where the Swift tests run: here, and in CI's macOS 26 job.
    func testHighContrastDrawsTheSameArtwork() throws {
        let workspace = NSWorkspace.shared
        let sample: [(String, NSImage?)] = [
            ("plain folder", workspace.icon(for: .folder)), ("Documents", UTType("com.apple.documents-folder").map(workspace.icon(for:))),
            ("Finder", workspace.icon(forFile: "/System/Library/CoreServices/Finder.app")),
        ] + ["pdf", "png", "zip"].map { ($0, workspace.icon(for: UTType(filenameExtension: $0, conformingTo: .data) ?? .data)) }
        func pixels(_ image: NSImage, _ appearance: NSAppearance.Name) -> Data? {
            SystemIconRenderer.draw(image, size: size, appearance: appearance, tint: nil)?.dataProvider?.data as Data?
        }
        for (name, icon) in sample {
            let image = try XCTUnwrap(icon, name)
            XCTAssertEqual(pixels(image, .accessibilityHighContrastAqua), pixels(image, .aqua), "\(name) in light")
            XCTAssertEqual(pixels(image, .accessibilityHighContrastDarkAqua), pixels(image, .darkAqua), "\(name) in dark")
        }
        let folder = try XCTUnwrap(sample.first?.1)
        XCTAssertNotEqual(pixels(folder, .aqua), pixels(folder, .darkAqua), "the drawings follow the appearance")
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
