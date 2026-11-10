import AppKit
import PithCore

/// The smoke test's checks of the live map answering the person's own actions.
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
