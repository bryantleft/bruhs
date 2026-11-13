import AppKit

/// Readings settle between half-second updates; only row changes move across the screen.
enum ReadingMotion {
    static let live: TimeInterval = 0.2
    static let standard: TimeInterval = 0.2
    static let row: TimeInterval = 0.25
    static var timing: CAMediaTimingFunction { BruhsMotion.exitTiming }
    /// Core Animation stores CATransition under this key, regardless of the key passed to add(_:forKey:).
    static let fadeKey = "transition"

    @MainActor static func fade(_ layer: CALayer?, duration: TimeInterval = live) {
        guard let layer else { return }
        guard !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion else {
            layer.removeAnimation(forKey: fadeKey)
            return
        }
        let fade = CATransition()
        fade.type = .fade
        fade.duration = duration
        fade.timingFunction = timing
        layer.add(fade, forKey: fadeKey)
    }
}
