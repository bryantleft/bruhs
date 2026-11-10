import Foundation

/// The caption under the Disk tab's path bar: one status at a time, as a sentence or as labelled figures. For the live
/// map, in this order: its first walk (what it has found, or that it's starting), catching up on what changed while Pith
/// was closed, a check of every folder under way, many folders waiting to be listed again, when it was last up to date,
/// and why it stopped. For a scan, in this order: what the scan has found, or that it's starting, when the map's scan
/// was, and how the last scan ended when it made no map. macOS asking whether Pith may read some folders is no status:
/// Disk's notices say it, and the caption goes on with its own.
public enum DiskCaption: Equatable, Sendable {
    case message(String)
    case figures([Figure])

    /// A figure in the caption, such as "Files 123,697".
    public struct Figure: Hashable, Sendable {
        public let label: String
        public let value: String

        public init(label: String, value: String) { self.label = label; self.value = value }
    }

    /// What a walk or a scan has found so far.
    public struct Found: Equatable, Sendable {
        public let bytes: UInt64
        public let files: UInt64

        public init(bytes: UInt64, files: UInt64) { self.bytes = bytes; self.files = files }
    }

    /// A check of every folder the live map's scanner has under way.
    public enum Check: Equatable, Sendable {
        /// The one Pith asks for once a day, on power, to catch what FSEvents didn't report.
        case daily
        /// One the scanner began itself, as FSEvents lost track of changes and asked for every folder to be listed.
        case lostTrack
    }

    /// What the live map is doing, as the caption tells it.
    public enum Live: Equatable, Sendable {
        /// Not started, opening its saved map, or waiting for Disk to open before its first walk: nothing to say yet.
        case quiet
        /// Its first walk, or a new one: what it has found so far, or nothing yet.
        case mapping(found: Found?)
        /// Replaying what changed while Pith was closed, with how many folders wait to be listed again.
        case catchingUp(waiting: Int)
        /// Current: how many folders wait to be listed again, a check of every folder under way, and when it was last
        /// brought up to date.
        case live(waiting: Int, check: Check?, updatedAt: Date?)
        case failed(String)
    }

    /// A scan of a folder, as the caption tells it.
    public enum Scan: Equatable, Sendable {
        /// Scanning, with what it has found so far, or nothing yet; `again` is the map's folder it scans again, if it's one.
        case scanning(found: Found?, again: String?)
        /// A map from a scan, at `at`, changed since or not.
        case scanned(at: Date, edited: Bool)
        /// How the last scan ended, when it made no map.
        case note(String)
        case nothing
    }

    /// Folders waiting to be listed again before the caption says the live map is catching up. Following the development
    /// Mac's whole disk, 0 to 30 were waiting at any moment, each listed within seconds.
    public static let catchingUpCount = 100

    /// The caption for the live map, at `now` in `calendar`: what it's doing, whatever macOS is asking about.
    public static func live(_ map: LiveMapStatus, now: Date = Date(), calendar: Calendar = .current) -> DiskCaption? {
        switch map.activity {
        case .mapping(let found?):
            return .figures([Figure(label: "Mapped", value: formatBytes(found.bytes)), Figure(label: "Files", value: monaspaced(found.files.formatted()))])
        case .mapping(nil):
            return .message("Starting the map…")
        case .catchingUp(let waiting) where waiting > 0:
            return .message("Catching up on \(waiting.formatted()) \(waiting == 1 ? "folder" : "folders") that changed while Pith was closed.")
        case .catchingUp:
            return .message("Catching up on what changed while Pith was closed.")
        // Ahead of the folders waiting, since a check lists every one of them, though none changed.
        case .live(_, .daily?, _):
            return .message("Checking the whole disk, as Pith does daily.")
        case .live(_, .lostTrack?, _):
            return .message("Checking the whole disk, since macOS lost track of some changes.")
        // A busy Mac always has a few folders waiting their turn; the count matters only when many are.
        case .live(let waiting, nil, _) where waiting >= catchingUpCount:
            return .message("Catching up on \(waiting.formatted()) folders that changed.")
        case .live(_, nil, let updatedAt):
            return updatedAt.map { .figures([Figure(label: "Up to date", value: monaspaced(time($0, now: now, calendar: calendar)))]) }
        case .failed(let message):
            return .message(message)
        case .quiet:
            return nil
        }
    }

    /// The caption for a scan, at `now` in `calendar`. The bar under the map gives the open folder's or the selection's
    /// size, so a scanned map's caption says when the scan was.
    public static func scan(_ state: Scan, now: Date = Date(), calendar: Calendar = .current) -> DiskCaption? {
        switch state {
        case .scanning(nil, nil):
            return .message("Starting the scan…")
        case .scanning(nil, let again?):
            return .message("Scanning \(URL(fileURLWithPath: again).lastPathComponent) again…")
        case .scanning(let found?, _):
            return .figures([Figure(label: "Size", value: formatBytes(found.bytes)), Figure(label: "Files", value: monaspaced(found.files.formatted()))])
        case .scanned(let at, let edited):
            return .figures([Figure(label: edited ? "Scanned, then edited" : "Scanned", value: monaspaced(time(at, now: now, calendar: calendar)))])
        case .note(let note):
            return .message(note)
        case .nothing:
            return nil
        }
    }

    /// "Today 1:57 PM", "Yesterday 9:02 AM" or "Nov 3, 9:02 AM": a map can be days old, unlike Activity's ten minutes.
    public static func time(_ date: Date, now: Date = Date(), calendar: Calendar = .current) -> String {
        let style = Date.FormatStyle(calendar: calendar, timeZone: calendar.timeZone)
        let time = date.formatted(Date.FormatStyle(date: .omitted, time: .shortened, calendar: calendar, timeZone: calendar.timeZone))
        if calendar.isDate(date, inSameDayAs: now) { return "Today \(time)" }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: now), calendar.isDate(date, inSameDayAs: yesterday) { return "Yesterday \(time)" }
        return date.formatted(style.month(.abbreviated).day().hour().minute())
    }
}

/// The live map as Disk shows it: what it's doing, which the caption tells, and how many of its folders macOS is asking
/// the person whether Pith may read, which the map goes on without and the asking notice names.
public struct LiveMapStatus: Equatable, Sendable {
    public let activity: DiskCaption.Live
    public let asking: Int

    public init(_ activity: DiskCaption.Live, asking: Int = 0) {
        self.activity = activity
        self.asking = asking
    }
}

/// The notice Disk shows while macOS asks the person whether Pith may read some of the live map's folders: what
/// answering does, or Full Disk Access, which its button opens.
public enum AskingNotice {
    /// What it leads with: a raised hand, as macOS's Privacy & Security does.
    public static let symbol = "hand.raised.fill"

    /// How many folders it names, while macOS asks about some once the map is made, as it catches up or keeps current.
    /// Nil otherwise: before the map is made, the map's own waiting view says macOS is asking.
    public static func folders(for map: LiveMapStatus) -> Int? {
        guard map.asking > 0 else { return nil }
        switch map.activity {
        case .catchingUp, .live: return map.asking
        case .quiet, .mapping, .failed: return nil
        }
    }

    /// What macOS asking about `folders` folders means for the map.
    public static func sentence(folders: Int) -> String {
        let named = "\(folders.formatted()) \(folders == 1 ? "folder" : "folders")"
        return "macOS is asking whether Pith may read \(named). Answer it, or give Pith Full Disk Access once, and \(folders == 1 ? "it joins" : "they join") the map."
    }
}

/// Monaspace has no narrow no-break space, which the locale puts in times ("1:57 PM") and some locales' thousands. A
/// fallback font would draw it at its own width, so use the font's no-break space instead.
public func monaspaced(_ text: String) -> String {
    text.replacingOccurrences(of: "\u{202F}", with: "\u{00A0}")
}
