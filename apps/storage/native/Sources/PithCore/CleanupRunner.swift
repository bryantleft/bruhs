import Foundation

/// One explicit cleanup inspection at a time, separate from the live map. Cancelling stops its scanner process.
public actor CleanupRunner {
    private var active = false
    private nonisolated let control = CleanupProcessControl()

    public init() {}
    public nonisolated func cancelImmediately() { control.cancel() }

    public func analyze(binary: URL, root: URL) async throws -> CleanupReport {
        guard !active else { throw DiskFailure("A cleanup inspection is already running. Wait for it or cancel it first.") }
        active = true
        control.prepare()
        defer { active = false; control.clear() }
        return try await withTaskCancellationHandler {
            try Task.checkCancellation()
            let process = Process(), output = Pipe(), errors = Pipe()
            process.executableURL = binary
            process.arguments = ["analyze", "--root", root.path]
            process.qualityOfService = .utility
            process.standardOutput = output; process.standardError = errors
            let (stream, continuation) = AsyncStream<Int32>.makeStream(bufferingPolicy: .bufferingNewest(1))
            process.terminationHandler = { process in continuation.yield(process.terminationStatus); continuation.finish() }
            do { try control.run(process) } catch { continuation.finish(); throw error }
            let terminated = Task.detached { for await status in stream { return status }; return Int32(-1) }
            let diagnostic = Task.detached { Self.read(errors.fileHandleForReading, keeping: 4096) }
            let result = Task.detached { () throws -> Data in
                let handle = output.fileHandleForReading
                defer { try? handle.close() }
                var data = Data()
                // The same 8 MiB evidence budget as the MCP report, so a native inspection cannot retain more.
                let budget = 8 << 20
                while true {
                    let chunk = handle.availableData
                    if chunk.isEmpty { return data }
                    guard chunk.count <= budget - data.count else {
                        throw DiskFailure("The cleanup report is larger than 8 MiB. Choose a smaller folder and Check Again.")
                    }
                    data.append(chunk)
                }
            }
            do {
                let data = try await result.value
                let status = await terminated.value, tail = await diagnostic.value
                try Task.checkCancellation()
                guard !data.isEmpty else { throw DiskFailure("The scanner exited with code \(status) without a cleanup report. \(tail)") }
                let report = try CleanupReport.decode(data, root: root)
                guard status == 0 else { throw DiskFailure("The cleanup inspection exited with code \(status). \(tail)") }
                return report
            } catch {
                if process.isRunning { process.terminate() }
                _ = await terminated.value
                _ = await diagnostic.value
                if Task.isCancelled { throw CancellationError() }
                throw error
            }
        } onCancel: { control.cancel() }
    }

    private nonisolated static func read(_ handle: FileHandle, keeping count: Int) -> String {
        defer { try? handle.close() }
        var tail = Data()
        while true {
            let chunk = handle.availableData
            if chunk.isEmpty { return String(decoding: tail, as: UTF8.self) }
            tail.append(chunk)
            tail = Data(tail.suffix(count))
        }
    }
}

private final class CleanupProcessControl: @unchecked Sendable {
    private let lock = NSLock()
    private var process: Process?
    private var cancelled = false

    func prepare() { lock.lock(); cancelled = false; lock.unlock() }

    func run(_ process: Process) throws {
        lock.lock(); defer { lock.unlock() }
        guard !cancelled else { throw CancellationError() }
        try process.run()
        self.process = process
    }

    func cancel() {
        lock.lock(); defer { lock.unlock() }
        cancelled = true
        if process?.isRunning == true { process?.terminate() }
    }

    func clear() { lock.lock(); process = nil; cancelled = false; lock.unlock() }
}
