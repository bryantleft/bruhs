import XCTest
@testable import PithCore

final class FolderPathTests: XCTestCase {
    private let startup = FolderPath.Volume(path: "/", name: "Macintosh HD")
    private let external = FolderPath.Volume(path: "/Volumes/Photos", name: "Photos")
    private var volumes: [FolderPath.Volume] { [startup, external] }

    private func folder(_ path: String, _ children: [DiskNode] = []) -> DiskNode {
        DiskNode(kind: .dir, name: (path as NSString).lastPathComponent, path: path, size: 1 + children.reduce(0) { $0 + $1.size },
                 files: UInt64(children.count), children: children)
    }

    func testTheStartupDisksRootReadsAsTheDisksName() {
        let path = FolderPath("/", volumes: volumes)
        XCTAssertEqual(path?.volume, startup)
        XCTAssertEqual(path?.folders, [])
    }

    func testAFolderListsEachFolderFromItsDiskDown() {
        XCTAssertEqual(FolderPath("/Users/me/Projects", volumes: volumes),
                       FolderPath(volume: startup, folders: ["/Users", "/Users/me", "/Users/me/Projects"]))
    }

    func testAFolderOnAnotherDiskIsOnThatDisk() {
        XCTAssertEqual(FolderPath("/Volumes/Photos/2024/Trip", volumes: volumes),
                       FolderPath(volume: external, folders: ["/Volumes/Photos/2024", "/Volumes/Photos/2024/Trip"]))
        XCTAssertEqual(FolderPath("/Volumes/Photos", volumes: volumes), FolderPath(volume: external, folders: []))
    }

    func testADiskIsntTakenForAnotherWhoseNameBeginsTheSame() {
        let longer = FolderPath.Volume(path: "/Volumes/Photos 2", name: "Photos 2")
        XCTAssertEqual(FolderPath("/Volumes/Photos 2/a", volumes: volumes + [longer])?.volume, longer)
        XCTAssertEqual(FolderPath("/Volumes/PhotosExtra/a", volumes: volumes)?.volume, startup)
    }

    func testADiskMountedInsideAnotherHoldsWhatsBelowIt() {
        let inner = FolderPath.Volume(path: "/Volumes/Photos/Inner", name: "Inner")
        XCTAssertEqual(FolderPath("/Volumes/Photos/Inner/a", volumes: [inner] + volumes),
                       FolderPath(volume: inner, folders: ["/Volumes/Photos/Inner/a"]))
    }

    func testAFolderOnADiskNotListedIsOnTheStartupDisk() {
        XCTAssertEqual(FolderPath("/Volumes/Gone/a", volumes: volumes),
                       FolderPath(volume: startup, folders: ["/Volumes", "/Volumes/Gone", "/Volumes/Gone/a"]))
    }

    func testWithoutADiskThatHoldsItThereIsNoPath() {
        XCTAssertNil(FolderPath("/Users/me", volumes: [external]))
        XCTAssertNil(FolderPath("Users/me", volumes: volumes))
        XCTAssertNil(FolderPath("", volumes: volumes))
    }

    func testTheMapsOwnNodesStandForTheFoldersItHolds() {
        let b = folder("/r/a/b"), a = folder("/r/a", [b]), root = folder("/r", [a, folder("/r/c")])
        let nodes = FolderPath("/r/a/b", volumes: volumes)?.nodes(in: root)
        XCTAssertEqual(nodes, [root, a, b])
    }

    func testAFolderTheMapDoesntHoldHasNothingListed() {
        // Above the map's root, or left out of its tree: the map shows no listing of it.
        let b = folder("/r/a/b"), a = folder("/r/a", [b])
        let nodes = FolderPath("/r/a/b/gone", volumes: volumes)?.nodes(in: a) ?? []
        XCTAssertEqual(nodes.map(\.path), ["/r", "/r/a", "/r/a/b", "/r/a/b/gone"])
        for unlisted in [nodes[0], nodes[3]] {
            XCTAssertEqual(unlisted.kind, .dir)
            XCTAssertEqual(unlisted.size, 0)
            XCTAssertNil(unlisted.files)
            XCTAssertNil(unlisted.children)
        }
        XCTAssertEqual(nodes[0].name, "r")
        XCTAssertEqual(nodes[1], a)
        XCTAssertEqual(FolderPath("/r", volumes: volumes)?.nodes(in: nil).map(\.size), [0])
    }

    func testAFolderIsFoundByFollowingItsPathDown() {
        let file = DiskNode(kind: .file, name: "f", path: "/r/a/f", size: 1, children: nil)
        let b = folder("/r/a/b"), a = folder("/r/a", [b, file]), root = folder("/r", [folder("/r/ab"), a])
        XCTAssertEqual(root.folder(at: "/r"), root)
        XCTAssertEqual(root.folder(at: "/r/a/b"), b)
        XCTAssertNil(root.folder(at: "/r/a/f"), "a file isn't a folder")
        XCTAssertNil(root.folder(at: "/r/a/missing"))
        XCTAssertNil(root.folder(at: "/elsewhere"))
        XCTAssertNil(a.folder(at: "/r"), "nothing above the tree's own root")
    }

    // The disk, three folders between, and the open folder: each 100 wide whole, 30 as its icon alone, 40 at its
    // shortest, 2 apart.
    private func fit(_ width: CGFloat, parts: Int = 5) -> [CGFloat] {
        FolderPath.fit(full: Array(repeating: 100, count: parts), icons: Array(repeating: 30, count: parts),
                       minimum: Array(repeating: 40, count: parts), spacing: 2, width: width)
    }

    func testAPathWithRoomShowsEveryPartWhole() {
        XCTAssertEqual(fit(508), [100, 100, 100, 100, 100])
        XCTAssertEqual(fit(.infinity), [100, 100, 100, 100, 100])
    }

    func testTheFoldersBetweenGiveWayToTheirIconsOutermostFirst() {
        XCTAssertEqual(fit(507), [100, 30, 100, 100, 100])
        XCTAssertEqual(fit(437), [100, 30, 30, 100, 100])
        XCTAssertEqual(fit(298), [100, 30, 30, 30, 100])
    }

    func testThenTheFoldersBetweenLeaveThePathOutermostFirst() {
        XCTAssertEqual(fit(297), [100, 0, 30, 30, 100])
        XCTAssertEqual(fit(234), [100, 0, 0, 30, 100])
        XCTAssertEqual(fit(202), [100, 0, 0, 0, 100])
    }

    func testTheDiskAndTheOpenFolderKeepTheirNamesLongestTheDisksShorteningFirst() {
        XCTAssertEqual(fit(170), [68, 0, 0, 0, 100])
        XCTAssertEqual(fit(142), [40, 0, 0, 0, 100])
        XCTAssertEqual(fit(100), [40, 0, 0, 0, 58])
        XCTAssertEqual(fit(10), [40, 0, 0, 0, 40], "never below their shortest")
    }

    func testADiskAloneOrADiskAndItsOpenFolderFit() {
        XCTAssertEqual(fit(500, parts: 1), [100])
        XCTAssertEqual(fit(60, parts: 1), [60])
        XCTAssertEqual(fit(10, parts: 1), [40])
        XCTAssertEqual(fit(202, parts: 2), [100, 100])
        XCTAssertEqual(fit(150, parts: 2), [48, 100])
        XCTAssertEqual(fit(0, parts: 0), [])
    }

    /// The path bar's icons follow Pith's icon rule: a folder above the map's root, inside a location macOS guards,
    /// isn't looked up by its path, since the map hasn't listed it.
    func testAFolderAboveTheMapInAGuardedPlaceGetsAPlainFolder() {
        let home = FileManager.default.temporaryDirectory.appendingPathComponent("pith-test-home-\(UUID().uuidString)")
        let places = KnownPlaces(home: home, searchPaths: [.documentDirectory: home.appendingPathComponent("Documents")]) { _ in nil }
        let documents = home.appendingPathComponent("Documents").path
        let inner = folder("\(documents)/Work/Projects/inner")
        let mapRoot = folder("\(documents)/Work/Projects", [inner])
        let path = FolderPath(inner.path, volumes: volumes)
        let keys = (path?.nodes(in: mapRoot) ?? []).map { places.iconKey(for: $0, asking: false) }
        XCTAssertEqual(keys.suffix(4), [.place("documents"), .folder, .item(mapRoot.path), .item(inner.path)])
        // Outside guarded locations a folder is looked up by its path, listed or not.
        XCTAssertEqual(keys.first, path?.folders.first.map(IconKey.item))
    }
}
