import Foundation

/// A version Pith could update to, as its update feed describes it.
public struct UpdateOffer: Equatable, Sendable {
    /// The version people read, e.g. "0.1.1".
    public var version: String
    /// The release notes, a paragraph each.
    public var notes: [String]
    /// The download's size in bytes, when the feed gives it.
    public var size: UInt64?
    /// Offered only to download by hand from the web, as a feed can when an update can't be installed in place.
    public var informationOnly: Bool
    /// Where to read about this version, and download it when it's offered only on the web.
    public var page: URL?
    /// An important update, which can't be skipped.
    public var critical: Bool
    /// Downloaded in the background already, so installing it needs no download.
    public var downloaded: Bool

    public init(version: String, notes: [String] = [], size: UInt64? = nil, informationOnly: Bool = false, page: URL? = nil,
                critical: Bool = false, downloaded: Bool = false) {
        self.version = version
        self.notes = notes
        self.size = size
        self.informationOnly = informationOnly
        self.page = page
        self.critical = critical
        self.downloaded = downloaded
    }

    /// Plain-text release notes as paragraphs: split at blank lines, with each paragraph's wrapped lines joined.
    public static func paragraphs(_ text: String?) -> [String] {
        guard let text else { return [] }
        var paragraphs: [String] = []
        var lines: [String] = []
        func close() {
            if !lines.isEmpty { paragraphs.append(lines.joined(separator: " ")) }
            lines = []
        }
        for line in text.components(separatedBy: .newlines) {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty { close() } else { lines.append(trimmed) }
        }
        close()
        return paragraphs
    }
}

/// Why a check found nothing to install. Each version is the newest the feed lists, when Sparkle names it.
public enum NoUpdate: Equatable, Sendable {
    /// The installed version is the newest, or newer than any published.
    case newest
    /// The newest version needs a later macOS than this Mac runs.
    case needsNewerSystem(version: String?)
    /// The newest version no longer supports the macOS this Mac runs.
    case needsOlderSystem(version: String?)
    /// The newest version runs only on Apple silicon.
    case needsAppleSilicon(version: String?)
}

/// How much of a download has arrived. A server can announce a size more than once, or one that turns out wrong.
public struct DownloadProgress: Equatable, Sendable {
    public private(set) var received: UInt64 = 0
    public private(set) var expected: UInt64?

    public init() {}

    public mutating func expect(_ length: UInt64) { expected = length > 0 ? length : nil }
    public mutating func receive(_ length: UInt64) { received += length }

    /// From 0 to 1, or nil while the size is unknown or less than what has already arrived.
    public var fraction: Double? {
        guard let expected, expected >= received else { return nil }
        return Double(received) / Double(expected)
    }
}

/// Where an update session stands, as Pith shows it.
public enum UpdatePhase: Equatable, Sendable {
    case idle
    /// Asking whether Pith may check for updates by itself, which Sparkle does once, on the second launch.
    case askingPermission
    /// A check the person asked for, before its answer.
    case checking
    case noUpdate(NoUpdate)
    case available(UpdateOffer)
    case downloading(UpdateOffer, DownloadProgress)
    /// Unpacking and verifying the download; the fraction is nil until the first progress report.
    case preparing(UpdateOffer, fraction: Double?)
    case readyToInstall(UpdateOffer)
    /// Pith is quitting so the new version can replace it and reopen.
    case installing(UpdateOffer)
    case failed(String)

    /// The update this phase is about, if any.
    public var offer: UpdateOffer? {
        switch self {
        case .available(let offer), .downloading(let offer, _), .preparing(let offer, _), .readyToInstall(let offer), .installing(let offer): offer
        case .idle, .askingPermission, .checking, .noUpdate, .failed: nil
        }
    }
}

/// An update session as Pith presents it, driven by Sparkle's user-driver events and the person's choices. Sparkle waits
/// on an answer at some steps; this says which answer to send and when the update window should come forward, so a
/// check Pith made by itself never interrupts: what it finds waits as a reminder until the person looks.
public struct UpdateFlow: Equatable, Sendable {
    /// The person's answer to an update, as Sparkle takes it.
    public enum Choice: Equatable, Sendable {
        case install
        /// Not now. Sparkle offers the update again at a later check.
        case later
        /// Not this version, until the person checks for updates themselves.
        case skip
    }

    /// What the app does after a step.
    public enum Effect: Equatable, Sendable {
        case none
        /// Bring the update window forward.
        case present
        /// Send this answer to the question Sparkle is waiting on.
        case reply(Choice)
    }

    public private(set) var phase: UpdatePhase = .idle
    /// A version a check Pith made by itself found, shown as a reminder until the person deals with it.
    public private(set) var reminder: UpdateOffer?
    /// Install was chosen, so the session runs on to reopening Pith without asking again.
    private var installChosen = false

    public init() {}

    // MARK: Sparkle's events

    public mutating func askPermission() -> Effect {
        phase = .askingPermission
        return .present
    }

    public mutating func answeredPermission() {
        if phase == .askingPermission { phase = .idle }
    }

    public mutating func checking() -> Effect {
        phase = .checking
        return .present
    }

    /// Only a check the person asked for brings the window forward; one Pith made by itself leaves a reminder.
    public mutating func found(_ offer: UpdateOffer, userInitiated: Bool) -> Effect {
        phase = .available(offer)
        installChosen = false
        if userInitiated {
            reminder = nil
            return .present
        }
        reminder = offer
        return .none
    }

    public mutating func noUpdate(_ reason: NoUpdate) -> Effect {
        phase = .noUpdate(reason)
        return .present
    }

    /// Sparkle reports errors only for a session the person has seen, so the window comes forward to say what failed.
    public mutating func failed(_ message: String) -> Effect {
        phase = .failed(message)
        reminder = nil
        installChosen = false
        return .present
    }

    public mutating func downloadStarted() {
        if let offer = phase.offer { phase = .downloading(offer, DownloadProgress()) }
    }

    public mutating func expect(_ length: UInt64) {
        guard case .downloading(let offer, var progress) = phase else { return }
        progress.expect(length)
        phase = .downloading(offer, progress)
    }

    public mutating func received(_ length: UInt64) {
        guard case .downloading(let offer, var progress) = phase else { return }
        progress.receive(length)
        phase = .downloading(offer, progress)
    }

    public mutating func preparing(_ fraction: Double?) {
        if let offer = phase.offer { phase = .preparing(offer, fraction: fraction.map { min(1, max(0, $0)) }) }
    }

    /// After the person chose Install, Pith goes straight on to reopening; an update downloaded in the background
    /// asks first.
    public mutating func readyToInstall() -> Effect {
        guard let offer = phase.offer ?? reminder else { return .none }
        phase = .readyToInstall(offer)
        return installChosen ? .reply(.install) : .present
    }

    public mutating func installing() {
        if let offer = phase.offer { phase = .installing(offer) }
    }

    /// Sparkle ended the session: it finished, failed, or was canceled.
    public mutating func dismissed() {
        phase = .idle
        reminder = nil
        installChosen = false
    }

    /// The person checked for updates while a session was open, so it comes forward again.
    public mutating func focus() -> Effect {
        phase == .idle ? .none : .present
    }

    // MARK: The person's choices

    /// The person's answer to the update on screen, and what to tell Sparkle. A choice that doesn't fit the phase,
    /// such as installing an update offered only on the web or skipping an important one, changes nothing.
    public mutating func choose(_ choice: Choice) -> Effect {
        switch (phase, choice) {
        case (.available(let offer), .install):
            return offer.informationOnly ? .none : install()
        case (.readyToInstall, .install):
            return install()
        case (.available, .later), (.readyToInstall, .later):
            return end(.later)
        case (.available(let offer), .skip):
            return offer.critical ? .none : end(.skip)
        default:
            return .none
        }
    }

    private mutating func install() -> Effect {
        installChosen = true
        reminder = nil
        return .reply(.install)
    }

    private mutating func end(_ choice: Choice) -> Effect {
        phase = .idle
        reminder = nil
        return .reply(choice)
    }

    /// The person closed a message (no update, or an error), or canceled a check or download.
    public mutating func closed() {
        switch phase {
        case .checking, .noUpdate, .failed, .downloading, .askingPermission: phase = .idle
        case .idle, .available, .preparing, .readyToInstall, .installing: break
        }
    }
}
