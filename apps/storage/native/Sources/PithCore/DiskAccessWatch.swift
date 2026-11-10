import Darwin
import Foundation

/// Whether Pith still has Full Disk Access, and what losing it means for Pith's icon rule (`KnownPlaces.iconKey`).
///
/// Full Disk Access opens Desktop, Documents, Downloads, other apps' data and removable and network volumes without the
/// person answering macOS's question for each of them. So once it's turned off they have no answer, and macOS asks at
/// the next access, while the map still shows their folders listed until the scanner lists them again: a lookup of an
/// icon by its path there, in Pith's own process, could be what asks, and hold the icon store's thread while the
/// question is up. A Files and Folders permission turned off records an answer, and brings no question.
///
/// So from the moment a probe finds Pith has lost Full Disk Access, which it had at the probe before, the locations
/// macOS guards count as asking (`countsAsAsking(listedSince:)`), as while macOS asks: no icon is looked up by its path
/// there. That lasts until the scanner has listed every folder again since, in a walk or the daily check, which asks
/// macOS whatever it needs to and settles each folder as readable, unreadable or asked about, or until Pith has Full Disk
/// Access again. A map a scan made since lists its folders as they are, so it isn't held back.
public struct DiskAccessWatch: Equatable, Sendable {
    /// What a probe found.
    public enum Probe: Equatable, Sendable {
        case granted, denied
        /// It couldn't tell, as when the file isn't there.
        case unknown
    }

    /// Whether Pith had Full Disk Access at the last probe that could tell. Its caller keeps it across launches, so a loss
    /// between two launches is found at the first probe of the second.
    public private(set) var granted: Bool
    /// When a probe found Pith had lost Full Disk Access, or nil while it hasn't lost it since every folder was listed.
    public private(set) var lostAt: Date?

    public init(granted: Bool = false, lostAt: Date? = nil) {
        self.granted = granted
        self.lostAt = lostAt
    }

    /// A probe at `time` found `probe`.
    public mutating func probed(_ probe: Probe, at time: Date) {
        switch probe {
        case .granted:
            granted = true
            lostAt = nil
        case .denied:
            if granted, lostAt == nil { lostAt = time }
            granted = false
        case .unknown:
            break
        }
    }

    /// The scanner listed every folder of the live map again, in a walk or a check that began at `start`. One begun after
    /// the loss has asked macOS whatever it needed to, so nothing is held back since.
    public mutating func listedEveryFolder(since start: Date) {
        if let lostAt, start >= lostAt { self.lostAt = nil }
    }

    /// Whether the locations macOS guards count as asking for a map whose folders were listed from `listedSince` on, or
    /// at no known time: Pith lost Full Disk Access, and the map's folders were listed before then.
    public func countsAsAsking(listedSince: Date?) -> Bool {
        guard let lostAt else { return false }
        return listedSince.map { $0 < lostAt } ?? true
    }

    /// Opens `path` and closes it at once, reading nothing: whether macOS let Pith open it, refused it, or neither, as when
    /// it isn't there. Opening a file costs microseconds (VERIFICATION.md).
    public static func probe(_ path: String) -> Probe {
        let file = open(path, O_RDONLY | O_CLOEXEC)
        if file >= 0 {
            close(file)
            return .granted
        }
        return errno == EPERM || errno == EACCES ? .denied : .unknown
    }

    /// The file the probe opens: the person's own privacy database, which only Full Disk Access opens. macOS never asks
    /// about Full Disk Access, which only the person can give, in System Settings, and the file lies outside every
    /// location macOS asks about, so opening it never brings a question: without Full Disk Access it fails, and that's
    /// all.
    public static func probePath(home: String) -> String {
        home + "/Library/Application Support/com.apple.TCC/TCC.db"
    }
}
