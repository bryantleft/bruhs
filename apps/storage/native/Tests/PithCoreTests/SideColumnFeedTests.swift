import XCTest
@testable import PithCore

/// What native feeds the disk map's side column beside each map: the Places section's table, on the live map alone, and
/// the apps that own the folders the map couldn't read, which LaunchServices finds off the main thread.
final class SideColumnFeedTests: XCTestCase {
    /// A home folder at a made-up path: the feed only compares paths, so nothing here exists or is looked at.
    private let home = URL(fileURLWithPath: "/Users/tester", isDirectory: true)

    private func path(_ relative: String) -> String { home.appendingPathComponent(relative).path }

    /// The test home's places, with Xcode the only app of a place that this Mac has.
    private var places: KnownPlaces {
        KnownPlaces(home: home, searchPaths: [.downloadsDirectory: home.appendingPathComponent("Downloads")]) {
            $0 == "com.apple.dt.Xcode" ? URL(fileURLWithPath: "/Test Apps/Xcode.app") : nil
        }
    }

    /// LaunchServices as the test has it: the apps in `found`, by bundle ID. It notes each bundle ID it's asked for and
    /// whether it was asked on the main thread.
    private final class Apps: @unchecked Sendable {
        private let lock = NSLock()
        private let found: [String: String]
        private var asked: [String] = []
        private var onMain = false
        init(_ found: [String: String]) { self.found = found }

        func lookUp(_ bundleID: String) -> URL? {
            lock.lock(); defer { lock.unlock() }
            asked.append(bundleID)
            onMain = onMain || Thread.isMainThread
            return found[bundleID].map { URL(fileURLWithPath: $0) }
        }

        var askedFor: [String] { lock.lock(); defer { lock.unlock() }; return asked }
        var askedOnMain: Bool { lock.lock(); defer { lock.unlock() }; return onMain }
    }

    @MainActor private func feed(_ apps: Apps, policy: IconPolicy? = nil) -> (SideColumnFeed, IconPolicy) {
        let policy = policy ?? IconPolicy(places: places)
        return (SideColumnFeed(places: places, policy: policy) { apps.lookUp($0) }, policy)
    }

    private func folder(_ relative: String, size: UInt64, _ children: [DiskNode] = []) -> DiskNode {
        DiskNode(kind: .dir, name: (relative as NSString).lastPathComponent, path: path(relative), size: size, files: 1, children: children)
    }

    private func locked(_ relative: String) -> DiskNode {
        DiskNode(kind: .unreadable, name: (relative as NSString).lastPathComponent, path: path(relative), size: 0, reason: .protected, children: nil)
    }

    /// A map of the test home: Developer and Downloads, with Notes' container data, Xcode's devices and Mail unreadable.
    private func map(errors: UInt64 = 3) -> DiskResult {
        let tree = DiskNode(kind: .dir, name: "tester", path: home.path, size: 9_000_000_000, files: 4, children: [
            folder("Library", size: 7_000_000_000, [
                folder("Library/Developer", size: 7_000_000_000, [locked("Library/Developer/Devices")]),
                folder("Library/Containers", size: 1, [folder("Library/Containers/com.apple.Notes", size: 1, [locked("Library/Containers/com.apple.Notes/Data")])]),
                locked("Library/Mail"),
            ]),
            folder("Downloads", size: 2_000_000_000),
        ])
        let summary = DiskSummary(dirs: 6, files: 4, bytes: tree.size, errors: errors, unreadable: .init(protected: errors, denied: 0, other: 0),
                                  entryErrors: 0, cloudOnly: .init(files: 0, bytes: 0, folders: 0), elapsedMs: 1, engine: "bulk")
        return DiskResult(root: tree, topFiles: [], summary: summary)
    }

    private var live: [LivePlace] {
        [LivePlace(path: path("Library/Developer"), size: 7_000_000_000), LivePlace(path: path("Library/Mail"), size: nil),
         LivePlace(path: path("Downloads"), size: 2_000_000_000)]
    }

    // MARK: Places

    @MainActor func testPlacesShowOnlyOnTheLiveMap() {
        let (feed, _) = feed(Apps([:]))
        let shown = map().root
        XCTAssertNil(feed.placesTable(for: shown), "before the live map's first tree")
        feed.liveTreeArrived(root: "/", places: live)
        XCTAssertEqual(feed.placesTable(for: shown)?.places.map(\.id), ["mail", "developer", "downloads"])
        XCTAssertEqual(feed.placesTable(for: shown)?.shownAt, ["/", home.path])
        XCTAssertNil(feed.placesTable(for: nil), "without a map")
        feed.mapIsntLive()
        XCTAssertNil(feed.placesTable(for: shown), "a scan, of another folder or disk")
        feed.liveTreeArrived(root: "/", places: live)
        XCTAssertNotNil(feed.placesTable(for: shown), "the live map again")
    }

    /// Move to Trash takes a place off the map at once; the live map's index lists its parent again only seconds later,
    /// and Undo puts the place back with the map from before.
    @MainActor func testATrashedPlaceLeavesPlacesAtOnceAndUndoPutsItBack() {
        let (feed, _) = feed(Apps([:]))
        feed.liveTreeArrived(root: "/", places: live)
        let before = map().root
        let developer = path("Library/Developer")
        let gone = feed.tookOff(developer)
        XCTAssertEqual(gone, [LivePlace(path: developer, size: 7_000_000_000)])
        let after = try? XCTUnwrap(DiskResult(root: before, topFiles: [], summary: map().summary).removing(developer)).root
        XCTAssertEqual(feed.placesTable(for: after ?? before)?.places.map(\.id), ["mail", "downloads"])
        XCTAssertEqual(feed.tookOff(path("Library/Developer/Xcode")), [], "nothing at or inside it is a place")
        XCTAssertEqual(feed.tookOff(path("Library")), [LivePlace(path: path("Library/Mail"), size: nil)], "a place inside what went")
        XCTAssertEqual(feed.tookOff(path("Libraryish")), [], "a name that only starts like it")
        feed.putBack(gone)
        XCTAssertEqual(feed.placesTable(for: before)?.places.map(\.id), ["developer", "downloads"])
        feed.mapIsntLive()
        XCTAssertEqual(feed.tookOff(path("Downloads")), [], "a scan has no places")
    }

    // MARK: Owners

    /// The apps that own the folders the map couldn't read are found off the main thread, and the page may load their
    /// icons once they are, with the writers' apps.
    @MainActor func testTheOwnersAreFoundOffTheMainThreadAndThePageMayLoadTheirIcons() async {
        let apps = Apps(["com.apple.Notes": "/Test Apps/Notes.app"])
        let (feed, policy) = feed(apps)
        feed.writers = ["/Applications/Safari.app"]
        feed.map = map()
        await feed.settled()
        // Mail is a known place, which shows its own icon by the rule.
        XCTAssertEqual(feed.owners, [path("Library/Developer/Devices"): .item("/Test Apps/Xcode.app"),
                                     path("Library/Containers/com.apple.Notes/Data"): .item("/Test Apps/Notes.app")])
        XCTAssertEqual(apps.askedFor, ["com.apple.Notes"])
        XCTAssertFalse(apps.askedOnMain, "LaunchServices was asked on the main thread")
        XCTAssertEqual(policy.apps, ["/Applications/Safari.app", "/Test Apps/Xcode.app", "/Test Apps/Notes.app"])
        // An app found is kept: the next map asks for none.
        feed.map = map()
        await feed.settled()
        XCTAssertEqual(apps.askedFor, ["com.apple.Notes"])
        // A map that read every folder has no owners, and the page may load the writers' apps alone.
        feed.map = map(errors: 0)
        await feed.settled()
        XCTAssertEqual(feed.owners, [:])
        XCTAssertEqual(policy.apps, ["/Applications/Safari.app"])
        feed.writers = []
        XCTAssertEqual(policy.apps, [])
    }

    /// The unreadable list's rows show a plain folder until a container's app is found, then its icon.
    @MainActor func testTheUnreadableListShowsAPlainFolderUntilTheAppIsFound() async {
        let apps = Apps(["com.apple.Notes": "/Test Apps/Notes.app"])
        let (feed, _) = feed(apps)
        let notes = path("Library/Containers/com.apple.Notes/Data")
        XCTAssertEqual(feed.ownerKey(for: notes), .folder)
        XCTAssertEqual(feed.ownerKey(for: path("Library/Containers/com.example.Gone/Data")), .folder)
        await feed.settled()
        XCTAssertEqual(feed.ownerKey(for: notes), .item("/Test Apps/Notes.app"))
        XCTAssertEqual(feed.ownerKey(for: path("Library/Containers/com.example.Gone/Data")), .folder, "no app for it")
        XCTAssertEqual(feed.ownerKey(for: path("Library/Developer/Devices")), .item("/Test Apps/Xcode.app"), "a place's app, found with the table")
        XCTAssertEqual(feed.ownerKey(for: path("Library/Mail")), .place("mail"))
        XCTAssertEqual(Set(apps.askedFor), ["com.apple.Notes", "com.example.Gone"])
        XCTAssertEqual(apps.askedFor.count, 2, "each bundle ID asked for once")
        XCTAssertFalse(apps.askedOnMain)
    }

    /// The smoke test gives the side column a table of its own: Places and the owners come from it from then on.
    @MainActor func testANewTableOfPlacesIsUsedAtOnce() async {
        let (feed, _) = feed(Apps([:]))
        feed.map = map()
        await feed.settled()
        XCTAssertNotNil(feed.owners[path("Library/Developer/Devices")])
        feed.places = KnownPlaces(home: home, searchPaths: [:]) { _ in nil }
        await feed.settled()
        XCTAssertEqual(feed.owners, [:], "Developer has no app in the new table")
        XCTAssertEqual(feed.places.home, home.path)
    }
}
