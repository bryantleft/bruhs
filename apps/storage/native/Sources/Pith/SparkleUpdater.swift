import AppKit
import PithCore
import Security
import Sparkle

/// Sparkle behind Pith's own update window. Sparkle reads the feed, downloads, checks the signatures and installs; this
/// is the user driver it asks what to show. Each step goes to `UpdateFlow`, and the answers Sparkle waits on are kept here
/// until the person gives them. Sparkle's own windows aren't used, because they don't follow Pith's look or writing rules.
@MainActor final class SparkleUpdater: NSObject, SPUUserDriver, UpdateEngine {
    private let updates: Updates
    private var updater: SPUUpdater?
    /// The answer Sparkle waits on for the update on screen.
    private var answer: ((SPUUserUpdateChoice) -> Void)?
    private var permission: ((SUUpdatePermissionResponse) -> Void)?
    /// Stops the check or download in progress.
    private var cancellation: (() -> Void)?
    /// Tells Sparkle a message was seen, which ends its session.
    private var acknowledgement: (() -> Void)?

    init(updates: Updates) {
        self.updates = updates
        super.init()
    }

    /// Starts Sparkle, which schedules its own checks from here on. Throws when the bundle has no feed, as builds signed
    /// only for this Mac don't, or when Sparkle finds the setup unsafe.
    func start() throws {
        // Sparkle can start before checking for a feed. Saved update preferences must not make a local build offer updates.
        guard let feed = Bundle.main.object(forInfoDictionaryKey: "SUFeedURL") as? String, !feed.isEmpty else {
            throw DiskFailure("This local build has no update feed.")
        }
        let updater = SPUUpdater(hostBundle: .main, applicationBundle: .main, userDriver: self, delegate: nil)
        try updater.start()
        self.updater = updater
        updates.attach(self)
    }

    // MARK: UpdateEngine

    var canCheck: Bool { updater?.canCheckForUpdates ?? false }

    var checksAutomatically: Bool {
        get { updater?.automaticallyChecksForUpdates ?? false }
        set { updater?.automaticallyChecksForUpdates = newValue }
    }

    var downloadsAutomatically: Bool {
        get { updater?.automaticallyDownloadsUpdates ?? false }
        set { updater?.automaticallyDownloadsUpdates = newValue }
    }

    func check() { updater?.checkForUpdates() }

    func reply(_ choice: UpdateFlow.Choice) {
        guard let answer else { return }
        self.answer = nil
        switch choice {
        case .install: answer(.install)
        case .later: answer(.dismiss)
        case .skip: answer(.skip)
        }
    }

    func answerPermission(checks: Bool, downloads: Bool) {
        guard let permission else { return }
        self.permission = nil
        // Pith never sends Sparkle's system profile.
        permission(SUUpdatePermissionResponse(automaticUpdateChecks: checks, automaticUpdateDownloading: NSNumber(value: checks && downloads),
                                              sendSystemProfile: false))
    }

    func close() {
        let cancellation = cancellation, acknowledgement = acknowledgement
        self.cancellation = nil
        self.acknowledgement = nil
        cancellation?()
        acknowledgement?()
    }

    // MARK: SPUUserDriver

    func show(_ request: SPUUpdatePermissionRequest, reply: @escaping (SUUpdatePermissionResponse) -> Void) {
        permission = reply
        updates.step { $0.askPermission() }
    }

    func showUserInitiatedUpdateCheck(cancellation: @escaping () -> Void) {
        self.cancellation = cancellation
        updates.step { $0.checking() }
    }

    func showUpdateFound(with appcastItem: SUAppcastItem, state: SPUUserUpdateState, reply: @escaping (SPUUserUpdateChoice) -> Void) {
        cancellation = nil
        answer = reply
        let offer = Self.offer(appcastItem, downloaded: state.stage != .notDownloaded)
        updates.step { $0.found(offer, userInitiated: state.userInitiated) }
    }

    /// Pith's feed embeds its notes, so there are none to download.
    func showUpdateReleaseNotes(with downloadData: SPUDownloadData) {}
    func showUpdateReleaseNotesFailedToDownloadWithError(_ error: any Error) {}

    func showUpdateNotFoundWithError(_ error: any Error, acknowledgement: @escaping () -> Void) {
        cancellation = nil
        self.acknowledgement = acknowledgement
        updates.step { $0.noUpdate(Self.reason(error)) }
    }

    func showUpdaterError(_ error: any Error, acknowledgement: @escaping () -> Void) {
        cancellation = nil
        answer = nil
        self.acknowledgement = acknowledgement
        updates.step { $0.failed(Self.message(error)) }
    }

    func showDownloadInitiated(cancellation: @escaping () -> Void) {
        self.cancellation = cancellation
        updates.flow.downloadStarted()
    }

    func showDownloadDidReceiveExpectedContentLength(_ expectedContentLength: UInt64) { updates.flow.expect(expectedContentLength) }
    func showDownloadDidReceiveData(ofLength length: UInt64) { updates.flow.received(length) }

    /// A download can't be canceled once it's being unpacked.
    func showDownloadDidStartExtractingUpdate() {
        cancellation = nil
        updates.flow.preparing(nil)
    }

    func showExtractionReceivedProgress(_ progress: Double) { updates.flow.preparing(progress) }

    func showReady(toInstallAndRelaunch reply: @escaping (SPUUserUpdateChoice) -> Void) {
        answer = reply
        updates.step { $0.readyToInstall() }
    }

    /// Sparkle asks Pith to quit next, which it does at once.
    func showInstallingUpdate(withApplicationTerminated applicationTerminated: Bool, retryTerminatingApplication: @escaping () -> Void) {
        updates.flow.installing()
    }

    func showUpdateInstalledAndRelaunched(_ relaunched: Bool, acknowledgement: @escaping () -> Void) { acknowledgement() }

    func dismissUpdateInstallation() {
        answer = nil
        permission = nil
        cancellation = nil
        acknowledgement = nil
        updates.flow.dismissed()
        updates.settingsChanged()
    }

    func showUpdateInFocus() { updates.step { $0.focus() } }

    // MARK: Translation

    private static func offer(_ item: SUAppcastItem, downloaded: Bool) -> UpdateOffer {
        // Pith's feed embeds plain-text notes. HTML would show as markup, so it's left out.
        let notes = item.itemDescriptionFormat == "html" ? [] : UpdateOffer.paragraphs(item.itemDescription)
        return UpdateOffer(version: item.displayVersionString, notes: notes, size: item.contentLength > 0 ? item.contentLength : nil,
                           informationOnly: item.isInformationOnlyUpdate, page: item.infoURL, critical: item.isCriticalUpdate,
                           downloaded: downloaded)
    }

    private static func reason(_ error: any Error) -> NoUpdate {
        let info = (error as NSError).userInfo
        let latest = (info[SPULatestAppcastItemFoundKey] as? SUAppcastItem)?.displayVersionString
        guard let raw = (info[SPUNoUpdateFoundReasonKey] as? NSNumber)?.int32Value, let reason = SPUNoUpdateFoundReason(rawValue: raw) else {
            return .newest
        }
        switch reason {
        case .systemIsTooOld: return .needsNewerSystem(version: latest)
        case .systemIsTooNew: return .needsOlderSystem(version: latest)
        case .hardwareDoesNotSupportARM64: return .needsAppleSilicon(version: latest)
        case .unknown, .onLatestVersion, .onNewerThanLatestVersion: return .newest
        @unknown default: return .newest
        }
    }

    /// Pith's own words for the failures a person can do something about, and Sparkle's for the rest.
    private static func message(_ error: any Error) -> String {
        let error = error as NSError
        guard error.domain == SUSparkleErrorDomain, let code = SUError(rawValue: OSStatus(error.code)) else { return error.localizedDescription }
        switch code {
        case .downloadError:
            return "The download didn’t finish. Check the internet connection, then try again."
        case .appcastError, .appcastParseError:
            return "Pith couldn’t read the list of versions on GitHub. Check the internet connection, then try again later."
        case .signatureError, .validationError, .insufficientSigningError:
            return "The download isn’t signed by Pith’s publisher, so Pith didn’t install it."
        case .runningFromDiskImageError, .runningTranslocated:
            return "Pith is running from a temporary place. Move it to the Applications folder, open it from there, then update."
        case .installationWriteNoPermissionError:
            return "Pith can’t replace itself where it is. Move it to the Applications folder, then update."
        default:
            return error.localizedDescription
        }
    }

    // MARK: Configuration

    /// What's wrong with this bundle's update setup, for the smoke test: nothing when it's sound. A build signed only for
    /// this Mac has no feed and never updates. A Developer ID build must have the feed, the key and both of Sparkle's
    /// stricter checks, with Sparkle trimmed to what an app outside the sandbox uses and signed by the same team.
    static func configurationProblems(bundle: Bundle = .main, defaults: UserDefaults = .standard) -> [String] {
        let team = teamID(bundle.bundleURL)
        guard let feed = bundle.object(forInfoDictionaryKey: "SUFeedURL") as? String else {
            return team == nil ? [] : ["A Developer ID build has no update feed (SUFeedURL), so it would never update."]
        }
        var problems: [String] = []
        let url = URL(string: feed)
        if url?.scheme != "https" || url?.host != "github.com" || url?.lastPathComponent != "appcast.xml" {
            problems.append("The update feed \(feed) isn't an appcast served over HTTPS from GitHub.")
        }
        let key = (bundle.object(forInfoDictionaryKey: "SUPublicEDKey") as? String).flatMap { Data(base64Encoded: $0) }
        if key?.count != 32 { problems.append("SUPublicEDKey isn't a base64 Ed25519 public key.") }
        for flag in ["SUVerifyUpdateBeforeExtraction", "SURequireSignedFeed"] where bundle.object(forInfoDictionaryKey: flag) as? Bool != true {
            problems.append("\(flag) is off, so Sparkle would accept less than a signed feed and archive.")
        }
        // Sparkle reads a feed URL in the defaults ahead of Info.plist's; one left over from testing would hide releases.
        if let override = defaults.string(forKey: "SUFeedURL") { problems.append("The defaults override the feed with \(override).") }
        let framework = bundle.privateFrameworksURL?.appendingPathComponent("Sparkle.framework")
        if let framework, FileManager.default.fileExists(atPath: framework.path) {
            // The Sparkle Pith runs must be the copy inside it. dyld loads it through the framework's version symlinks, so
            // both paths are resolved before they're compared.
            if Bundle(for: SPUUpdater.self).bundleURL.resolvingSymlinksInPath() != framework.resolvingSymlinksInPath() {
                problems.append("Pith runs a Sparkle other than the one it bundles, at \(Bundle(for: SPUUpdater.self).bundleURL.path).")
            }
            if FileManager.default.fileExists(atPath: framework.appendingPathComponent("Versions/B/XPCServices").path) {
                problems.append("Sparkle's XPC services are bundled, though Pith isn't sandboxed and doesn't use them.")
            }
            if teamID(framework) != team { problems.append("Sparkle.framework isn't signed by the team that signed Pith.") }
        } else {
            problems.append("Sparkle.framework is missing from Contents/Frameworks.")
        }
        return problems
    }

    private static func teamID(_ url: URL) -> String? {
        var code: SecStaticCode?
        guard SecStaticCodeCreateWithPath(url as CFURL, [], &code) == errSecSuccess, let code else { return nil }
        var info: CFDictionary?
        guard SecCodeCopySigningInformation(code, SecCSFlags(rawValue: kSecCSSigningInformation), &info) == errSecSuccess,
              let info = info as? [String: Any] else { return nil }
        return info[kSecCodeInfoTeamIdentifier as String] as? String
    }
}
