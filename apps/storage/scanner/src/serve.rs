//! `storage-scanner serve`: a live index of one disk, for Pith.
//!
//! Pith sends one JSON command a line on stdin and reads one JSON line per reply or report on stdout. Pith owns the
//! FSEvents stream and passes its events on; `Scheduler` decides when each changed folder is listed again and tracks
//! the event ID through which every change is in the index, which a snapshot saves with it.
//!
//! The listings run on worker threads. This thread owns the index: it applies each listing as it lands, answers for
//! the map, and sleeps until the next folder is due.

use std::fs::{File, OpenOptions};
use std::io::{BufRead, Write};
use std::os::fd::AsRawFd;
use std::path::{Path, PathBuf};
use std::collections::HashSet;
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Deserialize;

use crate::index::{Index, Status, ROOT};
use crate::listing;
use crate::scheduler::{CheckReport, Request, Scheduler};
use crate::snapshot;
use crate::system::{self, Purpose};
use crate::volumes;
use crate::walk::Context;
use crate::workers::{Done, Job, Lister, Pool};

/// How long a changed folder waits before it's listed. Over half the folders that changed during research on the
/// development Mac were gone within seconds (839 of 1,530), so waiting skips temporary folders for free, and a few
/// seconds is still live for a map of disk space. Three times the one-second latency Pith gives FSEvents.
const SETTLE: Duration = Duration::from_secs(3);
/// A folder whose listing took long waits this many times as long before its next one, so following it costs at most
/// half a percent of a core however often it changes. Following the development Mac's disk, Arc's browser cache took
/// 1.3 s a listing: at 50 times, the research's suggestion, it alone cost 2% of a core; at 200 it's listed every four
/// minutes or so. Large caches are where that matters, and minutes are soon enough for their size.
const COOLDOWN_FACTOR: u32 = 200;
/// How long a folder that left its parent waits for another listing to find it by inode. The two halves of a move
/// arrive together, but a slow folder's cooldown can hold the second listing back for minutes; until then the moved
/// folder costs only memory.
const LIMBO_GRACE: Duration = Duration::from_secs(300);
/// How often the largest files are checked for growth FSEvents can't report: a file written while it's held open,
/// such as a VM disk or a download, raises an event only once it's closed. 200 checks take under a millisecond.
const RECHECK: Duration = Duration::from_secs(60);
const RECHECKED_FILES: usize = 200;
/// Saved at most this often while it changes, besides at sleep, at quit and after a walk or a check. A crash then
/// costs at most this much history to replay at the next launch: an hour took 8.4-12.1 s on the development Mac.
const AUTOSAVE: Duration = Duration::from_secs(30 * 60);
/// The daily check lists on at most this many threads, as background work should.
const CHECK_THREADS: usize = 2;
/// How often clone groups whose holder went are handed to their runner-ups while folders change: a pass over every
/// group takes a few milliseconds, so the bytes of copies kept after their originals go come back within seconds.
const REPAIR: Duration = Duration::from_secs(5);
/// How often the scheduler looks for folders that came due. Each changed folder waits three seconds anyway, and looking
/// ten times a second goes over what's waiting once a tenth of a second rather than once a listing, which during a
/// check is hundreds of thousands of times.
const DISPATCH: Duration = Duration::from_millis(100);
/// How often memory freed after answering for the map goes back to macOS. A whole disk's map leaves several megabytes
/// behind each time, and Pith asks at most every two seconds while Disk is on screen.
const RELIEF: Duration = Duration::from_secs(10);
/// How often a walk reports its progress, as the `scan` command does.
const PROGRESS: Duration = Duration::from_millis(120);
/// How often the status goes to Pith while folders are waiting: enough for a count that moves, without a line for
/// every listing.
const STATUS: Duration = Duration::from_millis(500);

/// `FSEventStreamEventFlags` (`<CoreServices/FSEvents.h>`).
const MUST_SCAN_SUB_DIRS: u32 = 0x0000_0001;
const EVENT_IDS_WRAPPED: u32 = 0x0000_0008;
const HISTORY_DONE: u32 = 0x0000_0010;
const ROOT_CHANGED: u32 = 0x0000_0020;
/// The `kFSEventStreamEventFlagItem*` flags a file-level event carries, from ItemCreated to ItemCloned.
const ITEM_FLAGS: u32 = 0x007f_ff00;

#[derive(Deserialize)]
#[serde(tag = "cmd", rename_all = "lowercase")]
enum Command {
    /// Opens the index of `root`, from `snapshot` when it holds one of the same volume's history.
    Open { root: String, snapshot: Option<String>, volume: Option<String> },
    /// Walks the disk, replacing the index. Pith watches FSEvents from `since`, so what changes during the walk is
    /// listed again after it.
    Walk { since: u64 },
    /// FSEvents events: ID, flags, path and the item's inode, or 0 when FSEvents didn't give one.
    Events { events: Vec<(u64, u32, String, u64)> },
    /// The map of the folder at `path`, with `focus` in finer detail.
    Tree { path: String, focus: Option<String>, request: u64 },
    /// Lists a folder again now, and with `deep` everything in it.
    Relist { path: String, deep: bool },
    /// Lists the folders it couldn't read again, as after Full Disk Access is granted.
    Retry,
    Save,
    /// Lists every folder again, slowly, to catch what FSEvents didn't report.
    Check,
    /// Where to save from now on, or nowhere.
    Keep { snapshot: Option<String> },
    Stats,
}

enum Msg {
    Line(String),
    Listed(Box<Done>),
    /// Listings were caught waiting on macOS, or landed after waiting.
    Stalled,
    Closed,
}

pub fn run() -> i32 {
    if let Err(reason) = system::stop_cloud_downloads() {
        send(&serde_json::json!({ "type": "fatal", "reason": reason }).to_string());
        return 1;
    }
    system::stop_access_time_updates();
    let (tx, rx) = channel::<Msg>();
    let input = tx.clone();
    std::thread::Builder::new()
        .name("commands".into())
        .spawn(move || {
            for line in std::io::stdin().lock().lines() {
                let Ok(line) = line else { break };
                if input.send(Msg::Line(line)).is_err() {
                    return;
                }
            }
            let _ = input.send(Msg::Closed);
        })
        .expect("the command reader");
    let mut server = Server::new(tx);
    loop {
        let message = match rx.recv_timeout(server.wait()) {
            Ok(message) => Some(message),
            Err(RecvTimeoutError::Timeout) => None,
            Err(RecvTimeoutError::Disconnected) => break,
        };
        let mut closed = false;
        let mut handle = |server: &mut Server, message: Msg| {
            server.stirred = true;
            match message {
                Msg::Line(line) => server.command(&line),
                Msg::Listed(done) => server.landed(*done),
                Msg::Stalled => server.finish_waiting(),
                Msg::Closed => closed = true,
            }
        };
        if let Some(message) = message {
            handle(&mut server, message);
            // Everything already waiting goes in before the next decision, so a burst of listings is one batch.
            while let Ok(message) = rx.try_recv() {
                handle(&mut server, message);
            }
        }
        if closed {
            server.close();
            break;
        }
        server.tick();
    }
    0
}

struct Server {
    tx: Sender<Msg>,
    root: String,
    pool: Option<Pool>,
    index: Option<Index>,
    sched: Scheduler,
    /// Bumped by each walk, so listings for the index it replaced are dropped.
    epoch: u32,
    snapshot: Option<PathBuf>,
    _lock: Option<File>,
    volume: String,
    walking: Option<Instant>,
    check_started: Option<Instant>,
    history_done: bool,
    /// Something the map shows changed since the last status.
    changed: bool,
    /// Something changed since the last save.
    dirty: bool,
    last_save: Instant,
    last_recheck: Instant,
    last_repair: Instant,
    last_relief: Instant,
    last_dispatch: Instant,
    /// Something happened that can change the status since it was last worked out.
    stirred: bool,
    repairs: u64,
    repair_time: Duration,
    /// Listings landed since the last repair.
    unrepaired: bool,
    last_progress: Instant,
    last_status: Instant,
    reported: Option<(u64, usize, bool, usize)>,
}

impl Server {
    fn new(tx: Sender<Msg>) -> Server {
        let now = Instant::now();
        Server {
            tx,
            root: String::new(),
            pool: None,
            index: None,
            sched: Scheduler::new(SETTLE, COOLDOWN_FACTOR),
            epoch: 0,
            snapshot: None,
            _lock: None,
            volume: String::new(),
            walking: None,
            check_started: None,
            history_done: false,
            changed: false,
            dirty: false,
            last_save: now,
            last_recheck: now,
            last_repair: now,
            last_relief: now,
            last_dispatch: now,
            stirred: false,
            repairs: 0,
            repair_time: Duration::ZERO,
            unrepaired: false,
            last_progress: now,
            last_status: now,
            reported: None,
        }
    }

    fn command(&mut self, line: &str) {
        let command: Command = match serde_json::from_str(line) {
            Ok(command) => command,
            Err(e) => return error(None, &format!("Pith sent a command the scanner doesn't know: {e}.")),
        };
        if self.pool.is_none() && !matches!(command, Command::Open { .. } | Command::Stats) {
            return error(None, "The map isn't open yet.");
        }
        match command {
            Command::Open { root, snapshot, volume } => self.open(root, snapshot, volume),
            Command::Walk { since } => self.walk(since),
            Command::Events { events } => self.events(events),
            Command::Tree { path, focus, request } => {
                match self.index.as_ref().map(|index| index.result(&path, focus.as_deref())) {
                    Some(Ok(result)) => send(&format!(r#"{{"type":"tree","request":{request},"result":{result}}}"#)),
                    Some(Err(reason)) => error(Some(request), &reason),
                    None => error(Some(request), "The map hasn't been made yet."),
                }
                // A map is megabytes of short-lived nodes and text; malloc would keep their room as the process's own.
                if self.last_relief.elapsed() >= RELIEF {
                    system::return_free_memory();
                    self.last_relief = Instant::now();
                }
            }
            Command::Relist { path, deep } => self.sched.note(path, None, deep, Instant::now(), true),
            Command::Retry => {
                let folders = self.index.as_ref().map(Index::unreadable_ids).unwrap_or_default();
                for (_, path) in folders {
                    self.sched.note(path.to_string_lossy().into_owned(), None, false, Instant::now(), true);
                }
            }
            Command::Save => match self.save() {
                Ok(line) => send(&line),
                Err(reason) => error(None, &reason),
            },
            Command::Check => {
                if self.walking.is_none() {
                    if let Some(request) = self.index.as_ref().and_then(|index| self.sched.start_check(index)) {
                        self.check_started = Some(Instant::now());
                        self.run(request);
                    }
                }
            }
            Command::Keep { snapshot } => {
                self._lock = None;
                self.snapshot = None;
                if let Some(path) = snapshot.map(PathBuf::from) {
                    match lock(&path) {
                        Some(file) => {
                            self._lock = Some(file);
                            self.snapshot = Some(path);
                            self.dirty = true;
                        }
                        None => error(None, "Another copy of Pith is keeping this map, so this one won't save it."),
                    }
                }
            }
            Command::Stats => {
                let stats = self.index.as_ref().map(Index::stats);
                let (listings, time, busiest) = self.index.as_ref().map(|index| self.sched.costs(index, 10)).unwrap_or_default();
                let busiest: Vec<serde_json::Value> =
                    busiest.into_iter().map(|(path, n, d)| serde_json::json!({ "path": path, "listings": n, "ms": d.as_millis() as u64 })).collect();
                send(&serde_json::json!({
                    "type": "stats", "index": stats, "peakMemory": peak_memory(), "footprint": footprint(), "waiting": self.sched.waiting(),
                    "listings": listings, "listingMs": time.as_millis() as u64, "busiest": busiest, "repairs": self.repairs, "repairMs": self.repair_time.as_millis() as u64,
                })
                .to_string());
            }
        }
    }

    fn open(&mut self, root: String, snapshot: Option<String>, volume: Option<String>) {
        if self.pool.is_some() {
            return error(None, "The map is open already.");
        }
        let cx = Arc::new(Context::of(Path::new(&root)));
        let tx = self.tx.clone();
        let done: Arc<dyn Fn(Done) + Send + Sync> = Arc::new(move |done| {
            let _ = tx.send(Msg::Listed(Box::new(done)));
        });
        let tx = self.tx.clone();
        let stalled: Arc<dyn Fn() + Send + Sync> = Arc::new(move || {
            let _ = tx.send(Msg::Stalled);
        });
        let within = cx.clone();
        let lister: Arc<Lister> = Arc::new(move |path: &Path, opened: &mut dyn FnMut()| listing::list_with(path, &within, opened));
        // As many listing threads as cores: the fastest walkers on macOS use about one per core.
        let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
        self.pool = Some(Pool::new(threads, CHECK_THREADS, lister, done, stalled));
        self.root = root.clone();
        self.volume = volume.clone().unwrap_or_default();
        let mut locked = false;
        if let Some(path) = snapshot.map(PathBuf::from) {
            match lock(&path) {
                Some(file) => {
                    self._lock = Some(file);
                    self.snapshot = Some(path);
                }
                None => locked = true,
            }
        }
        let restored = match &self.snapshot {
            Some(path) if path.exists() => snapshot::read(path, &root, volume.as_deref()),
            Some(_) => Err("there's no saved map yet".to_string()),
            None if locked => Err("another copy of Pith is keeping the map".to_string()),
            None => Err("Pith doesn't keep the map".to_string()),
        };
        match restored {
            Ok((mut index, meta)) => {
                index.set_firmlinks(firmlinks(&cx));
                index.compact();
                self.sched.reset(meta.through);
                // Folders a save caught before their first listing are listed now, with everything in them.
                let unlisted: Vec<String> =
                    (0..index.folders.len() as u32).filter(|&id| index.attached(id) && index.status(id) == Status::Pending).map(|id| index.path(id)).collect();
                self.index = Some(index);
                send(&serde_json::json!({ "type": "opened", "restored": true, "through": meta.through, "savedAt": meta.saved_at, "folders": meta.folders, "locked": locked }).to_string());
                for path in unlisted {
                    self.sched.note(path, None, false, Instant::now(), true);
                }
            }
            Err(reason) => send(&serde_json::json!({ "type": "opened", "restored": false, "reason": reason, "locked": locked }).to_string()),
        }
    }

    fn walk(&mut self, since: u64) {
        self.epoch += 1;
        if let Some(pool) = &self.pool {
            pool.clear();
        }
        let cx = Context::of(Path::new(&self.root));
        self.index = Some(Index::new(&self.root, firmlinks(&cx)));
        self.sched.reset(since);
        self.check_started = None;
        self.history_done = false;
        self.walking = Some(Instant::now());
        self.last_progress = Instant::now();
        if let Some(request) = self.sched.submit(ROOT, PathBuf::from(&self.root), Purpose::Walk, false, None) {
            self.run(request);
        }
    }

    fn events(&mut self, events: Vec<(u64, u32, String, u64)>) {
        let now = Instant::now();
        for (id, flags, path, inode) in events {
            self.sched.received(id);
            if flags & HISTORY_DONE != 0 {
                self.history_done = true;
                send(r#"{"type":"historyDone"}"#);
                continue;
            }
            if flags & EVENT_IDS_WRAPPED != 0 {
                send(r#"{"type":"rebuild","reason":"FSEvents restarted its event IDs."}"#);
                continue;
            }
            if flags & ROOT_CHANGED != 0 {
                send(r#"{"type":"rebuild","reason":"The mapped folder moved."}"#);
                continue;
            }
            // FullHistory replays a little from before the position: the index has those changes already.
            if id <= self.sched.base() {
                continue;
            }
            let Some(path) = self.inside(&path) else { continue };
            // A file-level event names the item that changed, which its folder's listing shows; anything else names
            // the folder. Lost events come with MustScanSubDirs on the folder to list again whole.
            let item = flags & ITEM_FLAGS != 0 && flags & MUST_SCAN_SUB_DIRS == 0;
            let folder = if item && path != self.root { parent_of(&path) } else { path };
            self.sched.note_item(folder, Some(id), flags & MUST_SCAN_SUB_DIRS != 0, now, false, (item && inode != 0).then_some(inode));
        }
    }

    /// `path` as a folder of the map, or none when it's outside. FSEvents ends folder paths with a slash, and names
    /// the startup disk's data volume at its visible paths and /tmp and /var at their /private paths.
    fn inside(&self, path: &str) -> Option<String> {
        let mut folder = if path.len() > 1 && path.ends_with('/') { path[..path.len() - 1].to_string() } else { path.to_string() };
        let within = |p: &str| p == self.root || self.root == "/" || p.starts_with(&format!("{}/", self.root));
        const DATA: &str = "/System/Volumes/Data";
        if !within(&folder) && (self.root == DATA || self.root.starts_with(&format!("{DATA}/"))) {
            folder = format!("{DATA}{folder}");
        }
        if !within(&folder) && folder.starts_with("/private/") && !self.root.starts_with("/private/") {
            folder = folder["/private".len()..].to_string();
        }
        within(&folder).then_some(folder)
    }

    fn run(&self, request: Request) {
        if let Some(pool) = &self.pool {
            pool.submit(Job { folder: request.folder, path: request.path, purpose: request.purpose, deep: request.deep, epoch: self.epoch });
        }
    }

    fn landed(&mut self, done: Done) {
        let Done { job, listing, cost } = done;
        if job.epoch != self.epoch {
            return;
        }
        let Some(index) = self.index.as_mut() else { return };
        let request = Request { folder: job.folder, path: job.path, purpose: job.purpose, deep: job.deep };
        let (next, landed) = self.sched.landed(index, &request, listing, cost, Instant::now());
        if landed.changed {
            self.changed = true;
            self.dirty = true;
            self.unrepaired = true;
        }
        for request in next {
            self.run(request);
        }
        if let Some(report) = landed.checked {
            self.checked(report);
        }
        self.finish_waiting();
    }

    fn checked(&mut self, report: CheckReport) {
        if let Some(index) = &mut self.index {
            // A check lists each folder once: copies listed before their holder's folder showed it gone count none
            // until repaired.
            index.repair();
            index.compact();
        }
        let ms = self.check_started.take().map(|started| started.elapsed().as_millis() as u64).unwrap_or(0);
        send(&serde_json::json!({ "type": "checked", "folders": report.folders, "corrected": report.corrected, "bytes": report.drift, "ms": ms }).to_string());
        self.save_quietly();
    }

    /// Ends a walk or a check that waits only on folders waiting for macOS.
    fn finish_waiting(&mut self) {
        self.finish_walk();
        let waited_on = self.sched.in_flight().1;
        if waited_on > 0 && waited_on <= self.stalled_count() {
            let asking = self.asking();
            if !asking.is_empty() && self.sched.check_waits_only_on(&asking) {
                if let Some(report) = self.sched.end_check() {
                    self.checked(report);
                }
            }
        }
    }

    /// Ends the walk once every folder is listed but those waiting on macOS: the map shows without them, and each
    /// joins it when the person answers, however long that takes.
    fn finish_walk(&mut self) {
        let Some(started) = self.walking else { return };
        // Counts first: comparing every listing in flight with every one waiting after each landing was quadratic.
        if self.sched.in_flight().0 > self.stalled_count() {
            return;
        }
        let asking = self.asking();
        if !self.sched.idle_except(&asking) {
            return;
        }
        self.walking = None;
        let ms = started.elapsed().as_millis() as u64;
        let index = self.index.as_mut().unwrap();
        index.walk_ms = ms;
        index.compact();
        let totals = index.totals(ROOT);
        send(&serde_json::json!({
            "type": "walked", "ms": ms, "folders": index.folder_count(), "files": totals.files, "bytes": totals.size, "asking": asking.len(),
        })
        .to_string());
        self.changed = true;
        self.dirty = true;
        self.save_quietly();
    }

    fn stalled_count(&self) -> usize {
        self.pool.as_ref().map_or(0, Pool::stalled_count)
    }

    /// Folders waiting on macOS to let them be listed, or behind one that is.
    fn asking(&self) -> HashSet<u32> {
        self.pool.as_ref().map(Pool::stalled).unwrap_or_default().into_iter().collect()
    }

    fn save(&mut self) -> Result<String, String> {
        let Some(path) = self.snapshot.clone() else { return Err("Pith doesn't keep the map.".into()) };
        if self.walking.is_some() {
            return Err("The map is still being made.".into());
        }
        let through = self.sched.through();
        let Some(index) = self.index.as_mut() else { return Err("There's no map to keep yet.".into()) };
        index.purge();
        let started = Instant::now();
        // A save that fails, as on a full disk, waits for the next interval rather than trying again at once.
        self.last_save = started;
        let saved_at = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        if let Some(folder) = path.parent() {
            let _ = std::fs::create_dir_all(folder);
        }
        let bytes = snapshot::write(&path, index, through, &self.volume, saved_at).map_err(|e| format!("Pith couldn't keep the map: {e}."))?;
        self.dirty = false;
        Ok(serde_json::json!({ "type": "saved", "through": through, "bytes": bytes, "ms": started.elapsed().as_millis() as u64 }).to_string())
    }

    fn save_quietly(&mut self) {
        if self.snapshot.is_none() {
            return;
        }
        match self.save() {
            Ok(line) => send(&line),
            Err(reason) => error(None, &reason),
        }
    }

    /// Checks the largest files and the volumes inside the map for growth no event reported.
    fn recheck(&mut self) {
        let now = Instant::now();
        self.last_recheck = now;
        self.sched.tidy(now);
        let Some(index) = &self.index else { return };
        let mut grown = Vec::new();
        for (folder, path, size) in index.largest_files(RECHECKED_FILES) {
            if allocated(&path) != Some(size) {
                grown.push(index.path(folder));
            }
        }
        for (_, path, used) in index.volume_folders() {
            let now = volumes::volume_info(&path).used.unwrap_or(0);
            if now != used {
                grown.push(path.to_string_lossy().into_owned());
            }
        }
        for path in grown {
            self.sched.note(path, None, false, now, true);
        }
    }

    /// Sends the status at most every `STATUS`, and only when something stirred since. Working it out goes over every
    /// folder waiting or being listed, hundreds of thousands during a check, so it isn't worked out more often than
    /// it could be sent.
    fn report(&mut self, now: Instant) {
        if self.walking.is_some() || self.index.is_none() || !self.stirred || now.duration_since(self.last_status) < STATUS {
            return;
        }
        self.stirred = false;
        self.last_status = now;
        let through = self.sched.through();
        let asking = self.stalled_count();
        let waiting = self.sched.waiting();
        let state = (through, waiting, self.sched.checking(), asking);
        if self.reported == Some(state) && !self.changed {
            return;
        }
        send(&serde_json::json!({
            "type": "status", "through": through, "pending": waiting, "changed": self.changed, "checking": self.sched.checking(),
            "historyDone": self.history_done, "asking": asking,
        })
        .to_string());
        self.reported = Some(state);
        self.changed = false;
    }

    fn tick(&mut self) {
        let now = Instant::now();
        if self.walking.is_some() {
            if now.duration_since(self.last_progress) >= PROGRESS {
                self.last_progress = now;
                let asking = self.stalled_count();
                if let Some(index) = &self.index {
                    let totals = index.totals(ROOT);
                    let errors = index.unreadable.len();
                    send(&format!(
                        r#"{{"type":"progress","dirs":{},"files":{},"bytes":{},"errors":{errors},"asking":{asking}}}"#,
                        index.folder_count(),
                        totals.files,
                        totals.size
                    ));
                }
            }
            return;
        }
        if now.duration_since(self.last_recheck) >= RECHECK {
            self.recheck();
        }
        if now.duration_since(self.last_dispatch) >= DISPATCH {
            self.last_dispatch = now;
            if let Some(index) = &self.index {
                let requests = self.sched.due(index, now);
                if !requests.is_empty() {
                    self.stirred = true;
                }
                for request in requests {
                    self.run(request);
                }
            }
        }
        let idle = self.sched.idle();
        if let Some(index) = &mut self.index {
            index.settle(LIMBO_GRACE, idle);
            if idle && self.unrepaired && now.duration_since(self.last_repair) >= REPAIR {
                let started = Instant::now();
                index.repair();
                self.repairs += 1;
                self.repair_time += started.elapsed();
                self.unrepaired = false;
                self.last_repair = now;
                self.changed = true;
                self.stirred = true;
            }
        }
        if self.dirty && self.snapshot.is_some() && now.duration_since(self.last_save) >= AUTOSAVE {
            self.save_quietly();
        }
        self.report(now);
    }

    /// How long to sleep before something comes due. Every deadline here is one `tick` acts on when it passes, so the
    /// loop never wakes to find nothing to do, which it would do a thousand times a second.
    fn wait(&self) -> Duration {
        let now = Instant::now();
        let mut next = self.last_recheck + RECHECK;
        if self.walking.is_some() {
            next = next.min(self.last_progress + PROGRESS);
        } else {
            if let Some(due) = self.sched.next_due(now) {
                next = next.min(due.max(self.last_dispatch + DISPATCH));
            }
            if self.dirty && self.snapshot.is_some() {
                next = next.min(self.last_save + AUTOSAVE);
            }
            if self.stirred && self.index.is_some() {
                next = next.min(self.last_status + STATUS);
            }
            // Repair waits for no listing to be in flight; while one is, its landing wakes the loop anyway.
            if self.unrepaired && self.sched.idle() {
                next = next.min(self.last_repair + REPAIR);
            }
        }
        next.saturating_duration_since(now).max(Duration::from_millis(1))
    }

    fn close(&mut self) {
        if self.dirty && self.walking.is_none() {
            self.save_quietly();
        }
    }
}

fn parent_of(path: &str) -> String {
    match path.rfind('/') {
        Some(0) => "/".to_string(),
        Some(at) => path[..at].to_string(),
        None => path.to_string(),
    }
}

fn firmlinks(cx: &Context) -> std::collections::HashMap<u64, PathBuf> {
    cx.firmlinks.iter().map(|(&(_, inode), path)| (inode, path.clone())).collect()
}

/// Holds the lock beside `snapshot`, so two copies of Pith never save over each other's map.
fn lock(snapshot: &Path) -> Option<File> {
    if let Some(folder) = snapshot.parent() {
        let _ = std::fs::create_dir_all(folder);
    }
    let file = OpenOptions::new().create(true).truncate(false).write(true).open(snapshot.with_extension("lock")).ok()?;
    (unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } == 0).then_some(file)
}

/// A file's allocated bytes, as a listing reports them.
fn allocated(path: &Path) -> Option<u64> {
    use std::os::unix::fs::MetadataExt;
    std::fs::symlink_metadata(path).ok().map(|m| m.blocks() * 512)
}

/// The process's physical footprint now, as Activity Monitor's Memory column shows it.
fn footprint() -> u64 {
    let mut info: libc::rusage_info_v2 = unsafe { std::mem::zeroed() };
    let status = unsafe { libc::proc_pid_rusage(std::process::id() as i32, libc::RUSAGE_INFO_V2, (&mut info as *mut libc::rusage_info_v2).cast()) };
    if status == 0 { info.ri_phys_footprint } else { 0 }
}

fn peak_memory() -> u64 {
    let mut usage: libc::rusage = unsafe { std::mem::zeroed() };
    unsafe { libc::getrusage(libc::RUSAGE_SELF, &mut usage) };
    // macOS reports it in bytes.
    usage.ru_maxrss as u64
}

fn send(line: &str) {
    let stdout = std::io::stdout();
    let mut out = stdout.lock();
    let _ = out.write_all(line.as_bytes());
    let _ = out.write_all(b"\n");
    let _ = out.flush();
}

fn error(request: Option<u64>, reason: &str) {
    send(&serde_json::json!({ "type": "error", "request": request, "reason": reason }).to_string());
}
