import Foundation
import Security

/// A one-off scan with a native administrator authorization prompt. It installs no privileged helper. Only a
/// Developer ID signed scanner from this app's signing team can run, and its exact code hash is pinned before the
/// authorization prompt. The root process copies it into a root-owned private directory, verifies the copy there,
/// then runs it. Replacing the app's writable scanner between validation and launch cannot substitute root code.
public enum AdministratorScan {
    static let architecture: String = {
        #if arch(arm64)
        "arm64"
        #else
        "x86_64"
        #endif
    }()
    public static func availability(binary: URL) -> String? {
        do { _ = try identity(binary: binary); return nil }
        catch { return error.localizedDescription }
    }

    public static func scan(binary: URL, root: URL) async throws -> DiskResult {
        let identity = try await Task.detached(priority: .userInitiated) { try Self.identity(binary: binary) }.value
        let shell = try script(binary: binary, root: root, team: identity.team, codeHash: identity.hash)
        let output = try await MaintenanceProcess.authorizedScript(shell)
        var decoder = DiskStreamDecoder(), result: DiskResult?
        for event in try decoder.feed(output.data) + decoder.finish() {
            if case .result(let value) = event {
                guard result == nil else { throw DiskFailure("The administrator scan returned more than one map.") }
                result = value
            }
        }
        guard let result, result.root.path == root.path else { throw DiskFailure("The administrator scan did not return a map of the requested folder. Try a readable folder or grant Pith Full Disk Access.") }
        return result
    }

    static func script(binary: URL, root: URL, team: String, codeHash: String) throws -> String {
        guard team.range(of: #"^[A-Z0-9]{10}$"#, options: .regularExpression) != nil,
              codeHash.range(of: #"^[a-fA-F0-9]{40}$"#, options: .regularExpression) != nil,
              binary.isFileURL, root.isFileURL, !binary.path.utf8.contains(0), !root.path.utf8.contains(0) else {
            throw DiskFailure("The scanner has no valid Developer ID identity. Install a signed release of Pith to scan as administrator.")
        }
        let requirement = developerIDRequirement(team: team) + " and cdhash H\"\(codeHash)\""
        return """
        set -eu
        stage=$(/usr/bin/mktemp -d /private/tmp/app.bruhs.pith.scan.XXXXXXXX)
        trap '/bin/rm -rf "$stage"' EXIT
        /bin/cp -X \(MaintenanceCommand.quote(binary.path)) "$stage/storage-scanner"
        /bin/chmod 0500 "$stage/storage-scanner"
        /usr/bin/codesign --verify --strict --arch \(architecture) -R=\(MaintenanceCommand.quote(requirement)) "$stage/storage-scanner"
        /usr/bin/arch -\(architecture) "$stage/storage-scanner" scan --root \(MaintenanceCommand.quote(root.path))
        """
    }

    private static func developerIDRequirement(team: String) -> String {
        "anchor apple generic and certificate leaf[subject.OU] = \"\(team)\" and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists"
    }

    private static func identity(binary: URL) throws -> (team: String, hash: String) {
        var own: SecCode?
        guard SecCodeCopySelf([], &own) == errSecSuccess, let own, SecCodeCheckValidity(own, [], nil) == errSecSuccess else {
            throw DiskFailure("Pith's signature could not be verified. Install a signed release to scan as administrator.")
        }
        var staticOwn: SecStaticCode?
        var ownInfo: CFDictionary?
        guard SecCodeCopyStaticCode(own, [], &staticOwn) == errSecSuccess, let staticOwn,
              SecCodeCopySigningInformation(staticOwn, SecCSFlags(rawValue: kSecCSSigningInformation), &ownInfo) == errSecSuccess,
              let team = (ownInfo as? [String: Any])?[kSecCodeInfoTeamIdentifier as String] as? String,
              team.range(of: #"^[A-Z0-9]{10}$"#, options: .regularExpression) != nil else {
            throw DiskFailure("Scan as Administrator needs a Developer ID signed release of Pith. This development build has no signing team. Full Disk Access still works for protected personal folders.")
        }
        var code: SecStaticCode?, requirement: SecRequirement?
        guard SecRequirementCreateWithString(developerIDRequirement(team: team) as CFString, [], &requirement) == errSecSuccess,
              let requirement,
              SecStaticCodeCreateWithPathAndAttributes(binary as CFURL, [], [kSecCodeAttributeArchitecture as String: architecture] as CFDictionary, &code) == errSecSuccess, let code,
              SecStaticCodeCheckValidity(code, SecCSFlags(rawValue: kSecCSStrictValidate), requirement) == errSecSuccess else {
            throw DiskFailure("The bundled scanner is not signed by Pith's Developer ID team. Reinstall a signed release before scanning as administrator.")
        }
        var info: CFDictionary?
        guard SecCodeCopySigningInformation(code, SecCSFlags(rawValue: kSecCSSigningInformation), &info) == errSecSuccess,
              let hash = (info as? [String: Any])?[kSecCodeInfoUnique as String] as? Data, hash.count == 20 else {
            throw DiskFailure("The bundled scanner has no valid code-directory hash. Reinstall Pith before scanning as administrator.")
        }
        return (team, hash.map { String(format: "%02x", $0) }.joined())
    }
}
