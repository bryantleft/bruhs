//! Threads that list folders for the live index. Work someone is waiting on goes first; the daily check runs on at
//! most `idle_limit` threads at a time, so it never takes the whole Mac.
//!
//! Opening a folder macOS protects, such as iCloud Drive's or another app's data, waits until the person answers
//! macOS's question about Pith, however long that takes. A listing still opening after `STUCK` is taken to be waiting
//! so. Its thread is replaced, so the rest of the disk goes on being listed, and its kin wait behind a few probes: one
//! question usually covers every folder in a parent, as in iCloud Drive's, or every folder of one name beside its
//! parent, as every app container's Data folder, and each would hold a thread too.

use std::collections::{HashMap, VecDeque};
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use crate::listing::Listing;
use crate::system::{set_thread_purpose, Purpose};

/// How long opening a folder takes before its listing counts as waiting on macOS. Opening one takes microseconds even
/// mid-walk, when the development Mac's 12 threads open 22,000 a second; half a second is waiting on something else.
/// Each moment before a listing is caught, the threads can take more folders behind the same question.
pub const STUCK: Duration = Duration::from_millis(500);
/// Probes caught waiting before the rest of a parent's folders are held until an answer. macOS asks separately about
/// Desktop, Documents and Downloads, which share the home folder, so a fourth probe there finds a folder no question
/// covers and lets the others go; in a folder that one question covers whole, as iCloud Drive's, three hold a thread
/// each and the rest wait.
const PROBES: usize = 3;

/// Lists a folder, calling the function it's given once opening the folder is over.
pub type Lister = dyn Fn(&Path, &mut dyn FnMut()) -> Listing + Send + Sync;

pub struct Job {
    pub folder: u32,
    pub path: PathBuf,
    pub purpose: Purpose,
    /// List every subfolder again too.
    pub deep: bool,
    /// The index the job was made for: a listing for an index that's since been replaced is dropped.
    pub epoch: u32,
}

pub struct Done {
    pub job: Job,
    pub listing: Listing,
    /// How long the listing took, which sets how soon the folder may be listed again.
    pub cost: Duration,
}

pub struct Pool {
    shared: Arc<Shared>,
}

struct Shared {
    state: Mutex<State>,
    /// Threads wait here for jobs.
    ready: Condvar,
    /// The watcher waits here for a listing to start.
    started: Condvar,
    lister: Arc<Lister>,
    done: Arc<dyn Fn(Done) + Send + Sync>,
    /// Told when listings are caught waiting on macOS, and when they land.
    stalled: Arc<dyn Fn() + Send + Sync>,
    /// Threads kept however little there is to do.
    base: usize,
    /// Threads at most, those replacing ones caught waiting included.
    most: usize,
    idle_limit: usize,
    stuck: Duration,
}

struct State {
    /// Taken newest first: during a walk that goes deep before it goes wide, so the folders waiting stay few.
    urgent: Vec<Job>,
    idle: VecDeque<Job>,
    idle_running: usize,
    closed: bool,
    threads: usize,
    next_thread: usize,
    /// Listings under way, by thread.
    running: HashMap<usize, Running>,
    /// The kin of folders caught waiting on macOS, which wait behind probes.
    gates: HashMap<Kin, Gate>,
    /// The watcher waits for a listing to start, rather than for one to be caught.
    watcher_asleep: bool,
}

/// Folders likely behind the same question from macOS as one caught waiting.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
enum Kin {
    /// In the same folder.
    Siblings(PathBuf),
    /// Of the same name, in folders in the same folder.
    Namesakes(PathBuf, OsString),
}

impl Kin {
    fn of(path: &Path) -> [Option<Kin>; 2] {
        let parent = path.parent();
        let namesakes = parent.and_then(Path::parent).zip(path.file_name()).map(|(above, name)| Kin::Namesakes(above.to_path_buf(), name.to_os_string()));
        [parent.map(|parent| Kin::Siblings(parent.to_path_buf())), namesakes]
    }
}

struct Running {
    folder: u32,
    kin: [Option<Kin>; 2],
    started: Instant,
    /// Opening it is over; reading what's in it never waits on macOS.
    opened: bool,
    /// Still opening after `STUCK`.
    stuck: bool,
    /// The gate it was let past, to find out whether its kin wait too.
    probe: Option<Kin>,
}

#[derive(Default)]
struct Gate {
    held: Vec<Job>,
    /// A probe is being listed and isn't caught yet.
    probing: bool,
    /// Probes caught waiting.
    caught: usize,
}

impl Pool {
    /// Starts `threads` threads that list folders with `lister` and pass each listing to `done`.
    pub fn new(threads: usize, idle_limit: usize, lister: Arc<Lister>, done: Arc<dyn Fn(Done) + Send + Sync>, stalled: Arc<dyn Fn() + Send + Sync>) -> Pool {
        Pool::with_stuck(threads, idle_limit, lister, done, stalled, STUCK)
    }

    fn with_stuck(threads: usize, idle_limit: usize, lister: Arc<Lister>, done: Arc<dyn Fn(Done) + Send + Sync>, stalled: Arc<dyn Fn() + Send + Sync>, stuck: Duration) -> Pool {
        let base = threads.max(1);
        let state = State {
            urgent: Vec::new(),
            idle: VecDeque::new(),
            idle_running: 0,
            closed: false,
            threads: 0,
            next_thread: 0,
            running: HashMap::new(),
            gates: HashMap::new(),
            watcher_asleep: false,
        };
        // A safety net. The walk hands out the newest folders first, so each place macOS asks about can catch every
        // free thread before its gate closes: on the development Mac, a first map without Full Disk Access had 64
        // threads caught within a second. A thread waiting on macOS holds nothing but its stack.
        let most = base * 10;
        let shared = Arc::new(Shared { state: Mutex::new(state), ready: Condvar::new(), started: Condvar::new(), lister, done, stalled, base, most, idle_limit, stuck });
        {
            let mut state = shared.state.lock().unwrap();
            for _ in 0..base {
                spawn(&shared, &mut state);
            }
        }
        let watcher = shared.clone();
        std::thread::Builder::new().name("watcher".into()).spawn(move || watch(&watcher)).expect("the listing watcher");
        Pool { shared }
    }

    pub fn submit(&self, job: Job) {
        self.shared.state.lock().unwrap().queue(job);
        self.shared.ready.notify_one();
    }

    /// Drops every job not yet started, as when a new walk replaces the index.
    pub fn clear(&self) {
        let mut state = self.shared.state.lock().unwrap();
        state.urgent.clear();
        state.idle.clear();
        state.gates.clear();
    }

    /// How many folders `stalled` would give, without gathering them: asked after every listing that lands.
    pub fn stalled_count(&self) -> usize {
        let state = self.shared.state.lock().unwrap();
        let held: usize = state.gates.values().map(|gate| gate.held.len()).sum();
        let full = state.threads >= self.shared.most && state.caught() >= state.threads;
        state.caught() + held + if full { state.urgent.len() + state.idle.len() } else { 0 }
    }

    /// Folders whose listings wait on macOS, or wait behind one that does.
    pub fn stalled(&self) -> Vec<u32> {
        let state = self.shared.state.lock().unwrap();
        let caught = state.running.values().filter(|run| run.stuck).map(|run| run.folder);
        let held = state.gates.values().flat_map(|gate| gate.held.iter().map(|job| job.folder));
        // With every thread caught and no more allowed, what's queued waits on the person's answers too.
        let full = state.threads >= self.shared.most && state.caught() >= state.threads;
        let queued = state.urgent.iter().chain(state.idle.iter()).map(|job| job.folder).filter(|_| full);
        caught.chain(held).chain(queued).collect()
    }

    #[cfg(test)]
    fn threads(&self) -> usize {
        self.shared.state.lock().unwrap().threads
    }
}

impl Drop for Pool {
    /// The threads aren't waited for: one waiting on macOS waits until the person answers, which may be never.
    fn drop(&mut self) {
        self.shared.state.lock().unwrap().closed = true;
        self.shared.ready.notify_all();
        self.shared.started.notify_all();
    }
}

impl State {
    fn queue(&mut self, job: Job) {
        if job.purpose == Purpose::Check {
            self.idle.push_back(job);
        } else {
            self.urgent.push(job);
        }
    }

    /// The next job to list, whether it counts against the idle limit, and the gate it probes.
    fn take(&mut self, idle_limit: usize) -> Option<(Job, bool, Option<Kin>)> {
        while let Some(job) = self.urgent.pop() {
            if let Some((job, probe)) = self.admit(job) {
                return Some((job, false, probe));
            }
        }
        while self.idle_running < idle_limit {
            let job = self.idle.pop_front()?;
            if let Some((job, probe)) = self.admit(job) {
                self.idle_running += 1;
                return Some((job, true, probe));
            }
        }
        None
    }

    /// `job` with the gate it probes, if any, or none when a gate holds it.
    fn admit(&mut self, job: Job) -> Option<(Job, Option<Kin>)> {
        for kin in Kin::of(&job.path).into_iter().flatten() {
            let Some(gate) = self.gates.get_mut(&kin) else { continue };
            if !gate.probing && gate.caught < PROBES {
                gate.probing = true;
                return Some((job, Some(kin)));
            }
            gate.held.push(job);
            return None;
        }
        Some((job, None))
    }

    /// Opens the gate of `kin`: its folders go back to be listed.
    fn release(&mut self, kin: &Kin) -> bool {
        let Some(gate) = self.gates.remove(kin) else { return false };
        for held in gate.held {
            self.queue(held);
        }
        true
    }

    fn caught(&self) -> usize {
        self.running.values().filter(|run| run.stuck).count()
    }
}

fn spawn(shared: &Arc<Shared>, state: &mut State) {
    let me = state.next_thread;
    state.next_thread += 1;
    state.threads += 1;
    let shared = shared.clone();
    std::thread::Builder::new().name(format!("lister-{me}")).spawn(move || work(&shared, me)).expect("a listing thread");
}

fn work(shared: &Arc<Shared>, me: usize) {
    let mut purpose = None;
    loop {
        let (job, idle) = {
            let mut state = shared.state.lock().unwrap();
            let (job, idle, probe) = loop {
                if let Some(taken) = state.take(shared.idle_limit) {
                    break taken;
                }
                // A thread that replaced one caught waiting leaves once there's nothing for it.
                if state.closed || state.threads > shared.base + state.caught() {
                    state.threads -= 1;
                    return;
                }
                state = shared.ready.wait(state).unwrap();
            };
            state.running.insert(me, Running { folder: job.folder, kin: Kin::of(&job.path), started: Instant::now(), opened: false, stuck: false, probe });
            if state.watcher_asleep {
                state.watcher_asleep = false;
                shared.started.notify_one();
            }
            (job, idle)
        };
        if purpose != Some(job.purpose) {
            set_thread_purpose(job.purpose);
            purpose = Some(job.purpose);
        }
        let start = Instant::now();
        let mut opened_at = None;
        let listing = (shared.lister)(&job.path, &mut || {
            opened_at = Some(Instant::now());
            if let Some(run) = shared.state.lock().unwrap().running.get_mut(&me) {
                run.opened = true;
            }
        });
        // What reading the folder cost, which sets how soon it's listed again. The wait for the person's answer to
        // macOS isn't part of it: counted, half a minute's wait kept the folder from being listed for two hours.
        let cost = opened_at.unwrap_or(start).elapsed();
        let waited = {
            let mut state = shared.state.lock().unwrap();
            if idle {
                state.idle_running -= 1;
            }
            let run = state.running.remove(&me);
            let mut released = false;
            if let Some(run) = &run {
                if run.stuck {
                    // It waited and landed: the person answered, and its kin can be listed.
                    for kin in run.kin.iter().flatten() {
                        released |= state.release(kin);
                    }
                } else if let Some(kin) = &run.probe {
                    // A probe that didn't wait: its kin aren't behind a question.
                    released |= state.release(kin);
                }
            }
            if released || idle {
                shared.ready.notify_all();
            }
            released || run.is_some_and(|run| run.stuck)
        };
        (shared.done)(Done { job, listing, cost });
        if waited {
            (shared.stalled)();
        }
    }
}

/// Catches listings still opening after `stuck`: each gets a thread in its place, and its parent a gate.
fn watch(shared: &Arc<Shared>) {
    let mut state = shared.state.lock().unwrap();
    loop {
        if state.closed {
            return;
        }
        let now = Instant::now();
        let mut caught = Vec::new();
        for run in state.running.values_mut() {
            if !run.opened && !run.stuck && now.duration_since(run.started) >= shared.stuck {
                run.stuck = true;
                caught.push((run.kin.clone(), run.probe.clone()));
            }
        }
        if !caught.is_empty() {
            let mut probes = Vec::new();
            for (kin, probe) in caught {
                for kin in kin.into_iter().flatten() {
                    let probed = probe.as_ref() == Some(&kin);
                    let gate = state.gates.entry(kin).or_default();
                    if probed {
                        gate.probing = false;
                        gate.caught += 1;
                        // The next probe comes from the folders held, as none may come from the queues.
                        if gate.caught < PROBES {
                            probes.extend(gate.held.pop());
                        }
                    }
                }
            }
            for probe in probes {
                state.queue(probe);
            }
            let wanted = (shared.base + state.caught()).min(shared.most);
            while state.threads < wanted {
                spawn(shared, &mut state);
            }
            shared.ready.notify_all();
            drop(state);
            (shared.stalled)();
            state = shared.state.lock().unwrap();
            continue;
        }
        // Until the next listing could be caught, or with none opening, until one starts.
        let next = state.running.values().filter(|run| !run.opened && !run.stuck).map(|run| run.started + shared.stuck).min();
        state = match next {
            Some(at) => shared.started.wait_timeout(state, at.saturating_duration_since(now)).unwrap().0,
            None => {
                state.watcher_asleep = true;
                shared.started.wait(state).unwrap()
            }
        };
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::listing::Outcome;
    use std::collections::HashSet;
    use std::sync::mpsc::{channel, Receiver};

    /// A lister whose folders under `gated` don't open until `answer` is called, as a folder macOS asks about.
    struct Question {
        answered: Mutex<bool>,
        given: Condvar,
        opened: Mutex<HashSet<PathBuf>>,
        costs: Arc<Mutex<Vec<Duration>>>,
    }

    impl Question {
        fn answer(&self) {
            *self.answered.lock().unwrap() = true;
            self.given.notify_all();
        }
    }

    fn pool(threads: usize, gated: &'static [&'static str]) -> (Pool, Arc<Question>, Receiver<PathBuf>) {
        let question = Arc::new(Question { answered: Mutex::new(false), given: Condvar::new(), opened: Mutex::new(HashSet::new()), costs: Arc::default() });
        let asked = question.clone();
        let lister: Arc<Lister> = Arc::new(move |path: &Path, opened: &mut dyn FnMut()| {
            if gated.iter().any(|g| path.starts_with(g)) {
                asked.opened.lock().unwrap().insert(path.to_path_buf());
                let mut answered = asked.answered.lock().unwrap();
                while !*answered {
                    answered = asked.given.wait(answered).unwrap();
                }
            }
            opened();
            Listing { inode: 1, outcome: Outcome::Listed(Vec::new()) }
        });
        let (tx, rx) = channel();
        let tx = Mutex::new(tx);
        let costs = question.costs.clone();
        let done = Arc::new(move |done: Done| {
            costs.lock().unwrap().push(done.cost);
            let _ = tx.lock().unwrap().send(done.job.path);
        });
        (Pool::with_stuck(threads, 2, lister, done, Arc::new(|| {}), Duration::from_millis(50)), question, rx)
    }

    fn submit(pool: &Pool, paths: &[&str]) {
        for (n, path) in paths.iter().enumerate() {
            pool.submit(Job { folder: n as u32, path: PathBuf::from(path), purpose: Purpose::Walk, deep: false, epoch: 0 });
        }
    }

    /// Whether `settled` comes true within a few seconds: the pool decides on its own threads.
    fn eventually(mut settled: impl FnMut() -> bool) -> bool {
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if settled() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        settled()
    }

    fn landed(rx: &Receiver<PathBuf>, count: usize) -> HashSet<PathBuf> {
        (0..count).map(|_| rx.recv_timeout(Duration::from_secs(5)).expect("a listing in time")).collect()
    }

    #[test]
    fn a_question_from_macos_holds_up_only_the_folders_behind_it() {
        let gated: Vec<String> = (0..30).map(|n| format!("/cloud/{n}")).collect();
        let free: Vec<String> = (0..40).map(|n| format!("/free/{n}")).collect();
        let (pool, question, rx) = pool(2, &["/cloud"]);
        // Taken newest first, so both threads start in the folder macOS asks about.
        let mut all: Vec<&str> = free.iter().map(String::as_str).collect();
        all.extend(gated.iter().map(String::as_str));
        submit(&pool, &all);
        let done = landed(&rx, free.len());
        assert!(done.iter().all(|p| p.starts_with("/free")));
        assert!(eventually(|| pool.stalled().len() == gated.len()), "{} of {} waiting", pool.stalled().len(), gated.len());
        // At most the two threads caught first and three probes; the others wait without a thread.
        let tried = question.opened.lock().unwrap().len();
        assert!(tried <= 2 + PROBES, "{tried} folders behind the question were opened");
        assert!(pool.threads() <= 2 + 2 + PROBES);
        question.answer();
        let rest = landed(&rx, gated.len());
        assert!(rest.iter().all(|p| p.starts_with("/cloud")));
        assert!(pool.stalled().is_empty());
        // The threads added in place of those caught leave once the work is done.
        let deadline = Instant::now() + Duration::from_secs(5);
        while pool.threads() > 2 && Instant::now() < deadline {
            pool.submit(Job { folder: 999, path: PathBuf::from("/free/again"), purpose: Purpose::Walk, deep: false, epoch: 0 });
            let _ = rx.recv_timeout(Duration::from_secs(1));
        }
        assert_eq!(pool.threads(), 2);
    }

    #[test]
    fn folders_beside_ones_macos_asks_about_separately_arent_held() {
        // A home folder: Desktop, Documents and Downloads each wait on a question of their own; the rest on none.
        let (pool, question, rx) = pool(1, &["/home/Desktop", "/home/Documents", "/home/Downloads"]);
        submit(&pool, &["/home/Library", "/home/Movies", "/home/Music", "/home/Pictures", "/home/Desktop", "/home/Documents", "/home/Downloads"]);
        let done = landed(&rx, 4);
        assert_eq!(done, ["/home/Library", "/home/Movies", "/home/Music", "/home/Pictures"].iter().map(PathBuf::from).collect());
        assert_eq!(pool.stalled().len(), 3);
        question.answer();
        assert_eq!(landed(&rx, 3).len(), 3);
    }

    #[test]
    fn folders_of_one_name_beside_their_parents_wait_together() {
        // Every app container's Data folder is behind one question; the containers themselves aren't.
        let containers: Vec<String> = (0..40).map(|n| format!("/Containers/app{n}")).collect();
        let data: Vec<String> = containers.iter().map(|c| format!("{c}/Data")).collect();
        // Only Data folders are listed here, so everything under /Containers waits on the question.
        let (pool, question, rx) = pool(2, &["/Containers"]);
        let gated: Vec<&str> = data.iter().map(String::as_str).collect();
        submit(&pool, &gated);
        assert!(eventually(|| pool.stalled().len() == data.len()), "{} of {} waiting", pool.stalled().len(), data.len());
        let tried = question.opened.lock().unwrap().len();
        assert!(tried <= 2 + PROBES, "{tried} Data folders were opened");
        question.answer();
        assert_eq!(landed(&rx, data.len()).len(), data.len());
    }

    /// Review of a first map without Full Disk Access: the wait for an answer counted as the listing's cost, and the
    /// cooldown that follows from it held changes inside those folders for hours.
    #[test]
    fn waiting_on_macos_isnt_part_of_a_listings_cost() {
        let (pool, question, rx) = pool(1, &["/cloud"]);
        submit(&pool, &["/cloud/a"]);
        while question.opened.lock().unwrap().is_empty() {
            std::thread::sleep(Duration::from_millis(5));
        }
        std::thread::sleep(Duration::from_millis(300));
        question.answer();
        landed(&rx, 1);
        let cost = question.costs.lock().unwrap()[0];
        assert!(cost < Duration::from_millis(100), "a listing that waited 300 ms on macOS cost {cost:?}");
    }

    #[test]
    fn dropping_the_pool_doesnt_wait_for_a_question() {
        let (pool, question, _rx) = pool(1, &["/cloud"]);
        submit(&pool, &["/cloud/a"]);
        while question.opened.lock().unwrap().is_empty() {
            std::thread::sleep(Duration::from_millis(5));
        }
        let started = Instant::now();
        drop(pool);
        assert!(started.elapsed() < Duration::from_millis(100));
        question.answer();
    }
}
