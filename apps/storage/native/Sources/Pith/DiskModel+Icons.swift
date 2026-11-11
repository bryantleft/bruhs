import Foundation
import PithCore

/// Pith's icon rule as the map shown has it, for the native views and the map's page, by what macOS may be holding
/// and whether Pith has Full Disk Access.
extension DiskModel {
    /// The icon for an item of the map, or one kept from an earlier map, by Pith's icon rule as the map shown has it now
    /// (`KnownPlaces.iconKey(for:in:asking:trashIsEmpty:)`).
    func iconKey(for item: DiskNode) -> IconKey {
        rulePlaces.iconKey(for: item, in: result, asking: macOSMayHoldFolders, trashIsEmpty: trashIsEmpty)
    }

    /// Whether the Trash holds nothing, by what the scanner says of it with the map shown (`KnownPlaces.trashHoldsNothing`):
    /// its icon shows macOS's empty Trash then, everywhere it shows. A map a scan made says so by its tree and the folders
    /// its scan listed, and a live map's by the places that came with it.
    private var trashIsEmpty: Bool {
        Icons.places.trashHoldsNothing(in: result?.root, scan: scannedAt == nil ? nil : result?.summary, live: sideColumn.livePlaces ?? [])
    }

    /// The icon the page asks for at `url` on Pith's icon route, or nil when it may not have it.
    func iconRequest(for url: URL) -> IconRequest? {
        icons.request(for: url, asking: macOSMayHoldFolders, by: rulePlaces)
    }

    /// The icon of the disk mounted at `root`, wherever a disk's icon shows outside the map, as the rule draws it
    /// (`KnownPlaces.volumeKey`): its own, or the drive for one macOS guards while Pith hasn't Full Disk Access.
    func volumeKey(for root: String) -> IconKey { rulePlaces.volumeKey(for: root) }

    /// Pith's icon rule as the map's page applies it, which goes to the page with the icons' base, so the page gives
    /// each item the key `iconKey(for:)` gives it.
    var iconRule: IconRule { rulePlaces.iconRule(asking: macOSMayHoldFolders, trashIsEmpty: trashIsEmpty) }

    /// The apps that own the folders the map couldn't read, by folder, which Couldn't read shows on the map's page.
    var owners: [String: IconKey] { sideColumn.owners }

    /// The icon of what `folder`, a folder the map couldn't read, belongs to, as the unreadable list shows it.
    func ownerKey(for folder: String) -> IconKey { sideColumn.ownerKey(for: folder) }

    /// What the map's Places section shows from: the live map's places, or nil for a scan, where it never shows.
    var placesTable: PlacesTable? { sideColumn.placesTable(for: result?.root) }

    /// Whether macOS may be holding some of the live map's folders: it's asking about some, or the map is catching up
    /// after a launch, listing again what changed meanwhile and what was waiting on macOS when it was saved. Pith having
    /// lost Full Disk Access since the map's folders were listed counts too, as it leaves the locations macOS guards
    /// unanswered (`DiskAccessWatch`), a scan of another disk among them (`heldDisk`).
    var macOSMayHoldFolders: Bool {
        if diskAccess.countsAsAsking(listedSince: mapListedSince) || heldDisk != nil { return true }
        guard let live, liveView != nil else { return false }
        if case .catchingUp = live.state { return true }
        return live.asking > 0
    }

    /// When the map's folders began to be listed, by the wall clock: the live map's last walk or check of every folder,
    /// or the scan's start.
    private var mapListedSince: Date? {
        if let live, liveView != nil { return live.listedEveryFolderSince }
        return scanBegan
    }

    /// The root of a map a scan made of a volume macOS guards, by the icons' own test (`KnownPlaces.guardsVolume`), while
    /// losing Full Disk Access holds it, which counts among the locations macOS guards throughout then
    /// (`DiskAccessWatch.holdsScan`).
    private var heldDisk: String? {
        guard liveView == nil, let root = result?.root.path,
              diskAccess.holdsScan(of: root, listedSince: mapListedSince, guards: Icons.places.guardsVolume) else { return nil }
        return root
    }

    /// The places Pith's icon rule goes by for the map shown: the known places, with a held disk among the locations
    /// macOS guards (`heldDisk`), and the volumes macOS guards showing the drive while Pith hasn't Full Disk Access, by
    /// the probe (`KnownPlaces.guardingVolumes`).
    var rulePlaces: KnownPlaces {
        (heldDisk.map(Icons.places.holding) ?? Icons.places).guardingVolumes(fullDiskAccess: diskAccess.granted)
    }
}
