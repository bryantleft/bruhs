import Foundation

/// Lists the mounted volumes, as `list` does, on a serial queue of its own and one listing at a time. A network share
/// that hangs blocks the capacity lookup asked of it, and cancelling a task doesn't stop that: run on Swift's shared
/// pool, every listing then held a pool thread, and once as many had begun as the Mac has cores, every task Pith runs
/// there stalled behind them, the live map's among them. Here a hung share holds this queue alone. A refresh asked for
/// while a listing runs waits for it, and however many come meanwhile, one more listing runs after it, so what `found`
/// gets last is never older than the last refresh.
public final class VolumeLister<Volumes: Sendable>: @unchecked Sendable {
    private let queue: DispatchQueue
    private let list: @Sendable () -> Volumes
    private let found: @Sendable (Volumes) -> Void
    private let lock = NSLock()
    /// A listing is under way, on `queue`.
    private var listing = false
    /// A refresh came while it ran, so one more listing follows it.
    private var again = false

    /// Lists with `list` on `queue`, a queue of its own unless a test gives one, and hands each listing to `found`, on
    /// that queue.
    public init(queue: DispatchQueue = DispatchQueue(label: "app.bruhs.pith.volumes", qos: .userInitiated), list: @escaping @Sendable () -> Volumes,
                found: @escaping @Sendable (Volumes) -> Void) {
        self.queue = queue
        self.list = list
        self.found = found
    }

    /// Lists the volumes now, or once the listing under way ends.
    public func refresh() {
        lock.lock(); defer { lock.unlock() }
        guard !listing else { again = true; return }
        listing = true
        queue.async { self.run() }
    }

    private func run() {
        while true {
            found(list())
            lock.lock()
            guard again else {
                listing = false
                lock.unlock()
                return
            }
            again = false
            lock.unlock()
        }
    }
}
