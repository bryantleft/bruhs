//! What to list next, and when: the folders FSEvents named, each after it settles, each listed at most once at a
//! time, and the event ID through which every change is in the index.
//!
//! Only a parent's listing decides whether a folder is still there. A folder found missing from its path has its
//! parent listed instead, and is listed again if it turns up back in the tree, as when a folder above it moved. A
//! changed path the index doesn't have yet waits for its deepest known folder's listing, then is looked up again:
//! found, it's listed; still missing, it's gone.

use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use crate::index::{Index, Status, ROOT};
use crate::listing::{path_of_inode, Listing};
use crate::system::Purpose;

/// A folder to list.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Request {
    pub folder: u32,
    pub path: PathBuf,
    pub purpose: Purpose,
    pub deep: bool,
}

/// A path FSEvents named, waiting to be listed.
struct Pending {
    /// The first event ID that named it since it was last listed; none for a listing asked for directly.
    first: Option<u64>,
    noted: Instant,
    deep: bool,
    /// The deepest folder the index had on the path when it came due, listed for it.
    through: Option<u32>,
    /// That folder's listing hasn't landed yet.
    waiting: bool,
    /// Inodes of items the events named in it. A folder can move off before it's listed, as when files are written
    /// into a folder that's then moved: the path is gone, and an item's inode finds where the folder went.
    items: Vec<u64>,
    /// Pith asked for it (`ask`): it's listed past its folder's cooldown too.
    asked: bool,
}

/// Items kept per path to find a moved folder by: any one still there is enough, and a burst of thousands of files
/// written into one folder mustn't keep them all.
const ITEMS_KEPT: usize = 8;

/// A folder found away from its path, to list again once it's back in the tree.
#[derive(Clone, Copy, Debug)]
struct Deferred {
    /// The first event that sent it there, which the saved position mustn't pass until it's listed.
    first: Option<u64>,
    /// The parent whose listing decides whether it's still there; it waits for that listing to land.
    waits_on: Option<u32>,
    /// Listings in a row that found nothing at its path while its parent's still showed it.
    misses: u8,
}

/// Times in a row a folder's path may be empty while its parent's listing keeps it, before the scheduler stops
/// asking: something keeps it from being opened by the name its parent lists, and the daily check settles it.
const MISSES_KEPT: u8 = 3;

struct Flight {
    first: Option<u64>,
    purpose: Purpose,
    deep: bool,
    /// A check reached it while it was being listed for something else: its subfolders get checked after.
    check: bool,
    /// Asked for again while it was being listed: it's listed once more after.
    again: bool,
}

/// How far a check has got, and what it found.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct CheckReport {
    pub folders: u64,
    /// Folders whose totals or subfolders the check changed: what FSEvents didn't report.
    pub corrected: u64,
    /// Bytes those corrections moved.
    pub drift: u64,
}

/// What one listing did.
#[derive(Debug, Default)]
pub struct Landed {
    pub changed: bool,
    /// The check this listing finished, with what it found.
    pub checked: Option<CheckReport>,
}

pub struct Scheduler {
    /// How long a changed folder waits before it's listed.
    pub settle: Duration,
    /// A folder whose listing took long waits this many times as long before its next.
    pub cooldown_factor: u32,
    pending: HashMap<String, Pending>,
    /// Pending paths in the order they were noted, which is the order they come due.
    queue: VecDeque<String>,
    /// Due paths held back by a listing in flight or a cooldown.
    retry: Vec<String>,
    /// Paths waiting for each folder's listing.
    waiting_on: HashMap<u32, Vec<String>>,
    flights: HashMap<u32, Flight>,
    /// Folders found away from their path, to list again once back in the tree.
    deferred: HashMap<u32, Deferred>,
    cooldown: HashMap<u32, Instant>,
    /// Clone groups whose original was looked up lately, so thousands of copies of one file cost one lookup.
    originals: HashSet<u64>,
    check: Option<(usize, CheckReport)>,
    /// Listings for changes since the start, by folder: how many and how long they took, for `stats`.
    costs: HashMap<u32, (u64, Duration)>,
    /// Every event up to this ID is in the index.
    base: u64,
    received: u64,
}

impl Scheduler {
    pub fn new(settle: Duration, cooldown_factor: u32) -> Scheduler {
        Scheduler {
            settle,
            cooldown_factor,
            pending: HashMap::new(),
            queue: VecDeque::new(),
            retry: Vec::new(),
            waiting_on: HashMap::new(),
            flights: HashMap::new(),
            deferred: HashMap::new(),
            cooldown: HashMap::new(),
            originals: HashSet::new(),
            check: None,
            costs: HashMap::new(),
            base: 0,
            received: 0,
        }
    }

    /// Starts over for an index that holds every event up to `base`, as after a walk begins or a snapshot opens.
    pub fn reset(&mut self, base: u64) {
        *self = Scheduler::new(self.settle, self.cooldown_factor);
        self.base = base;
        self.received = base;
    }

    pub fn base(&self) -> u64 {
        self.base
    }

    pub fn received(&mut self, id: u64) {
        self.received = self.received.max(id);
    }

    /// Notes a changed folder to list once it settles, or at once.
    pub fn note(&mut self, path: String, first: Option<u64>, deep: bool, now: Instant, at_once: bool) {
        self.note_item(path, first, deep, now, at_once, None);
    }

    /// Notes a changed folder, with the inode of the item in it the event named.
    pub fn note_item(&mut self, path: String, first: Option<u64>, deep: bool, now: Instant, at_once: bool, item: Option<u64>) {
        let noted = if at_once { now.checked_sub(self.settle).unwrap_or(now) } else { now };
        match self.pending.get_mut(&path) {
            Some(pending) => {
                pending.deep |= deep;
                pending.first = earliest(pending.first, first);
                if let Some(item) = item.filter(|i| pending.items.len() < ITEMS_KEPT && !pending.items.contains(i)) {
                    pending.items.push(item);
                }
                if at_once && !pending.waiting {
                    pending.noted = noted;
                    self.retry.push(path);
                }
            }
            None => {
                self.pending.insert(path.clone(), Pending { first, noted, deep, through: None, waiting: false, items: item.into_iter().collect(), asked: false });
                if at_once {
                    self.retry.push(path);
                } else {
                    self.queue.push_back(path);
                }
            }
        }
    }

    /// A folder Pith asks to have listed again now: one the person moved an item out of or put one back in, or asked to
    /// have checked. It's listed at once, past the cooldown a slow listing put it in too, since the person waits on it;
    /// the cooldown keeps following a busy folder cheap, and the person asks rarely.
    pub fn ask(&mut self, path: String, deep: bool, now: Instant) {
        self.note(path.clone(), None, deep, now, true);
        if let Some(pending) = self.pending.get_mut(&path) {
            pending.asked = true;
        }
    }

    /// Asks for a folder to be listed. Returns the request to run, or none when it's being listed already, in which
    /// case it's listed again after, or a check goes on from it.
    pub fn submit(&mut self, folder: u32, path: PathBuf, purpose: Purpose, deep: bool, first: Option<u64>) -> Option<Request> {
        let checking = purpose == Purpose::Check;
        if let Some(flight) = self.flights.get_mut(&folder) {
            if checking {
                if !flight.check && flight.purpose != Purpose::Check {
                    flight.check = true;
                    if let Some((waiting, _)) = &mut self.check {
                        *waiting += 1;
                    }
                }
            } else {
                flight.again = true;
                flight.deep |= deep;
                flight.first = earliest(flight.first, first);
            }
            return None;
        }
        if checking {
            if let Some((waiting, _)) = &mut self.check {
                *waiting += 1;
            }
        }
        self.flights.insert(folder, Flight { first, purpose, deep, check: false, again: false });
        Some(Request { folder, path, purpose, deep })
    }

    /// The folders due for listing now.
    pub fn due(&mut self, index: &Index, now: Instant) -> Vec<Request> {
        let mut requests = Vec::new();
        let deferred: Vec<(u32, Deferred)> = self.deferred.iter().map(|(&id, &d)| (id, d)).collect();
        for (id, waiting) in deferred {
            if index.status(id) == Status::Free {
                self.deferred.remove(&id);
            } else if waiting.waits_on.is_none() && index.attached(id) && !self.flights.contains_key(&id) {
                self.deferred.remove(&id);
                requests.extend(self.submit(id, PathBuf::from(index.path(id)), Purpose::Relist, false, waiting.first));
            }
        }
        let mut due = std::mem::take(&mut self.retry);
        while let Some(front) = self.queue.front() {
            match self.pending.get(front) {
                Some(pending) if now < pending.noted + self.settle => break,
                Some(_) => due.push(self.queue.pop_front().unwrap()),
                None => {
                    self.queue.pop_front();
                }
            }
        }
        // Several paths can come down to one folder: whether to list it deep, the first event, and the paths it covers.
        type Group = (bool, Option<u64>, Vec<(String, bool)>);
        let mut folders: HashMap<u32, Group> = HashMap::new();
        let mut seen = HashSet::new();
        let mut moved = Vec::new();
        for path in due {
            if !seen.insert(path.clone()) {
                continue;
            }
            let Some(pending) = self.pending.get(&path) else { continue };
            if pending.waiting {
                continue;
            }
            let Some((folder, exact)) = index.find(&path) else {
                self.pending.remove(&path);
                continue;
            };
            if !exact && pending.through == Some(folder) {
                // Its deepest known folder was listed since and still doesn't have it: it's gone, or it moved, which
                // the items it held show: each still there is listed where it is now.
                let items = self.pending.remove(&path).map(|p| p.items).unwrap_or_default();
                let volume = PathBuf::from(index.path(ROOT));
                for item in items {
                    if let Some(parent) = path_of_inode(&volume, item).and_then(|p| p.parent().map(|p| p.to_string_lossy().into_owned())) {
                        if index.find(&parent).is_some() && parent != path {
                            moved.push(parent);
                        }
                    }
                }
                continue;
            }
            let cooling = !pending.asked && self.cooldown.get(&folder).is_some_and(|&until| now < until);
            if self.flights.contains_key(&folder) || cooling {
                self.retry.push(path);
                continue;
            }
            let group = folders.entry(folder).or_insert((false, None, Vec::new()));
            group.0 |= pending.deep && exact;
            if exact {
                group.1 = earliest(group.1, pending.first);
            }
            group.2.push((path, exact));
        }
        for (folder, (deep, first, paths)) in folders {
            for (path, exact) in paths {
                if exact {
                    self.pending.remove(&path);
                } else if let Some(pending) = self.pending.get_mut(&path) {
                    pending.through = Some(folder);
                    pending.waiting = true;
                    self.waiting_on.entry(folder).or_default().push(path);
                }
            }
            requests.extend(self.submit(folder, PathBuf::from(index.path(folder)), Purpose::Relist, deep, first));
        }
        for path in moved {
            self.note(path, None, false, now, true);
        }
        requests
    }

    /// Applies a listing that landed, and returns what to list next.
    pub fn landed(&mut self, index: &mut Index, request: &Request, listing: Listing, cost: Duration, now: Instant) -> (Vec<Request>, Landed) {
        let mut requests = Vec::new();
        let mut landed = Landed::default();
        let Some(flight) = self.flights.remove(&request.folder) else { return (requests, landed) };
        let checking = flight.purpose == Purpose::Check || flight.check;
        // Folders that went missing from this one are tried again now that its listing says whether they're there.
        for waiting in self.deferred.values_mut().filter(|d| d.waits_on == Some(request.folder)) {
            waiting.waits_on = None;
        }
        // What follows from a listing for a change holds the saved position back as the change itself did: a
        // snapshot taken before a subtree's listings land mustn't count the change as applied.
        let carried = if flight.purpose == Purpose::Relist { flight.first } else { None };
        // Paths that waited for this listing are looked up again.
        if let Some(paths) = self.waiting_on.remove(&request.folder) {
            for path in paths {
                if let Some(pending) = self.pending.get_mut(&path) {
                    pending.waiting = false;
                    self.retry.push(path);
                }
            }
        }
        if index.status(request.folder) == Status::Free {
            landed.checked = self.checked_one(checking, false, 0);
            return (requests, landed);
        }
        if !index.attached(request.folder) {
            // In limbo with a folder above it that moved: listed again once that folder is found.
            let misses = self.deferred.get(&request.folder).map_or(0, |d| d.misses);
            self.deferred.insert(request.folder, Deferred { first: carried, waits_on: None, misses });
            landed.checked = self.checked_one(checking, false, 0);
            return (requests, landed);
        }
        let current = PathBuf::from(index.path(request.folder));
        if current != request.path {
            // It moved while it was listed: listed again where it is now.
            let retried = Request { path: current, ..request.clone() };
            self.flights.insert(request.folder, flight);
            requests.push(retried);
            return (requests, landed);
        }
        let applied = index.apply(request.folder, &request.path, listing, request.deep, flight.purpose == Purpose::Walk);
        landed.changed = applied.changed;
        if flight.purpose == Purpose::Relist {
            let entry = self.costs.entry(request.folder).or_insert((0, Duration::ZERO));
            entry.0 += 1;
            entry.1 += cost;
        }
        for moved in index.take_rescans() {
            requests.extend(self.submit(moved, PathBuf::from(index.path(moved)), Purpose::Relist, true, carried));
        }
        let wait = cost * self.cooldown_factor;
        if wait > self.settle {
            self.cooldown.insert(request.folder, now + wait);
        } else {
            self.cooldown.remove(&request.folder);
        }
        if applied.missing {
            // Gone, or carried off by a folder above it that moved: its parent's listing tells which, and it waits for
            // that listing rather than being asked for again meanwhile.
            let misses = self.deferred.get(&request.folder).map_or(0, |d| d.misses) + 1;
            if misses <= MISSES_KEPT {
                self.deferred.insert(request.folder, Deferred { first: carried, waits_on: index.parent(request.folder), misses });
            } else {
                self.deferred.remove(&request.folder);
            }
            if let Some(parent) = index.parent(request.folder) {
                requests.extend(self.submit(parent, PathBuf::from(index.path(parent)), Purpose::Relist, false, carried));
            }
            landed.checked = self.checked_one(checking, false, 0);
            return (requests, landed);
        }
        self.deferred.remove(&request.folder);
        let next: Vec<(u32, PathBuf)> = if checking {
            index.child_ids(request.folder).into_iter().map(|child| (child, PathBuf::from(index.path(child)))).collect()
        } else {
            applied.next
        };
        let purpose = if checking { Purpose::Check } else { flight.purpose };
        for (child, path) in next {
            requests.extend(self.submit(child, path, purpose, checking || request.deep, if checking { None } else { carried }));
        }
        // A walk or a check lists every folder anyway, the originals' included.
        if flight.purpose == Purpose::Relist && !checking {
            for group in applied.originals {
                if !self.originals.insert(group) {
                    continue;
                }
                let Some(folder) = path_of_inode(&request.path, group).and_then(|p| p.parent().map(Path::to_path_buf)) else { continue };
                let folder = folder.to_string_lossy().into_owned();
                if index.find(&folder).is_some() {
                    self.note(folder, carried, false, now, true);
                }
            }
        }
        if flight.again {
            requests.extend(self.submit(request.folder, current, Purpose::Relist, flight.deep, flight.first));
        }
        landed.checked = self.checked_one(checking, flight.purpose == Purpose::Check && applied.changed, applied.drift);
        (requests, landed)
    }

    fn checked_one(&mut self, checking: bool, corrected: bool, drift: u64) -> Option<CheckReport> {
        if !checking {
            return None;
        }
        let (waiting, report) = self.check.as_mut()?;
        *waiting = waiting.saturating_sub(1);
        report.folders += 1;
        if corrected {
            report.corrected += 1;
            report.drift += drift;
        }
        if *waiting > 0 {
            return None;
        }
        self.check.take().map(|(_, report)| report)
    }

    /// Starts listing every folder again, from the root.
    pub fn start_check(&mut self, index: &Index) -> Option<Request> {
        if self.check.is_some() {
            return None;
        }
        self.check = Some((0, CheckReport::default()));
        self.submit(ROOT, PathBuf::from(index.path(ROOT)), Purpose::Check, true, None)
    }

    pub fn checking(&self) -> bool {
        self.check.is_some()
    }

    /// Whether the check under way waits on listings of `folders` and nothing else.
    pub fn check_waits_only_on(&self, folders: &HashSet<u32>) -> bool {
        self.check.is_some() && self.flights.iter().filter(|(_, f)| f.purpose == Purpose::Check || f.check).all(|(id, _)| folders.contains(id))
    }

    /// Ends the check under way with what it found so far. The folders it was waiting on are still listed when they
    /// can be, as for any change.
    pub fn end_check(&mut self) -> Option<CheckReport> {
        self.check.take().map(|(_, report)| report)
    }

    /// Whether no listing is in flight.
    pub fn idle(&self) -> bool {
        self.flights.is_empty()
    }

    /// Listings in flight, and those the check under way waits on.
    pub fn in_flight(&self) -> (usize, usize) {
        (self.flights.len(), self.check.as_ref().map_or(0, |(waiting, _)| *waiting))
    }

    /// Whether no listing is in flight but those of `waiting`.
    pub fn idle_except(&self, waiting: &HashSet<u32>) -> bool {
        self.flights.keys().all(|folder| waiting.contains(folder))
    }

    /// Folders waiting to be listed for a change, and being listed. Folders found missing aren't counted: most were
    /// deleted, and they wait only in case they turn up moved; counted, a busy Mac showed 56 waiting where 3 to 5 were.
    pub fn waiting(&self) -> usize {
        self.pending.len() + self.flights.values().filter(|f| f.purpose == Purpose::Relist).count()
    }

    /// The event ID through which every change is in the index: just before the earliest one still waiting.
    pub fn through(&self) -> u64 {
        let earliest = self
            .pending
            .values()
            .filter_map(|p| p.first)
            .chain(self.flights.values().filter_map(|f| f.first))
            .chain(self.deferred.values().filter_map(|d| d.first))
            .min();
        match earliest {
            Some(first) => self.base.max(first.saturating_sub(1)),
            None => self.base.max(self.received),
        }
    }

    /// When the next folder comes due, if one is waiting on time rather than on a listing.
    pub fn next_due(&self, now: Instant) -> Option<Instant> {
        let mut next = self.queue.front().and_then(|path| self.pending.get(path)).map(|p| p.noted + self.settle);
        if !self.retry.is_empty() {
            // Held back by a cooldown, or by a listing whose landing wakes the loop anyway.
            let cooled = self.cooldown.values().filter(|&&until| until > now).min().copied();
            let at = cooled.unwrap_or(now + Duration::from_millis(250));
            next = Some(next.map_or(at, |n| n.min(at)));
        }
        next
    }

    /// The folders listed most for changes, with how often and how long it took them, and the totals over all.
    pub fn costs(&self, index: &Index, top: usize) -> (u64, Duration, Vec<(String, u64, Duration)>) {
        let total = self.costs.values().map(|c| c.0).sum();
        let time = self.costs.values().map(|c| c.1).sum();
        let mut busiest: Vec<(u32, (u64, Duration))> = self.costs.iter().map(|(&f, &c)| (f, c)).collect();
        busiest.sort_unstable_by(|a, b| b.1 .1.cmp(&a.1 .1));
        let busiest = busiest.into_iter().take(top).map(|(f, (n, d))| (if index.is_live(f) { index.path(f) } else { format!("slot {f}") }, n, d)).collect();
        (total, time, busiest)
    }

    /// Forgets expired cooldowns and the originals looked up, so neither grows without end.
    pub fn tidy(&mut self, now: Instant) {
        self.cooldown.retain(|_, until| *until > now);
        self.originals.clear();
    }
}

fn earliest(a: Option<u64>, b: Option<u64>) -> Option<u64> {
    match (a, b) {
        (Some(a), Some(b)) => Some(a.min(b)),
        (a, b) => a.or(b),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_walk_or_a_check_ends_with_only_folders_waiting_on_macos_left() {
        let index = Index::new("/x", HashMap::new());
        let mut sched = Scheduler::new(Duration::from_secs(3), 200);
        assert!(sched.submit(7, PathBuf::from("/x/a"), Purpose::Walk, false, None).is_some());
        assert!(sched.submit(8, PathBuf::from("/x/b"), Purpose::Walk, false, None).is_some());
        assert!(!sched.idle_except(&HashSet::from([7])), "the other folder is still being listed");
        assert!(sched.idle_except(&HashSet::from([7, 8])));
        // A check reaching a folder that waits on macOS waits on it too, and on its own listings.
        assert!(sched.start_check(&index).is_some());
        assert!(sched.submit(7, PathBuf::from("/x/a"), Purpose::Check, true, None).is_none());
        assert!(!sched.check_waits_only_on(&HashSet::from([7, 8])), "the check's own listing of the root is under way");
        assert!(sched.check_waits_only_on(&HashSet::from([ROOT, 7, 8])));
        assert!(sched.end_check().is_some());
        assert!(!sched.checking());
        assert!(!sched.check_waits_only_on(&HashSet::from([ROOT, 7, 8])), "no check is under way");
    }
}
