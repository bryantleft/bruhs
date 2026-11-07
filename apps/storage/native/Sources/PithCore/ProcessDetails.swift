import Foundation
import Security

/// Details the inspector reads only when it opens, since they cost more than a sample can afford: a code signature
/// took 152 ms to validate, so Pith reads who signed it without validating, and caches it by path.
public enum ProcessDetails {
    /// The command line a process started with, after its executable; nil for another user's process, which macOS
    /// won't show.
    public static func arguments(_ pid: Int32) -> [String]? {
        var mib: [Int32] = [CTL_KERN, KERN_PROCARGS2, pid]
        var size = 0
        guard sysctl(&mib, 3, nil, &size, nil, 0) == 0, size > MemoryLayout<Int32>.size else { return nil }
        var buffer = [UInt8](repeating: 0, count: size)
        guard sysctl(&mib, 3, &buffer, &size, nil, 0) == 0 else { return nil }
        // argc, the executable path, padding, then argc arguments, each ending in a NUL.
        let argc = buffer.withUnsafeBytes { $0.load(as: Int32.self) }
        var index = MemoryLayout<Int32>.size
        while index < size, buffer[index] != 0 { index += 1 }
        while index < size, buffer[index] == 0 { index += 1 }
        var arguments: [String] = []
        while arguments.count < argc, index < size {
            let start = index
            while index < size, buffer[index] != 0 { index += 1 }
            arguments.append(String(decoding: buffer[start..<index], as: UTF8.self))
            index += 1
        }
        return Array(arguments.dropFirst())
    }

    private static let signers = Signers()

    /// Who signed the code at `path`, as Finder's Get Info and `codesign` name it: "Apple", a developer's name, "Signed
    /// on this Mac" for an ad hoc signature, or "Not signed".
    public static func signer(_ path: String) -> String? { signers.signer(path) }

    private final class Signers: @unchecked Sendable {
        private let lock = NSLock()
        private var cache: [String: String?] = [:]

        func signer(_ path: String) -> String? {
            lock.lock(); if let cached = cache[path] { lock.unlock(); return cached }; lock.unlock()
            let found = read(path)
            lock.lock(); cache[path] = found; lock.unlock()
            return found
        }

        private func read(_ path: String) -> String? {
            guard !path.isEmpty else { return nil }
            var code: SecStaticCode?
            guard SecStaticCodeCreateWithPath(URL(fileURLWithPath: path) as CFURL, [], &code) == errSecSuccess, let code else { return "Not signed" }
            var info: CFDictionary?
            guard SecCodeCopySigningInformation(code, SecCSFlags(rawValue: kSecCSSigningInformation), &info) == errSecSuccess,
                  let details = info as? [String: Any] else { return nil }
            // Code signed as part of macOS carries a platform identifier, whatever its certificate is called.
            if details[kSecCodeInfoPlatformIdentifier as String] != nil { return "Apple" }
            if let flags = details[kSecCodeInfoFlags as String] as? UInt32, flags & 0x2 != 0 { return "Signed on this Mac" } // kSecCodeSignatureAdhoc
            guard let certificates = details[kSecCodeInfoCertificates as String] as? [SecCertificate], let leaf = certificates.first else {
                return details[kSecCodeInfoIdentifier as String] == nil ? "Not signed" : "Signed on this Mac"
            }
            let summary = SecCertificateCopySubjectSummary(leaf) as String? ?? ""
            // Apple's own signing certificates: "Software Signing" on macOS 26, "macOS Software Signing" on the macOS
            // that GitHub's runners use.
            if summary.hasSuffix("Software Signing") || summary.hasPrefix("Apple Code Signing") { return "Apple" }
            // The Mac App Store signs apps with Apple's certificate on the developer's behalf.
            if summary.hasPrefix("Apple Mac OS Application Signing") { return "Mac App Store" }
            // "Developer ID Application: Google LLC (EQHXZ8M8AV)" names the developer between the colon and the team.
            if let colon = summary.firstIndex(of: ":") {
                let name = summary[summary.index(after: colon)...].trimmingCharacters(in: .whitespaces)
                return name.components(separatedBy: " (").first ?? name
            }
            return summary.isEmpty ? nil : summary
        }
    }

    /// Bytes deleting the file would free now: its blocks that no clone or snapshot shares. Nil when the file
    /// system doesn't say, as on a disk that isn't APFS.
    public static func freesNow(_ path: String) -> UInt64? {
        var list = attrlist()
        list.bitmapcount = u_short(ATTR_BIT_MAP_COUNT)
        list.forkattr = attrgroup_t(ATTR_CMNEXT_PRIVATESIZE)
        var buffer = (UInt32(0), UInt32(0), UInt32(0), UInt32(0))
        let status = withUnsafeMutableBytes(of: &buffer) { getattrlist(path, &list, $0.baseAddress, $0.count, UInt32(FSOPT_ATTR_CMN_EXTENDED | FSOPT_NOFOLLOW)) }
        guard status == 0, buffer.0 >= 12 else { return nil }
        let size = UInt64(buffer.1) | UInt64(buffer.2) << 32
        return Int64(bitPattern: size) >= 0 ? size : nil
    }
}
