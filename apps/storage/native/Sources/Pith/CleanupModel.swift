import AppKit
import Observation
import PithCore

@MainActor @Observable final class CleanupModel {
    enum Inspection {
        case idle, running
        case ready(CleanupReport)
        case failed(String)
    }

    enum Estimate {
        case none, running
        case measured(DiskFrees, Date)
        case failed(String)
    }

    var inspection: Inspection = .idle
    var estimate: Estimate = .none
    var selected: Set<String> = []
    var needsCheck = false
    var root: URL?
    var confirmation: TrashBatch?
    var problem: String?
    var preparing = false
    @ObservationIgnored let runner = CleanupRunner()
    @ObservationIgnored private var operation: Task<Void, Never>?
    @ObservationIgnored private var retiring: Task<Void, Never>?
    @ObservationIgnored private var measurement: Task<Void, Never>?
    @ObservationIgnored private var generation = UUID()

    var report: CleanupReport? {
        if case .ready(let report) = inspection { return report }
        return nil
    }

    var isInspecting: Bool { if case .running = inspection { return true }; return false }
    var isMeasuring: Bool { if case .running = estimate { return true }; return false }
    var chosen: [CleanupCandidate] { report?.candidates.filter { selected.contains($0.path) } ?? [] }
    var measured: DiskFrees? { if case .measured(let frees, _) = estimate { return frees }; return nil }
    var canMove: Bool { !chosen.isEmpty && !needsCheck && !preparing && measured?.unreadable == 0 }

    func inspect(_ root: URL, binary: URL) {
        guard !isInspecting else { return }
        let previous = operation ?? retiring
        cancel()
        let root = root.standardizedFileURL.resolvingSymlinksInPath()
        self.root = root
        inspection = .running
        selected = []; estimate = .none; needsCheck = false; problem = nil
        let id = UUID(); generation = id
        operation = Task { [weak self] in
            guard let self else { return }
            await previous?.value
            guard !Task.isCancelled else { return }
            do {
                let report = try await runner.analyze(binary: binary, root: root)
                guard !Task.isCancelled, generation == id else { return }
                inspection = .ready(report)
            } catch {
                guard !Task.isCancelled, generation == id else { return }
                inspection = .failed((error as? DiskFailure)?.message ?? error.localizedDescription)
            }
            if generation == id { operation = nil; retiring = nil }
        }
    }

    func cancel() {
        if let operation { retiring = operation }
        operation?.cancel(); operation = nil
        measurement?.cancel(); measurement = nil
        generation = UUID()
        if isInspecting { inspection = .idle }
        if isMeasuring { estimate = .none }
    }

    func toggle(_ candidate: CleanupCandidate, selected value: Bool) {
        guard candidate.canMoveToTrash, !needsCheck, !preparing else { return }
        if value { selected.insert(candidate.path) } else { selected.remove(candidate.path) }
        measurement?.cancel(); measurement = nil; estimate = .none; problem = nil
    }

    func measure(binary: URL) {
        guard !chosen.isEmpty, !isMeasuring, !needsCheck else { return }
        let paths = chosen.map(\.path), id = generation
        estimate = .running
        measurement = Task { [weak self] in
            do {
                let frees = try await ScannerRunner.frees(binary: binary, paths: paths)
                guard !Task.isCancelled, let self, generation == id, chosen.map(\.path) == paths else { return }
                estimate = .measured(frees, Date())
                measurement = nil
            } catch {
                guard !Task.isCancelled, let self, generation == id, chosen.map(\.path) == paths else { return }
                estimate = .failed((error as? DiskFailure)?.message ?? error.localizedDescription)
                measurement = nil
            }
        }
    }

    func prepareMove() {
        guard canMove, let report else { return }
        let paths = chosen.map(\.path), id = generation, home = FileManager.default.homeDirectoryForCurrentUser
        preparing = true
        Task { [weak self] in
            let plan = await Task.detached(priority: .userInitiated) { report.trashBatch(paths: paths, home: home) }.value
            guard let self else { return }
            preparing = false
            guard generation == id, chosen.map(\.path) == paths, !needsCheck else { return }
            switch plan {
            case .success(let batch): confirmation = batch
            case .failure(let failure): problem = failure.message
            }
        }
    }

    func diskWasEdited() {
        guard report != nil else { return }
        needsCheck = true
        measurement?.cancel(); measurement = nil; estimate = .none
    }
}
