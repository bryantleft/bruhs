import AppKit
import PithCore

/// The smoke test's check that the icons Pith shows by type are macOS's own art, never the generic document.
extension AppDelegate {
    /// Every known place this Mac has, and the types macOS declares itself that most files on a disk are, draw as more
    /// than the generic document: macOS draws a type it has no icon for, or a special folder's type it doesn't declare,
    /// as the blank page any unknown file gets, which says nothing of what a place or a file is. Each is drawn by the
    /// app's icon store, as the map's page and the native views draw it, at 16 pt at 2x in light and in dark, and compared
    /// pixel for pixel with the generic document drawn at the same size in the same appearance
    /// (`IconStore.genericDrawings`). One that draws as it, or draws nothing, is named. CI's macOS 15 job runs it too,
    /// where the Swift tests don't run.
    func checkNoGenericIcons() async -> [String: Bool] {
        let places = Icons.places
        let keys = (places.places + [places.emptyTrash].compactMap { $0 }).map { IconKey.place($0.id) } + Self.commonTypes.map(IconKey.type)
        let generic = await Icons.store.genericDrawings(of: keys, size: IconSize(points: 16, scale: 2))
        print("generic icons: \(keys.count) keys, \(keys.count - Self.commonTypes.count) places and \(Self.commonTypes.count) types, drawn in light and "
              + "dark; \(generic.isEmpty ? "none draws as the generic document" : "the generic document for \(generic.map(\.description).joined(separator: "; "))")")
        return ["places_and_types_have_their_own_icons": generic.isEmpty]
    }

    /// Types macOS declares itself, which most files on a disk are: documents, pictures, films, music, archives, disk
    /// images and text.
    static let commonTypes = ["pdf", "png", "jpeg", "mov", "mp3", "zip", "dmg", "txt"]
}
