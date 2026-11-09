import Foundation
import PithCore

/// The updater behind `Updates`: Sparkle in the app. Views never see it, so the screen harness can show every phase.
@MainActor protocol UpdateEngine: AnyObject {
    /// False while Sparkle is busy in the background, such as downloading the feed by itself.
    var canCheck: Bool { get }
    var checksAutomatically: Bool { get set }
    var downloadsAutomatically: Bool { get set }
    func check()
    /// Sends the person's answer to the update Sparkle is waiting on.
    func reply(_ choice: UpdateFlow.Choice)
    func answerPermission(checks: Bool, downloads: Bool)
    /// Cancels a check or download in progress, or acknowledges a message Sparkle is waiting on.
    func close()
}

/// What Pith's update window, panel and Settings show of updates, and what they can ask for.
@MainActor @Observable final class Updates {
    /// Changed by the engine as Sparkle reports each step, and by the person's choices.
    var flow = UpdateFlow()
    /// Pith's own version, as people read it.
    let version: String
    /// Mirrors of Sparkle's own settings, which it keeps in Pith's defaults, so Settings redraws when they change.
    private(set) var checksAutomatically = false
    private(set) var downloadsAutomatically = false
    @ObservationIgnored private(set) weak var engine: UpdateEngine?
    /// Brings the update window forward.
    @ObservationIgnored var present: () -> Void = {}

    init(version: String = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown") {
        self.version = version
    }

    /// False when this build doesn't update itself: built for this Mac only, run with `swift run`, or in a smoke test.
    var isAvailable: Bool { engine != nil }
    var canCheck: Bool { engine?.canCheck ?? false }

    func attach(_ engine: UpdateEngine) {
        self.engine = engine
        settingsChanged()
    }

    /// Reads Sparkle's settings again, after it changed them itself, as answering the permission question does.
    func settingsChanged() {
        checksAutomatically = engine?.checksAutomatically ?? false
        downloadsAutomatically = engine?.downloadsAutomatically ?? false
    }

    func setChecksAutomatically(_ on: Bool) {
        engine?.checksAutomatically = on
        settingsChanged()
    }

    func setDownloadsAutomatically(_ on: Bool) {
        engine?.downloadsAutomatically = on
        settingsChanged()
    }

    func check() { engine?.check() }

    func choose(_ choice: UpdateFlow.Choice) { apply(flow.choose(choice)) }

    func answerPermission(checks: Bool, downloads: Bool) {
        engine?.answerPermission(checks: checks, downloads: downloads)
        flow.answeredPermission()
        settingsChanged()
    }

    /// Cancels the check or download on screen, or dismisses the message.
    func close() {
        engine?.close()
        flow.closed()
    }

    /// The update window closed. An offer it showed waits for a later check, a check stops, and a download carries on,
    /// since the person already chose to install. Unanswered, the permission question comes back at the next launch.
    func windowClosed() {
        switch flow.phase {
        case .available, .readyToInstall: choose(.later)
        case .checking, .noUpdate, .failed: close()
        case .askingPermission: flow.answeredPermission()
        case .idle, .downloading, .preparing, .installing: break
        }
    }

    /// Takes one step of the flow and carries out its effect.
    func step(_ change: (inout UpdateFlow) -> UpdateFlow.Effect) { apply(change(&flow)) }

    private func apply(_ effect: UpdateFlow.Effect) {
        switch effect {
        case .none: break
        case .present: present()
        case .reply(let choice): engine?.reply(choice)
        }
    }
}
