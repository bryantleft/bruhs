import Foundation

private final class ScannerControl: @unchecked Sendable {
    private let lock = NSLock()
    private var process: Process?
    func run(_ process: Process) throws {
        lock.lock(); defer { lock.unlock() }
        try process.run()
        self.process = process
    }
    func cancel() {
        lock.lock(); defer { lock.unlock() }
        if process?.isRunning == true { process?.terminate() }
    }
    func clear() { lock.lock(); process = nil; lock.unlock() }
}

public actor ScannerRunner {
    private var active: Process?
    private nonisolated let control = ScannerControl()
    public init() {}
    public func cancel() { control.cancel() }
    // AppKit termination cannot wait for a task queued on the main actor.
    public nonisolated func cancelImmediately() { control.cancel() }

    /// Scans `root`. `within` is the map it's a folder of, when a folder is scanned again: clone groups whose first
    /// copy lies elsewhere on that map stay counted there.
    public func scan(binary: URL, root: URL, within: URL? = nil, onProgress: @escaping @Sendable (DiskEvent) async -> Void) async throws -> DiskResult {
        guard active == nil else { throw DiskFailure("A scanner operation is already running.") }
        let process = Process()
        let stdout = Pipe(), stderr = Pipe()
        process.executableURL = binary
        process.arguments = ["scan", "--root", root.path] + (within.map { ["--within", $0.path] } ?? [])
        process.standardOutput = stdout; process.standardError = stderr
        let (termination, exitStream) = Self.terminationWaiter(process)
        do { try control.run(process) } catch { exitStream.finish(); throw error }
        active = process
        defer { active = nil; control.clear() }
        let errors = Task.detached { Self.errorTail(stderr.fileHandleForReading) }
        let output = Task.detached { () throws -> DiskResult in
            let handle = stdout.fileHandleForReading
            defer { try? handle.close() }
            var decoder = DiskStreamDecoder()
            var result: DiskResult?
            while true {
                let data = handle.availableData
                let events = try data.isEmpty ? decoder.finish() : decoder.feed(data)
                for event in events {
                    switch event {
                    case .result(let value):
                        guard result == nil else { throw DiskFailure("The scanner sent more than one result.") }
                        result = value
                    case .progress: await onProgress(event)
                    }
                }
                if data.isEmpty { break }
            }
            guard let result else { throw DiskFailure("The scanner exited without a result. Try scanning a readable folder.") }
            guard result.root.path == root.path else { throw DiskFailure("The scanner returned a different scan root.") }
            return result
        }
        return try await withTaskCancellationHandler {
            do {
                let result = try await output.value
                let status = await termination.value
                let diagnostic = await errors.value
                try Task.checkCancellation()
                guard status == 0 else { throw DiskFailure("The scanner exited with code \(status). \(diagnostic)") }
                return result
            } catch {
                let wasCancelled = Task.isCancelled
                if process.isRunning { process.terminate() }
                let status = await termination.value
                let diagnostic = await errors.value
                if wasCancelled { throw CancellationError() }
                // The scanner's own failures are already sentences for the user; the exit code would only add noise.
                if let failure = error as? DiskFailure, failure.isComplete { throw failure }
                throw DiskFailure("\(error.localizedDescription) Exit code \(status). \(diagnostic)")
            }
        } onCancel: {
            if process.isRunning { process.terminate() }
        }
    }

    /// What deleting `paths` frees now, measured by the scanner's `frees` command. It runs beside any scan, at utility
    /// priority, and cancelling the task stops it.
    public static func frees(binary: URL, paths: [String]) async throws -> DiskFrees {
        let process = Process(), output = Pipe(), errors = Pipe()
        process.executableURL = binary
        process.arguments = ["frees"] + paths.flatMap { ["--path", $0] }
        process.standardOutput = output; process.standardError = errors
        process.qualityOfService = .utility
        let (termination, exitStream) = terminationWaiter(process)
        do { try process.run() } catch { exitStream.finish(); throw error }
        let diagnostics = Task.detached { errorTail(errors.fileHandleForReading) }
        return try await withTaskCancellationHandler {
            let data = await Task.detached { output.fileHandleForReading.readDataToEndOfFile() }.value
            let status = await termination.value
            let tail = await diagnostics.value
            try Task.checkCancellation()
            guard let line = data.split(separator: 10).last else {
                throw DiskFailure("The scanner exited with code \(status) without measuring. \(tail)")
            }
            return try DiskFrees.decode(Data(line))
        } onCancel: {
            if process.isRunning { process.terminate() }
        }
    }

    private nonisolated static func terminationWaiter(_ process: Process) -> (Task<Int32, Never>, AsyncStream<Int32>.Continuation) {
        // One exit event, registered before launch. waitUntilExit can strand a
        // run-loop notification when a Swift actor resumes on another thread.
        let (stream, continuation) = AsyncStream<Int32>.makeStream(bufferingPolicy: .bufferingNewest(1))
        process.terminationHandler = { process in
            continuation.yield(process.terminationStatus)
            continuation.finish()
        }
        let task = Task.detached {
            for await status in stream { return status }
            return Int32(-1)
        }
        return (task, continuation)
    }

    private nonisolated static func errorTail(_ handle: FileHandle) -> String {
        defer { try? handle.close() }
        var tail = Data()
        while true {
            let data = handle.availableData
            if data.isEmpty { break }
            tail.append(data)
            // Match the existing scanner-server diagnostic tail, not the full output.
            tail = Data(tail.suffix(4096))
        }
        return String(decoding: tail, as: UTF8.self)
    }
}
