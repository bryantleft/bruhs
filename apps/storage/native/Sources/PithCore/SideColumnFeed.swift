import Foundation
import Observation

/// What native feeds the disk map's side column beside each map, which DiskView sends the page: the Places section's
/// table, and the apps that own the folders the map couldn't read. It also sets which apps' icons the icon route serves
/// the page: those owners' and the apps' that Wrote the most since names.
///
/// A container's app comes from LaunchServices, which takes tens of microseconds, and up to most of a millisecond, for an
/// app it hasn't been asked about. So the apps are found off the main thread, with the walk of the map that finds its
/// unreadable folders' owners, and each is kept for the session. Until its app is found, a folder shows a plain folder.
@MainActor @Observable public final class SideColumnFeed {
    /// The known places Places offers and the owners come from: this Mac's, or the smoke test's, made for a home folder
    /// inside its fixture, so the side column shows through the same code while Pith looks at none of the person's
    /// folders.
    public var places: KnownPlaces {
        didSet { findOwners() }
    }
    /// The map the page shows, whose unreadable folders' owners are found again for each.
    @ObservationIgnored public var map: DiskResult? {
        didSet { findOwners() }
    }
    /// The bundles of the apps Wrote the most since names, whose icons the page may load.
    @ObservationIgnored public var writers: Set<String> = [] {
        didSet { allowApps() }
    }
    /// The apps that own the folders the map couldn't read, by folder (`KnownPlaces.owners`), for the page's Couldn't
    /// read rows. The page may load their icons.
    public private(set) var owners: [String: IconKey] = [:] {
        didSet { allowApps() }
    }
    /// The app found for each container's bundle ID so far, nil where LaunchServices found none. The unreadable list's
    /// rows read it, so they show an app as soon as it's found.
    private var apps: [String: URL?] = [:]

    @ObservationIgnored private let policy: IconPolicy
    @ObservationIgnored private let lookUp: @Sendable (String) -> URL?
    /// The live map's root and what its index said of each place with its last tree, or nil while the map shown isn't
    /// the live one: Places shows on the live map alone.
    @ObservationIgnored private var live: (root: String, places: [LivePlace])?
    /// The walk for the map's owners under way, and how many have begun, so only the last one's answer counts.
    @ObservationIgnored private var owning: Task<Void, Never>?
    @ObservationIgnored private var walks = 0
    /// The bundle IDs the unreadable list asked for, and those waiting to be found, a batch at a time.
    @ObservationIgnored private var asked: Set<String> = []
    @ObservationIgnored private var waiting: Set<String> = []
    @ObservationIgnored private var finding: Task<Void, Never>?

    /// The side column for `places`. It sets the apps `policy` serves the page, and finds an app by its bundle ID with
    /// `lookUp`, which runs off the main thread.
    public init(places: KnownPlaces, policy: IconPolicy, lookUp: @escaping @Sendable (String) -> URL?) {
        self.places = places
        self.policy = policy
        self.lookUp = lookUp
    }

    // MARK: Places

    /// A tree of the live map came: `root` is the live map's own, the startup disk's root, and `places` what its index
    /// holds at each place.
    public func liveTreeArrived(root: String, places: [LivePlace]) {
        live = (root, places)
    }

    /// What the live map's index held at each place with the tree the page shows, or nil while the map shown isn't the
    /// live one.
    public var livePlaces: [LivePlace]? { live?.places }

    /// The map shown isn't the live one now, as while a scan runs and after it, or the live map shows another folder
    /// whose first tree hasn't come: no Places until a tree of the live map comes.
    public func mapIsntLive() {
        live = nil
    }

    /// Move to Trash took `path` off the map: a place at or inside it leaves Places at once, though the live map's index
    /// lists its parent again only seconds later. What it returns goes back with Undo (`putBack`).
    public func tookOff(_ path: String) -> [LivePlace] {
        guard var shown = live else { return [] }
        let gone = shown.places.filter { DiskChanges.isInside($0.path, path) }
        shown.places.removeAll { DiskChanges.isInside($0.path, path) }
        live = shown
        return gone
    }

    /// Undo put the map from before Move to Trash back, and with it the places the move took off it.
    public func putBack(_ places: [LivePlace]) {
        guard var shown = live, !places.isEmpty else { return }
        shown.places.removeAll { place in places.contains { $0.path == place.path } }
        shown.places += places
        live = shown
    }

    /// The Places section's table for the live map whose tree the page shows (`KnownPlaces.placesTable`), or nil for any
    /// other map, or none.
    public func placesTable(for tree: DiskNode?) -> PlacesTable? {
        guard let live, let tree else { return nil }
        return places.placesTable(for: tree, mapRoot: live.root, live: live.places)
    }

    // MARK: Owners

    /// The icon of what `folder`, a folder the map couldn't read, belongs to, as the unreadable list shows it
    /// (`KnownPlaces.ownerKey`): a plain folder until a container's app is found, then the app's.
    public func ownerKey(for folder: String) -> IconKey {
        places.ownerKey(for: folder) { bundleID in
            if let found = apps[bundleID] { return found }
            find(bundleID)
            return nil
        }
    }

    /// Waits until the owners of the map shown are found, and every app the unreadable list asked for, as the tests and
    /// the smoke test do.
    public func settled() async {
        while let task = owning ?? finding {
            await task.value
        }
    }

    /// Finds the apps that own the folders the map couldn't read, off the main thread: a walk of its tree, with the apps
    /// found so far and LaunchServices for the rest. A map that read every folder has none.
    private func findOwners() {
        owning?.cancel()
        walks &+= 1
        guard let map, map.summary.errors > 0 else {
            owning = nil
            if !owners.isEmpty { owners = [:] }
            return
        }
        let walk = walks, places = self.places, tree = map.root, known = apps, lookUp = self.lookUp
        owning = Task { [weak self] in
            let (found, looked) = await Task.detached(priority: .utility) { () -> ([String: IconKey], [String: URL?]) in
                var looked: [String: URL?] = [:]
                let found = places.owners(in: tree) { bundleID in
                    if let app = known[bundleID] ?? looked[bundleID] { return app }
                    let app = lookUp(bundleID)
                    looked.updateValue(app, forKey: bundleID)
                    return app
                }
                return (found, looked)
            }.value
            guard let self else { return }
            // Apps found are kept whichever walk found them.
            self.apps.merge(looked) { _, new in new }
            self.asked.formUnion(looked.keys)
            guard self.walks == walk else { return }
            self.owning = nil
            if found != self.owners { self.owners = found }
        }
    }

    /// Finds `bundleID`'s app off the main thread, with any others the unreadable list asks for meanwhile, and keeps it.
    private func find(_ bundleID: String) {
        guard asked.insert(bundleID).inserted else { return }
        waiting.insert(bundleID)
        guard finding == nil else { return }
        let lookUp = self.lookUp
        finding = Task { [weak self] in
            while let batch = self?.nextBatch() {
                let found = await Task.detached(priority: .utility) { batch.map { ($0, lookUp($0)) } }.value
                for (bundleID, app) in found { self?.apps.updateValue(app, forKey: bundleID) }
            }
            self?.finding = nil
        }
    }

    /// The bundle IDs waiting to be found, which are being found from now on, or nil when none are.
    private func nextBatch() -> Set<String>? {
        guard !waiting.isEmpty else { return nil }
        defer { waiting = [] }
        return waiting
    }

    /// The apps the icon route serves the page: the writers' and the owners'. `IconPolicy` still refuses any app Pith may
    /// not look up (`KnownPlaces.mayShowApp`), where macOS guards or on another disk.
    private func allowApps() {
        let owning = owners.values.compactMap { key -> String? in
            if case .item(let app) = key { return app }
            return nil
        }
        policy.apps = writers.union(owning)
    }
}
