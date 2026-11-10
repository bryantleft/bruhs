import XCTest
@testable import PithCore

/// Listing the mounted volumes can block for as long as a hung network share takes to answer. Pith lists them on a
/// serial queue of its own, never Swift's shared pool, and never two listings at once: refreshes asked for while one
/// runs wait for it, and become one more listing after it.
final class VolumeListerTests: XCTestCase {
    /// A listing a test holds until it lets it go, as a hung share holds one, counting the listings and how many ran at
    /// once.
    private final class Listings: @unchecked Sendable {
        private let lock = NSLock()
        private var count = 0, running = 0, most = 0
        private var onQueue: [Bool] = []
        let started = DispatchSemaphore(value: 0)
        let release = DispatchSemaphore(value: 0)
        let key = DispatchSpecificKey<String>()

        func list() -> Int {
            lock.lock()
            count += 1; running += 1; most = max(most, running)
            let number = count
            onQueue.append(DispatchQueue.getSpecific(key: key) == "volumes")
            lock.unlock()
            started.signal()
            release.wait()
            lock.lock(); running -= 1; lock.unlock()
            return number
        }

        var made: (count: Int, most: Int, onQueue: [Bool]) {
            lock.lock(); defer { lock.unlock() }
            return (count, most, onQueue)
        }
    }

    private final class Found: @unchecked Sendable {
        private let lock = NSLock()
        private var lists: [Int] = []
        func add(_ list: Int) { lock.lock(); lists.append(list); lock.unlock() }
        var all: [Int] { lock.lock(); defer { lock.unlock() }; return lists }
    }

    func testRefreshesWhileAListingHangsBecomeOneMoreListingAfterIt() {
        let listings = Listings(), found = Found()
        let queue = DispatchQueue(label: "test.volumes")
        queue.setSpecific(key: listings.key, value: "volumes")
        let done = expectation(description: "two listings handed on")
        done.expectedFulfillmentCount = 2
        let lister = VolumeLister(queue: queue, list: { listings.list() }) { list in
            found.add(list)
            done.fulfill()
        }
        lister.refresh()
        XCTAssertEqual(listings.started.wait(timeout: .now() + 5), .success, "the first listing began")
        // The share hangs: the disk menu opens, a disk mounts and Disk comes on screen meanwhile.
        for _ in 0..<5 { lister.refresh() }
        XCTAssertEqual(listings.made.count, 1, "nothing else runs while the first listing hangs")
        listings.release.signal()
        XCTAssertEqual(listings.started.wait(timeout: .now() + 5), .success, "one more listing, after it")
        listings.release.signal()
        wait(for: [done], timeout: 5)
        queue.sync {}
        XCTAssertEqual(listings.made.count, 2)
        XCTAssertEqual(listings.made.most, 1, "never two listings at once")
        XCTAssertEqual(listings.made.onQueue, [true, true], "on the lister's own queue, not Swift's shared pool")
        XCTAssertEqual(found.all, [1, 2], "each listing's volumes, the last one last")
    }

    func testARefreshAfterAListingEndedListsAgain() {
        let listings = Listings(), found = Found()
        let queue = DispatchQueue(label: "test.volumes.again")
        let first = expectation(description: "first"), second = expectation(description: "second")
        let lister = VolumeLister(queue: queue, list: { listings.list() }) { list in
            found.add(list)
            (list == 1 ? first : second).fulfill()
        }
        lister.refresh()
        listings.release.signal()
        wait(for: [first], timeout: 5)
        queue.sync {}
        lister.refresh()
        listings.release.signal()
        wait(for: [second], timeout: 5)
        XCTAssertEqual(found.all, [1, 2])
    }
}
