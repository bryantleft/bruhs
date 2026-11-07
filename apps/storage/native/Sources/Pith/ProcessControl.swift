import AppKit
import PithCore
import PithSystem

/// A quit Pith was asked for, waiting for the user to confirm it.
struct QuitRequest: Identifiable, Equatable {
    let appID: String
    let name: String
    let kind: ProcessKind
    let members: [ProcessKey]
    var id: String { appID }
}

/// How a quit went, said once in Activity.
struct QuitOutcome: Equatable {
    let appID: String
    let message: String
    /// The app was asked to quit and is still running a few seconds later, so Force Quit is the next step.
    var offersForceQuit = false
    var isProblem = false
}

/// Quits apps and processes the user owns. macOS has no way to signal a process by identity and reuses PIDs, so each
/// signal goes only after the process's start time is read again and still matches.
@MainActor enum ProcessControl {
    /// Why Pith won't offer Quit for a group, or nil when it will.
    static func refusal(kind: ProcessKind, members: [ProcessKey], isRunning: Bool) -> String? {
        if !isRunning { return "It has already quit." }
        if kind == .system { return "macOS needs its own processes, so Pith doesn't quit them." }
        let own = ProcessInfo.processInfo.processIdentifier
        if members.contains(where: { $0.pid == own }) { return "Quit Pith from its menu instead." }
        if members.isEmpty || members.allSatisfy({ $0.pid <= 1 }) { return "This process can't be quit." }
        return nil
    }

    /// Asks the group to quit: an app with a Dock icon as its own Quit command does, so it can ask to save; anything
    /// else with SIGTERM to the process that owns the group, which lets it clean up first.
    static func quit(_ request: QuitRequest) -> QuitOutcome {
        if let app = runningApp(request.members) {
            return app.terminate()
                ? QuitOutcome(appID: request.appID, message: "Pith asked \(request.name) to quit. It may ask you to save first.")
                : QuitOutcome(appID: request.appID, message: "\(request.name) didn't accept the request to quit.", offersForceQuit: true, isProblem: true)
        }
        return signal(request, SIGTERM, done: "Pith asked \(request.name) to quit.")
    }

    /// Ends the group at once, unsaved work and all.
    static func forceQuit(_ request: QuitRequest) -> QuitOutcome {
        if let app = runningApp(request.members), app.forceTerminate() {
            return QuitOutcome(appID: request.appID, message: "\(request.name) was forced to quit.")
        }
        let outcome = signal(request, SIGKILL, done: "\(request.name) was forced to quit.")
        // Its helpers too, so none outlives it unwatched.
        let first = owner(request.members)
        for member in request.members where member != first { _ = send(SIGKILL, to: member) }
        return outcome
    }

    /// Whether any of the group's processes, as they were, still runs.
    static func isRunning(_ members: [ProcessKey]) -> Bool {
        members.contains { pith_start_time($0.pid) == $0.started }
    }

    /// The group's app with a Dock icon, which NSRunningApplication can ask to quit.
    private static func runningApp(_ members: [ProcessKey]) -> NSRunningApplication? {
        let keys = Set(members)
        return NSWorkspace.shared.runningApplications.first { app in
            app.activationPolicy == .regular && keys.contains { $0.pid == app.processIdentifier }
        }
    }

    /// The oldest process, which started the others: the owner the sampler groups helpers under.
    private static func owner(_ members: [ProcessKey]) -> ProcessKey? { members.min { $0.started < $1.started } }

    private static func signal(_ request: QuitRequest, _ signal: Int32, done: String) -> QuitOutcome {
        guard let owner = owner(request.members) else { return QuitOutcome(appID: request.appID, message: "\(request.name) has no process to quit.", isProblem: true) }
        switch send(signal, to: owner) {
        case 0: return QuitOutcome(appID: request.appID, message: done)
        case ESRCH: return QuitOutcome(appID: request.appID, message: "\(request.name) had already quit.")
        case EPERM: return QuitOutcome(appID: request.appID, message: "\(request.name) belongs to another user or to macOS, so Pith can't quit it.", isProblem: true)
        case let code: return QuitOutcome(appID: request.appID, message: "Pith couldn't quit \(request.name): \(String(cString: strerror(code))).", isProblem: true)
        }
    }

    /// Sends `signal` if the PID still belongs to the same process; returns 0 or the errno.
    private static func send(_ signal: Int32, to key: ProcessKey) -> Int32 {
        let own = ProcessInfo.processInfo.processIdentifier
        guard key.pid > 1, key.pid != own else { return EPERM }
        // The start time names the process; a different one means the PID now belongs to another.
        guard pith_start_time(key.pid) == key.started else { return ESRCH }
        return kill(key.pid, signal) == 0 ? 0 : errno
    }
}
