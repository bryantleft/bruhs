import Foundation

/// Where Activity lists a process group.
public enum ProcessKind: String, Sendable {
    /// Has a .app bundle, including the apps macOS ships, such as Finder and Dock.
    case app
    /// An executable without a bundle, installed outside macOS's own folders.
    case commandLineTool
    /// An executable that ships with macOS, or one whose path macOS won't reveal.
    case system

    public var label: String {
        switch self {
        case .app: "App"
        case .commandLineTool: "Command-line tool"
        case .system: "macOS system process"
        }
    }
}

/// What to call a process group and how to explain it.
public struct ProcessIdentity: Sendable, Equatable {
    public let kind: ProcessKind
    public let displayName: String
    /// What follows the name in a list: a command-line tool's version, or what a system
    /// process does. Nil for apps, whose lists show their process count instead.
    public let secondaryText: String?
    /// One plain-English line about a system process; nil for apps and tools.
    public let description: String?
}

extension ProcessIdentity {
    /// - Parameters:
    ///   - path: the executable path, or "" when macOS hides it.
    ///   - processName: the kernel's name for the process.
    ///   - bundleName: the display name read from the enclosing .app bundle, if any.
    public init(path: String, processName: String, bundleName: String?) {
        // An app's executable path runs through its bundle; samples store the bundle itself.
        if let bundle = SystemSampler.bundlePath(path) ?? (path.hasSuffix(".app") ? path : nil) {
            kind = .app
            displayName = bundleName.flatMap { $0.isEmpty ? nil : $0 } ?? URL(filePath: bundle, directoryHint: .isDirectory).deletingPathExtension().lastPathComponent
            secondaryText = nil
            description = nil
            return
        }
        // A directory hint keeps URL from asking the file system what the path is.
        let executable = path.isEmpty ? processName : URL(filePath: path, directoryHint: .notDirectory).lastPathComponent
        // A process macOS won't show the path of belongs to another user, almost always a daemon.
        if path.isEmpty || Self.applePrefixes.contains(where: path.hasPrefix) {
            kind = .system
            displayName = executable.isEmpty ? "Unnamed process" : executable
            secondaryText = Self.systemDescriptions[executable]
            description = secondaryText ?? ProcessKind.system.label
            return
        }
        kind = .commandLineTool
        description = nil
        if Self.looksLikeVersion(executable), let folder = Self.toolFolder(path) {
            displayName = folder
            secondaryText = executable
        } else {
            displayName = executable
            secondaryText = nil
        }
    }

    /// Folders macOS installs and protects. /bin and /Library/Apple are as much Apple's as /usr/bin.
    static let applePrefixes = ["/System/", "/usr/libexec/", "/usr/sbin/", "/sbin/", "/usr/bin/", "/bin/", "/Library/Apple/"]

    /// Folders that say where a tool keeps its files rather than what the tool is.
    private static let genericFolders: Set<String> = ["bin", "sbin", "libexec", "versions", "version", "current", "latest", "releases", "release", "stable", "builds", "build", "dist", "out", "target"]

    /// The nearest enclosing folder that names the tool, e.g. "claude" for
    /// ~/.local/share/claude/versions/2.1.319.
    private static func toolFolder(_ path: String) -> String? {
        var folder = URL(filePath: path, directoryHint: .notDirectory).deletingLastPathComponent()
        while folder.path != "/" {
            let name = folder.lastPathComponent
            if !genericFolders.contains(name.lowercased()) && !looksLikeVersion(name) { return name }
            folder.deleteLastPathComponent()
        }
        return nil
    }

    /// "2.1.319", "v20.11.0", "1.2.3-beta+4": digits with at least one dot, an optional "v",
    /// and an optional suffix after "-", "+" or "_".
    static func looksLikeVersion(_ name: String) -> Bool {
        var rest = Substring(name)
        if rest.first == "v" { rest = rest.dropFirst() }
        let core = rest.prefix { $0.isASCII && ($0.isNumber || $0 == ".") }
        let parts = core.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count >= 2, parts.allSatisfy({ !$0.isEmpty }) else { return false }
        let suffix = rest.dropFirst(core.count)
        return suffix.isEmpty || (suffix.count > 1 && "-+_".contains(suffix.first!))
    }

    /// Plain-English lines for common macOS processes, keyed by executable name. Only entries
    /// we can state accurately belong here; anything else reads "macOS system process".
    static let systemDescriptions: [String: String] = [
        "kernel_task": "The macOS kernel, which also limits CPU use to keep the Mac cool",
        "launchd": "Starts and manages background services",
        "WindowServer": "Draws the screen and routes keyboard and mouse input",
        "mds": "Spotlight: manages the search index",
        "mds_stores": "Spotlight: stores the search index",
        "mdworker": "Spotlight: reads files to index them",
        "mdworker_shared": "Spotlight: reads files to index them",
        "mdbulkimport": "Spotlight: imports files in bulk for indexing",
        "corespotlightd": "Spotlight: indexes content that apps provide",
        "spotlightknowledged": "Spotlight: part of search indexing",
        "mediaanalysisd": "Analyzes photos and videos for search and Visual Look Up",
        "photoanalysisd": "Analyzes the Photos library for people, scenes and memories",
        "photolibraryd": "Manages the Photos library",
        "cloudphotod": "Syncs iCloud Photos",
        "cloudd": "Syncs app data with iCloud",
        "bird": "Syncs iCloud Drive",
        "fileproviderd": "Syncs files for iCloud Drive and other cloud storage",
        "nsurlsessiond": "Runs background downloads and uploads for apps",
        "trustd": "Checks certificate trust for secure connections",
        "coreaudiod": "Handles sound input and output",
        "bluetoothd": "Manages Bluetooth devices",
        "softwareupdated": "Checks for and installs macOS updates",
        "backupd": "Runs Time Machine backups",
        "syspolicyd": "Gatekeeper: checks apps before they open",
        "XprotectService": "XProtect: checks for known malware",
        "distnoted": "Relays notifications between apps and system services",
        "cfprefsd": "Reads and saves app and system settings",
        "notifyd": "Relays system event notifications between processes",
        "logd": "Collects system and app logs",
        "syslogd": "Collects system log messages",
        "configd": "Manages network configuration",
        "mDNSResponder": "Looks up network names (DNS and Bonjour)",
        "airportd": "Manages Wi-Fi",
        "powerd": "Manages power, sleep and battery",
        "opendirectoryd": "Looks up user accounts and groups",
        "securityd": "Manages keychains and security credentials",
        "locationd": "Provides Location Services",
        "tccd": "Checks privacy permissions",
        "amfid": "Verifies code signatures",
        "fseventsd": "Records file system changes",
        "diskarbitrationd": "Mounts disks and volumes",
        "deleted": "Frees purgeable disk space",
        "sharingd": "Runs AirDrop, Handoff and other sharing features",
        "rapportd": "Connects your nearby Apple devices",
        "apsd": "Receives Apple push notifications",
        "identityservicesd": "Identity services for iMessage, FaceTime and Continuity",
        "usernoted": "Shows notifications",
        "hidd": "Handles keyboard, mouse and trackpad input",
        "thermalmonitord": "Monitors temperature",
        "timed": "Keeps the clock accurate",
        "sysmond": "Reports process statistics to monitoring tools",
        "UserEventAgent": "Responds to system events through plug-ins",
        "runningboardd": "Manages app and process lifecycles",
        "dasd": "Schedules background tasks",
        "lsd": "Keeps track of installed apps and file types",
        "coreservicesd": "Keeps track of apps and file types",
        "launchservicesd": "Keeps track of running apps",
        "iconservicesagent": "Provides app and file icons",
        "containermanagerd": "Manages app data containers",
        "kernelmanagerd": "Loads kernel extensions",
        "endpointsecurityd": "Runs Endpoint Security for security software",
        "searchpartyd": "Find My: locates your devices",
        "corebrightnessd": "Adjusts display brightness and Night Shift",
        "universalaccessd": "Runs accessibility features",
        "screensharingd": "Hosts Screen Sharing",
        "sshd": "Remote Login (SSH) server",
        "cupsd": "Runs printing",
        "mobileassetd": "Downloads system assets such as voices and fonts",
        "suggestd": "Finds suggestions for Siri and Spotlight",
        "akd": "Signs in to your Apple Account",
        "assistantd": "Runs Siri requests",
        "corespeechd": "Listens for Siri and dictation",
        "replayd": "Records the screen",
        "gamecontrollerd": "Handles game controllers",
        "aned": "Runs work on the Neural Engine",
        "mediaremoted": "Controls media playback",
        "nesessionmanager": "Manages VPN connections",
        "pboard": "Manages the clipboard",
        "talagent": "Reopens app windows after a restart",
        "remindd": "Syncs Reminders",
        "calaccessd": "Gives apps access to Calendar",
        "watchdogd": "Restarts system services that stop responding",
        "com.apple.WebKit.WebContent": "Web content for Safari or an app's web view",
        "com.apple.WebKit.Networking": "Network requests for web content",
        "com.apple.WebKit.GPU": "Graphics for web content",
    ]
}
