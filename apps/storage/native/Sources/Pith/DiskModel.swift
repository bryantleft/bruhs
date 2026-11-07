import AppKit
import Observation
import PithCore

/// Files, bytes and unreadable folders counted so far by a running scan.
struct DiskProgress: Equatable {
    let files: UInt64
    let bytes: UInt64
    let errors: UInt64
}

@MainActor @Observable final class DiskModel {
    var result: DiskResult?
    var scannedAt: Date?
    var selected: String?
    /// Bytes of the selected item, shown next to its path.
    private(set) var selectedSize: UInt64?
    var error: String?
    var isScanning = false
    var isTrashing = false
    var revision = UUID()
    /// The folder being scanned, or the one the map shows.
    private(set) var scope: String?
    private(set) var progress: DiskProgress?
    /// How the last scan ended when it didn't produce a map.
    private(set) var note: String?
    private let runner = ScannerRunner()
    private var operation: Task<Void, Never>?
    private var generation = UUID()
    var binary: URL { Bundle.main.bundleURL.appendingPathComponent("Contents/MacOS/storage-scanner") }

    /// A figure under the scope, such as "Files 123,697".
    struct Figure: Hashable {
        let label: String
        let value: String
    }

    /// The line under the scope: figures while scanning and for the map it holds, or a message about the scan.
    enum Caption: Equatable {
        case message(String)
        case figures([Figure])
    }

    var caption: Caption? {
        if isScanning {
            guard let progress else { return .message("Starting the scan…") }
            return .figures([Figure(label: "Size", value: bytes(progress.bytes)), Figure(label: "Files", value: monaspaced(progress.files.formatted()))])
        }
        if let result, let scannedAt {
            return .figures([
                Figure(label: "Size", value: bytes(result.summary.bytes)),
                Figure(label: "Files", value: monaspaced(result.summary.files.formatted())),
                Figure(label: "Scanned", value: monaspaced(scannedAt.formatted(date: .omitted, time: .shortened))),
            ])
        }
        return note.map { .message(monaspaced($0)) }
    }

    /// Folders the last scan couldn't read, so its map leaves them out.
    var unreadableFolders: UInt64 { result?.summary.errors ?? 0 }

    func chooseFolder() {
        let picker = NSOpenPanel()
        picker.canChooseDirectories = true; picker.canChooseFiles = false
        picker.allowsMultipleSelection = false; picker.prompt = "Scan Folder"
        if picker.runModal() == .OK, let root = picker.url { scan(root) }
    }

    func scan(_ root: URL) {
        guard !isTrashing, !isScanning else { return }
        operation?.cancel()
        let id = UUID(); generation = id
        error = nil; note = nil; progress = nil; select(nil); isScanning = true
        result = nil; revision = UUID()
        let root = root.standardizedFileURL.resolvingSymlinksInPath()
        scope = root.path
        operation = Task {
            defer { if generation == id { isScanning = false } }
            await runner.cancel()
            do {
                let value = try await runner.scan(binary: binary, root: root) { [weak self] event in
                    await self?.record(event, generation: id)
                }
                guard !Task.isCancelled, generation == id else { return }
                result = value; scannedAt = Date(); revision = UUID()
            } catch {
                guard generation == id else { return }
                if Task.isCancelled { note = "Scan cancelled." }
                else { self.error = error.localizedDescription; note = "The scan didn’t finish." }
            }
        }
    }

    private func record(_ event: DiskEvent, generation id: UUID) {
        guard generation == id, isScanning else { return }
        if case .progress(let files, let size, let errors) = event {
            progress = DiskProgress(files: files, bytes: size, errors: errors)
        }
    }

    func cancel() {
        operation?.cancel()
        // Keep the operation busy until its subprocess and pipes have drained.
        runner.cancelImmediately()
    }

    /// Selects a real item from the current scan; anything else clears the selection.
    func select(_ path: String?) {
        guard let path, let result else { selected = nil; selectedSize = nil; return }
        let size = result.root.entries.first(where: { $0.path == path && $0.kind != .aggregate })?.size
            ?? result.topFiles.first(where: { $0.path == path })?.size
        selected = size == nil ? nil : path
        selectedSize = size
    }

    func trash(_ path: String) {
        guard let result, !isScanning, !isTrashing else { return }
        isTrashing = true; error = nil
        operation = Task {
            do {
                let target = try TrashPolicy.resolve(path, result: result, home: FileManager.default.homeDirectoryForCurrentUser)
                try await runner.trash(binary: binary, target: target)
                select(nil)
                isTrashing = false
                // Rescan, rather than inventing disk savings from a stale snapshot.
                scan(URL(fileURLWithPath: result.root.path))
            } catch {
                self.error = error.localizedDescription; isTrashing = false
            }
        }
    }
}

/// Monaspace has no narrow no-break space, which the locale puts in times ("1:57 PM") and some locales' thousands. A
/// fallback font would draw it at its own width, so use the font's no-break space instead.
private func monaspaced(_ text: String) -> String {
    text.replacingOccurrences(of: "\u{202F}", with: "\u{00A0}")
}
