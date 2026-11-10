import Foundation

/// Where Activity's icon for an app comes from, by the rule the Disk tab's app icons follow (`KnownPlaces.mayShowApp`):
/// Pith looks an app's icon up by its bundle's path only on the startup disk, outside the locations macOS guards.
public enum AppIconSource: Equatable, Sendable {
    /// The bundle's own icon, which NSWorkspace looks up by the bundle's path (`IconKey.item`): an app Pith may look up.
    case bundle(String)
    /// The generic application icon: any other app, as one opened from Downloads or run from another disk, a share or the
    /// home automount, whether or not it runs. macOS's icon for a running app is no way round the rule:
    /// `NSRunningApplication.icon` draws its icon with `NSWorkspace.icon(forFile:)` on the app's bundle, looking the bundle
    /// up by its path in Pith's own process, as AppKit's code for it shows on macOS 26.3.
    case application
    /// The generic executable icon: a command-line tool or a daemon, with no bundle, or a process macOS hides the path of.
    case executable
}

extension KnownPlaces {
    /// Activity's icon for the app or process at `path`: an app's bundle, an executable inside one, or any other
    /// executable, as Activity names each (`AppSample.executable`).
    public func appIconSource(for path: String) -> AppIconSource {
        guard let bundle = SystemSampler.bundlePath(path) ?? (path.hasSuffix(".app") ? path : nil) else { return .executable }
        return mayShowApp(bundle) ? .bundle(bundle) : .application
    }
}
