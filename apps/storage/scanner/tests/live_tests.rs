//! The live index against the walk: after any run of changes, listing again the folders FSEvents names must leave
//! every folder with the totals a fresh scan gives, clones and hard links included.

use std::collections::{HashMap, HashSet};
use std::ffi::CString;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use storage_scanner::index::{Index, Status, ROOT};
use storage_scanner::listing::list;
use storage_scanner::scheduler::{Request, Scheduler};
use storage_scanner::system::Purpose;
use storage_scanner::model::{DirNode, DirStatus};
use storage_scanner::snapshot;
use storage_scanner::walk::{Context, Engine, Scanner};

/// A folder of the test's own, at its real path: the walk and the index both see /private/var, not /var.
fn fixture(test: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("pith-live-{}-{test}", std::process::id()));
    remove(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir.canonicalize().unwrap()
}

fn remove(dir: &Path) {
    // An unreadable folder has to be opened up before it can go.
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let _ = fs::set_permissions(entry.path(), fs::Permissions::from_mode(0o755));
        }
    }
    let _ = fs::remove_dir_all(dir);
}

fn clone_file(from: &Path, to: &Path) -> bool {
    let from = CString::new(from.as_os_str().as_bytes()).unwrap();
    let to = CString::new(to.as_os_str().as_bytes()).unwrap();
    unsafe { libc::clonefile(from.as_ptr(), to.as_ptr(), 0) == 0 }
}

/// The index of a folder with `serve`'s scheduler, listing one folder at a time on this thread and landing the
/// listings in a shuffled order, as threads would.
struct Live {
    index: Index,
    sched: Scheduler,
    cx: Context,
    root: PathBuf,
}

impl Live {
    fn build(root: &Path) -> Live {
        let index = Index::new(root.to_str().unwrap(), HashMap::new());
        Live::open(root, index)
    }

    fn open(root: &Path, mut index: Index) -> Live {
        index.keep_files_from(1);
        let fresh = index.status(ROOT) == Status::Pending;
        let mut live = Live { index, sched: Scheduler::new(Duration::ZERO, 0), cx: Context::of(root), root: root.to_path_buf() };
        if fresh {
            let request = live.sched.submit(ROOT, root.to_path_buf(), Purpose::Walk, false, None).unwrap();
            live.drain(vec![request], &mut Rng(1));
        }
        live
    }

    /// Lists until nothing is due or in flight.
    fn drain(&mut self, mut queue: Vec<Request>, rng: &mut Rng) {
        loop {
            queue.extend(self.sched.due(&self.index, Instant::now()));
            if queue.is_empty() {
                break;
            }
            rng.shuffle(&mut queue);
            let request = queue.pop().unwrap();
            let listing = list(&request.path, &self.cx);
            let (next, _) = self.sched.landed(&mut self.index, &request, listing, Duration::ZERO, Instant::now());
            queue.extend(next);
        }
    }

    /// What FSEvents leads to: each changed folder noted, then everything listed that that leads to, then folders
    /// left in limbo freed.
    fn changed(&mut self, folders: &[PathBuf], rng: &mut Rng) {
        let touched: Vec<(PathBuf, Option<u64>)> = folders.iter().map(|f| (f.clone(), None)).collect();
        self.changed_items(&touched, rng);
    }

    /// The same for file-level events: each changed folder with the inode of the item that changed in it.
    fn changed_items(&mut self, touched: &[(PathBuf, Option<u64>)], rng: &mut Rng) {
        for (folder, item) in touched {
            self.sched.note_item(folder.to_string_lossy().into_owned(), None, false, Instant::now(), true, *item);
        }
        self.drain(Vec::new(), rng);
        self.index.settle(Duration::ZERO, true);
        self.drain(Vec::new(), rng);
        self.index.repair();
    }

    /// Lists the changed folders, leaving limbo as it is, as when another listing follows within `serve`'s grace.
    fn listed(&mut self, folders: &[PathBuf], rng: &mut Rng) {
        for folder in folders {
            self.sched.note(folder.to_string_lossy().into_owned(), None, false, Instant::now(), true);
        }
        self.drain(Vec::new(), rng);
    }

    /// The daily check: every folder listed again.
    fn check(&mut self) {
        let request = self.sched.start_check(&self.index).unwrap();
        self.drain(vec![request], &mut Rng(2));
        self.index.settle(Duration::ZERO, true);
        self.index.repair();
        self.index.purge();
    }
}

fn assert_same(live: &Live, context: &str) {
    let scanner = Scanner::new(Engine::Bulk);
    let tree = scanner.walk(&live.root, "root".into());
    compare(&live.index, &tree, context);
    let totals = live.index.totals(ROOT);
    assert_eq!(totals.clone_files, scanner.clones.files.load(std::sync::atomic::Ordering::Relaxed), "{context}: clone copies left out");
    assert_eq!(live.index.inconsistencies, 0, "{context}: a total went below zero");
}

fn compare(index: &Index, node: &DirNode, context: &str) {
    let (id, exact) = index.find(&node.path).unwrap_or_else(|| panic!("{context}: {} is outside the index", node.path));
    assert!(exact, "{context}: the index has no {}", node.path);
    let status = match node.status {
        DirStatus::Listed => Status::Listed,
        DirStatus::Unreadable(_) => Status::Unreadable,
        DirStatus::Volume { .. } => Status::Volume,
    };
    assert_eq!(index.status(id), status, "{context}: {}", node.path);
    for dir in &node.dirs {
        compare(index, dir, context);
    }
    let totals = index.totals(id);
    if (totals.size, totals.files, totals.clones) != (node.size, node.file_count, node.clones) {
        let disk: Vec<String> = fs::read_dir(&node.path)
            .map(|entries| {
                entries
                    .flatten()
                    .map(|e| {
                        use std::os::unix::fs::MetadataExt;
                        let m = e.metadata().unwrap();
                        format!("{} ino={} nlink={} blocks={}", e.file_name().to_string_lossy(), m.ino(), m.nlink(), m.blocks() * 512)
                    })
                    .collect()
            })
            .unwrap_or_default();
        eprintln!("index keeps {:?}\non disk {disk:#?}", index.kept_files(id));
        for (name, _, _, group) in index.kept_files(id) {
            if group != 0 {
                eprintln!("{name}: group {group}: {}", index.record_of(group));
                let root = PathBuf::from(index.path(ROOT));
                let cx = Context::of(&root);
                let mut stack = vec![root];
                while let Some(dir) = stack.pop() {
                    if let storage_scanner::listing::Outcome::Listed(entries) = list(&dir, &cx).outcome {
                        for e in entries {
                            if e.is_dir {
                                stack.push(dir.join(&e.name));
                            } else if e.clone_id == group || e.inode == group {
                                eprintln!("  copy {} ino={} group={:?} flags={:#x} nlink={}", dir.join(&e.name).display(), e.inode, e.clone_group(), e.ext_flags, e.nlink);
                            }
                        }
                    }
                }
            }
        }
    }
    assert_eq!((totals.size, totals.files, totals.clones), (node.size, node.file_count, node.clones), "{context}: size, files and clones of {}", node.path);
    for (kind, &bytes) in node.kinds.0.iter().enumerate() {
        assert_eq!(bytes % 4096, 0, "APFS allocates whole 4 KiB blocks, which the index counts kinds in");
        assert_eq!(totals.kinds[kind] * 4096, bytes, "{context}: kind {kind} of {}", node.path);
    }
    let mut ours = index.child_names(id);
    ours.sort();
    let mut theirs: Vec<String> = node.dirs.iter().map(|d| d.name.clone()).collect();
    theirs.sort();
    assert_eq!(ours, theirs, "{context}: folders in {}", node.path);
}

/// xorshift64*: the same run of changes every time.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 >> 12;
        self.0 ^= self.0 << 25;
        self.0 ^= self.0 >> 27;
        self.0.wrapping_mul(0x2545_f491_4f6c_dd1d)
    }
    fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }
    fn pick<'a, T>(&mut self, items: &'a [T]) -> Option<&'a T> {
        (!items.is_empty()).then(|| &items[self.below(items.len())])
    }
    fn shuffle<T>(&mut self, items: &mut [T]) {
        for i in (1..items.len()).rev() {
            items.swap(i, self.below(i + 1));
        }
    }
}

const NAMES: [&str; 8] = ["notes.txt", "photo.png", "main.rs", "backup.zip", "song.mp3", "README", "clip.mov", "data.bin"];

/// A folder tree that changes at random, and what each change touched as FSEvents would name it.
struct World {
    root: PathBuf,
    folders: Vec<PathBuf>,
    files: Vec<PathBuf>,
    /// Clones and hard links. Deleting or changing one can leave another copy uncounted until a check lists its
    /// folder, as the index's notes say; a run that does that checks before it compares.
    shared: HashSet<PathBuf>,
    /// Hard links, which stay in their folder: see `seeded`.
    linked: HashSet<PathBuf>,
    made: u64,
    /// No clones or hard links, so no change ever needs a check and every round tests what listings alone do.
    plain: bool,
}

impl World {
    fn new(root: &Path) -> World {
        World { root: root.to_path_buf(), folders: vec![root.to_path_buf()], files: Vec::new(), shared: HashSet::new(), linked: HashSet::new(), made: 0, plain: false }
    }

    fn fresh(&mut self, folder: &Path, rng: &mut Rng) -> PathBuf {
        self.made += 1;
        let base = NAMES[rng.below(NAMES.len())];
        folder.join(format!("{}-{base}", self.made))
    }

    fn write(path: &Path, bytes: usize) {
        fs::write(path, vec![b'p'; bytes]).unwrap();
    }

    fn parent(path: &Path) -> PathBuf {
        path.parent().unwrap().to_path_buf()
    }

    fn shares_inside(&self, folder: &Path) -> bool {
        self.shared.iter().any(|p| p.starts_with(folder))
    }

    fn rebase(&mut self, from: &Path, to: &Path) {
        // Joining an empty rest would add a trailing slash.
        let moved = |p: &PathBuf| match p.strip_prefix(from) {
            Ok(rest) if rest.as_os_str().is_empty() => to.to_path_buf(),
            Ok(rest) => to.join(rest),
            Err(_) => p.clone(),
        };
        self.folders = self.folders.iter().map(moved).collect();
        self.files = self.files.iter().map(moved).collect();
        self.shared = self.shared.iter().map(moved).collect();
        self.linked = self.linked.iter().map(moved).collect();
    }

    fn forget(&mut self, gone: &Path) {
        self.folders.retain(|p| !p.starts_with(gone));
        self.files.retain(|p| !p.starts_with(gone));
        self.shared.retain(|p| !p.starts_with(gone));
        self.linked.retain(|p| !p.starts_with(gone));
    }

    /// Makes one change. Returns the folders FSEvents would name with the inode of the item named in each, and
    /// whether a check must follow before the index can match a fresh scan.
    fn change(&mut self, rng: &mut Rng) -> (Vec<(PathBuf, Option<u64>)>, bool) {
        let op = match rng.below(12) {
            op @ 9.. if self.plain => op % 9,
            op => op,
        };
        let (folders, check, item) = self.apply(op, rng);
        let result: (Vec<(PathBuf, Option<u64>)>, bool) = (folders.into_iter().map(|f| (f, item)).collect(), check);
        if std::env::var_os("PITH_TRACE").is_some() {
            let short = |p: &PathBuf| p.strip_prefix(&self.root).map(|r| r.display().to_string()).unwrap_or_default();
            eprintln!("  op {op}: touched {:?} check {}", result.0.iter().map(|(f, _)| short(f)).collect::<Vec<_>>(), result.1);
        }
        for folder in &self.folders {
            assert!(folder.is_dir(), "after op {op}: {} isn't a folder", folder.display());
        }
        for file in &self.files {
            assert!(file.is_file(), "after op {op}: {} isn't a file", file.display());
        }
        result
    }

    /// One change: the folders it touched, whether a check must follow, and the inode of the item it changed.
    fn apply(&mut self, op: usize, rng: &mut Rng) -> (Vec<PathBuf>, bool, Option<u64>) {
        use std::os::unix::fs::MetadataExt;
        let inode = |p: &Path| fs::symlink_metadata(p).ok().map(|m| m.ino());
        match op {
            0..=2 => {
                let folder = rng.pick(&self.folders).unwrap().clone();
                let file = self.fresh(&folder, rng);
                Self::write(&file, rng.below(40_000));
                let item = inode(&file);
                self.files.push(file);
                (vec![folder], false, item)
            }
            3 => {
                let Some(file) = rng.pick(&self.files).cloned() else { return (vec![], false, None) };
                let mut handle = fs::OpenOptions::new().append(true).open(&file).unwrap();
                handle.write_all(&vec![b'q'; 1 + rng.below(20_000)]).unwrap();
                // A clone that changes stops sharing its blocks, and a hard link's other paths aren't named.
                (vec![Self::parent(&file)], self.shared.contains(&file), inode(&file))
            }
            4 => {
                let Some(file) = rng.pick(&self.files).cloned() else { return (vec![], false, None) };
                let item = inode(&file);
                fs::remove_file(&file).unwrap_or_else(|e| {
                    let ancestors: Vec<String> = file.ancestors().map(|a| format!("{} dir={} exists={}", a.display(), a.is_dir(), a.exists())).collect();
                    panic!("remove {}: {e}\n{}", file.display(), ancestors.join("\n"))
                });
                self.files.retain(|f| *f != file);
                self.linked.remove(&file);
                let shared = self.shared.remove(&file);
                (vec![Self::parent(&file)], shared, item)
            }
            5 => {
                let parent = rng.pick(&self.folders).unwrap().clone();
                self.made += 1;
                let folder = parent.join(format!("folder-{}", self.made));
                fs::create_dir(&folder).unwrap();
                let item = inode(&folder);
                self.folders.push(folder);
                (vec![parent], false, item)
            }
            6 => {
                let candidates: Vec<PathBuf> = self.folders.iter().filter(|f| **f != self.root).cloned().collect();
                let Some(folder) = rng.pick(&candidates).cloned() else { return (vec![], false, None) };
                let item = inode(&folder);
                fs::remove_dir_all(&folder).unwrap();
                let shared = self.shares_inside(&folder);
                self.forget(&folder);
                (vec![Self::parent(&folder)], shared, item)
            }
            7 => {
                // A folder moves somewhere outside itself.
                let candidates: Vec<PathBuf> = self.folders.iter().filter(|f| **f != self.root).cloned().collect();
                let Some(folder) = rng.pick(&candidates).cloned() else { return (vec![], false, None) };
                let targets: Vec<PathBuf> = self.folders.iter().filter(|t| !t.starts_with(&folder) && **t != Self::parent(&folder)).cloned().collect();
                let Some(target) = rng.pick(&targets).cloned() else { return (vec![], false, None) };
                let to = target.join(folder.file_name().unwrap());
                if to.exists() {
                    return (vec![], false, None);
                }
                fs::rename(&folder, &to).unwrap();
                let from_parent = Self::parent(&folder);
                self.rebase(&folder, &to);
                (vec![from_parent, target], false, inode(&to))
            }
            8 => {
                let Some(file) = rng.pick(&self.files).cloned() else { return (vec![], false, None) };
                // A hard link is renamed in its folder, which keeps its links together.
                let folder = if self.linked.contains(&file) { Self::parent(&file) } else { rng.pick(&self.folders).unwrap().clone() };
                let to = self.fresh(&folder, rng);
                fs::rename(&file, &to).unwrap_or_else(|e| panic!("rename {} to {}: {e}; folder is dir {}, file exists {}", file.display(), to.display(), folder.is_dir(), file.exists()));
                let from = Self::parent(&file);
                self.rebase(&file, &to);
                (vec![from, folder], false, inode(&to))
            }
            9 | 10 => {
                // A clone of a file into any folder, as `cp -c` or pnpm makes them.
                let Some(file) = rng.pick(&self.files).cloned() else { return (vec![], false, None) };
                if fs::metadata(&file).map(|m| m.len()).unwrap_or(0) == 0 {
                    return (vec![], false, None);
                }
                let folder = rng.pick(&self.folders).unwrap().clone();
                let to = self.fresh(&folder, rng);
                assert!(clone_file(&file, &to), "the temp folder is on APFS");
                self.files.push(to.clone());
                // The index finds a clone's source by the clone ID, which is the source's inode, unless the source has
                // hard links or is itself a clone whose original went. Such a source counts beside the copy until the
                // check lists its folder.
                let linked = self.linked.contains(&file) || !clone_id_is_inode(&file);
                let item = inode(&to);
                self.shared.insert(file);
                self.shared.insert(to);
                (vec![folder], linked, item)
            }
            _ => {
                let Some(file) = rng.pick(&self.files).cloned() else { return (vec![], false, None) };
                let folder = Self::parent(&file);
                let to = self.fresh(&folder, rng);
                fs::hard_link(&file, &to).unwrap();
                self.files.push(to.clone());
                self.shared.insert(file.clone());
                self.shared.insert(to.clone());
                let item = inode(&to);
                self.linked.insert(file);
                self.linked.insert(to);
                (vec![folder], false, item)
            }
        }
    }
}

/// Whether the file's clone ID, after it's been cloned, is its own inode.
fn clone_id_is_inode(file: &Path) -> bool {
    let folder = file.parent().unwrap();
    let name = file.file_name().unwrap().to_string_lossy();
    match list(folder, &Context::of(folder)).outcome {
        storage_scanner::listing::Outcome::Listed(entries) => {
            entries.iter().find(|e| e.name == name).is_some_and(|e| e.clone_id == 0 || e.clone_id == e.inode)
        }
        _ => false,
    }
}

fn seeded(root: &Path) {
    fs::create_dir_all(root.join("a/b/c")).unwrap();
    fs::create_dir_all(root.join("d/e")).unwrap();
    fs::create_dir_all(root.join("empty")).unwrap();
    fs::write(root.join("a/notes.txt"), vec![b'x'; 9000]).unwrap();
    fs::write(root.join("a/b/photo.png"), vec![b'y'; 70_000]).unwrap();
    fs::write(root.join("a/b/c/main.rs"), vec![b'z'; 300]).unwrap();
    fs::write(root.join("d/backup.zip"), vec![b'w'; 150_000]).unwrap();
    fs::write(root.join("README"), b"top").unwrap();
    assert!(clone_file(&root.join("d/backup.zip"), &root.join("a/b/copy.zip")));
    // In one folder: the walk counts a hard link at whichever link its threads reach first, so only links that share a
    // folder can be compared folder by folder. `hard_links_across_folders_count_once` covers the rest.
    fs::hard_link(root.join("a/notes.txt"), root.join("a/twin.txt")).unwrap();
    fs::create_dir_all(root.join("locked/inside")).unwrap();
    fs::write(root.join("locked/inside/secret.txt"), b"hidden").unwrap();
    fs::set_permissions(root.join("locked"), fs::Permissions::from_mode(0o000)).unwrap();
}

#[test]
fn a_new_index_matches_the_walk() {
    let root = fixture("a_new_index_matches_the_walk");
    seeded(&root);
    let live = Live::build(&root);
    assert_same(&live, "built");
    assert_eq!(live.index.status(live.index.find(root.join("locked").to_str().unwrap()).unwrap().0), Status::Unreadable);
    remove(&root);
}

#[test]
fn random_changes_stay_in_step_with_the_walk() {
    random_run("random_changes_stay_in_step_with_the_walk", false);
}

#[test]
fn random_plain_changes_need_no_check() {
    random_run("random_plain_changes_need_no_check", true);
}

fn random_run(test: &str, plain: bool) {
    let root = fixture(test);
    seeded(&root);
    let mut live = Live::build(&root);
    let mut world = World::new(&root);
    world.plain = plain;
    for entry in walk_files(&root) {
        if entry.is_dir() {
            world.folders.push(entry);
        } else {
            world.files.push(entry);
        }
    }
    world.folders.retain(|f| !f.starts_with(root.join("locked")));
    world.files.retain(|f| !f.starts_with(root.join("locked")));
    world.shared.extend([root.join("d/backup.zip"), root.join("a/b/copy.zip"), root.join("a/notes.txt"), root.join("a/twin.txt")]);
    world.linked.extend([root.join("a/notes.txt"), root.join("a/twin.txt")]);
    // PITH_SEED and PITH_ROUNDS run it longer and other ways, as a stress test.
    let seed = std::env::var("PITH_SEED").ok().and_then(|s| s.parse().ok()).unwrap_or(0x5eed_1234_abcd_0001u64);
    let rounds = std::env::var("PITH_ROUNDS").ok().and_then(|s| s.parse().ok()).unwrap_or(250usize);
    let mut rng = Rng(seed);
    // Listings land in an order of their own, which mustn't change what the world does next.
    let mut landing = Rng(seed ^ 0x1a4d_0000_0000_0007);
    let mut checks = 0;
    for round in 0..rounds {
        let mut touched = Vec::new();
        let mut needs_check = false;
        for _ in 0..1 + rng.below(5) {
            let (folders, check) = world.change(&mut rng);
            touched.extend(folders);
            needs_check |= check;
        }
        live.sched.tidy(Instant::now());
        live.changed_items(&touched, &mut landing);
        if needs_check {
            checks += 1;
            live.check();
        }
        if std::env::var_os("PITH_TRACE").is_some() {
            eprintln!("round {round} done (check {needs_check})");
        }
        assert_same(&live, &format!("round {round}"));
    }
    // The run has to exercise the incremental path, not only checks.
    assert!(checks * 5 < rounds * 4, "{checks} of {rounds} rounds needed a check");
    if plain {
        // The seeded clone and hard link are never touched by a plain run's checks, since it never needs one.
        assert!(checks <= rounds / 10, "a plain run needed {checks} checks");
    }
    eprintln!("{rounds} rounds, {checks} with a check");
    remove(&root);
}

fn walk_files(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                stack.push(path.clone());
            }
            out.push(path);
        }
    }
    out
}

#[test]
fn hard_links_across_folders_count_once() {
    let root = fixture("hard_links_across_folders_count_once");
    fs::create_dir_all(root.join("one")).unwrap();
    fs::create_dir_all(root.join("two")).unwrap();
    fs::write(root.join("one/file.bin"), vec![b'h'; 30_000]).unwrap();
    fs::hard_link(root.join("one/file.bin"), root.join("two/link.bin")).unwrap();
    let mut live = Live::build(&root);
    let scanner = Scanner::new(Engine::Bulk);
    let walked = scanner.walk(&root, "root".into());
    let totals = live.index.totals(ROOT);
    assert_eq!((totals.size, totals.files), (walked.size, walked.file_count), "counted once, wherever");
    // The counted link goes: the other counts once its folder is listed, at the latest by the daily check.
    let one = live.index.find(root.join("one").to_str().unwrap()).unwrap().0;
    let counted_in_one = live.index.totals(one).files == 1;
    fs::remove_file(if counted_in_one { root.join("one/file.bin") } else { root.join("two/link.bin") }).unwrap();
    let mut rng = Rng(3);
    live.changed(&[root.join("one"), root.join("two")], &mut rng);
    let walked = Scanner::new(Engine::Bulk).walk(&root, "root".into());
    assert_eq!(live.index.totals(ROOT).size, walked.size);
    assert_eq!(live.index.inconsistencies, 0);
    remove(&root);
}

#[test]
fn a_moved_folder_is_found_again_rather_than_listed_again() {
    let root = fixture("a_moved_folder_is_found_again_rather_than_listed_again");
    seeded(&root);
    let mut live = Live::build(&root);
    let before = live.index.find(root.join("a/b").to_str().unwrap()).unwrap().0;
    fs::rename(root.join("a/b"), root.join("d/b")).unwrap();
    // The old parent's listing first: the folder waits in limbo and comes back with everything in it.
    let mut rng = Rng(7);
    live.listed(&[root.join("a")], &mut rng);
    live.changed(&[root.join("d")], &mut rng);
    let after = live.index.find(root.join("d/b").to_str().unwrap()).unwrap();
    assert_eq!(after, (before, true), "the same folder, carried over");
    assert_same(&live, "moved, old parent first");
    // The new parent's listing first: the folder is new there, and listed again in full once the old copy goes.
    fs::rename(root.join("d/b"), root.join("a/b")).unwrap();
    live.listed(&[root.join("a")], &mut rng);
    live.changed(&[root.join("d")], &mut rng);
    assert_same(&live, "moved, new parent first");
    remove(&root);
}

#[test]
fn a_clone_gives_its_bytes_back_to_the_original() {
    let root = fixture("a_clone_gives_its_bytes_back_to_the_original");
    fs::create_dir_all(root.join("store")).unwrap();
    fs::create_dir_all(root.join("project")).unwrap();
    fs::write(root.join("store/package.js"), vec![b'j'; 50_000]).unwrap();
    let mut live = Live::build(&root);
    // Cloned after the store was listed, as a package manager does: only the project's folder changes.
    assert!(clone_file(&root.join("store/package.js"), &root.join("project/package.js")));
    let mut rng = Rng(9);
    live.changed(&[root.join("project")], &mut rng);
    assert_same(&live, "cloned");
    let project = live.index.find(root.join("project").to_str().unwrap()).unwrap().0;
    assert_eq!(live.index.totals(project).size, 0, "the copy holds none of the bytes");
    remove(&root);
}

#[test]
fn a_snapshot_reopens_as_it_was_and_keeps_counting() {
    let root = fixture("a_snapshot_reopens_as_it_was_and_keeps_counting");
    seeded(&root);
    let live = Live::build(&root);
    let file = std::env::temp_dir().join(format!("pith-live-{}-snapshot.bin", std::process::id()));
    let bytes = snapshot::write(&file, &live.index, 42, "VOLUME", 1_700_000_000).unwrap();
    assert!(bytes > 0);
    let (index, meta) = snapshot::read(&file, root.to_str().unwrap(), Some("VOLUME")).unwrap();
    assert_eq!((meta.through, meta.saved_at, meta.volume.as_str()), (42, 1_700_000_000, "VOLUME"));
    let path = root.to_str().unwrap();
    assert_eq!(index.result(path, None).unwrap(), live.index.result(path, None).unwrap(), "the same map");
    // It goes on from there: clone holders and hard links restored as they were.
    let mut reopened = Live::open(&root, index);
    assert!(clone_file(&root.join("a/b/copy.zip"), &root.join("d/e/again.zip")));
    fs::write(root.join("a/b/c/new.txt"), vec![b'n'; 5000]).unwrap();
    let mut rng = Rng(11);
    reopened.changed(&[root.join("d/e"), root.join("a/b/c")], &mut rng);
    assert_same(&reopened, "reopened");

    assert!(snapshot::read(&file, "/elsewhere", Some("VOLUME")).is_err(), "a map of another folder");
    assert!(snapshot::read(&file, path, Some("OTHER")).is_err(), "a reset history");
    let mut damaged = fs::read(&file).unwrap();
    let middle = damaged.len() / 2;
    damaged[middle] ^= 0x40;
    fs::write(&file, &damaged).unwrap();
    assert!(snapshot::read(&file, path, Some("VOLUME")).is_err(), "a damaged file");
    let _ = fs::remove_file(&file);
    remove(&root);
}

#[test]
fn the_map_has_the_scan_results_shape() {
    let root = fixture("the_map_has_the_scan_results_shape");
    seeded(&root);
    let live = Live::build(&root);
    let path = root.to_str().unwrap();
    let result: serde_json::Value = serde_json::from_str(&live.index.result(path, None).unwrap()).unwrap();
    assert_eq!(result["type"], "result");
    assert_eq!(result["root"]["path"], path);
    assert_eq!(result["root"]["size"], live.index.totals(ROOT).size);
    let children: u64 = result["root"]["children"].as_array().unwrap().iter().map(|c| c["size"].as_u64().unwrap()).sum();
    assert_eq!(children, live.index.totals(ROOT).size, "the children add up to the folder");
    assert_eq!(result["summary"]["unreadable"]["denied"], 1);
    assert!(result["topFiles"].as_array().unwrap().iter().all(|f| f["path"].as_str().unwrap().starts_with(path)));
    // The largest file shows on its own; the clone copy holds nothing, so it doesn't.
    let top: Vec<&str> = result["topFiles"].as_array().unwrap().iter().map(|f| f["path"].as_str().unwrap()).collect();
    assert!(top.contains(&root.join("d/backup.zip").to_str().unwrap()));
    assert!(!top.contains(&root.join("a/b/copy.zip").to_str().unwrap()));
    // A focus inside is mapped in finer detail; a folder outside the map isn't there.
    let focused: serde_json::Value = serde_json::from_str(&live.index.result(path, Some(root.join("a").to_str().unwrap())).unwrap()).unwrap();
    assert_eq!(focused["root"]["size"], result["root"]["size"]);
    assert!(live.index.result("/nowhere", None).is_err());
    remove(&root);
}

#[test]
fn serve_checks_every_folder_when_fsevents_loses_track_of_the_map() {
    // Review of a launch's catch-up: FSEvents dropped what arrived while it replayed a long history and asked for the
    // whole disk to be scanned, which listed every folder again at once on every thread.
    let root = fixture("serve_checks_every_folder_when_fsevents_loses_track_of_the_map");
    seeded(&root);
    let mut serve = Serve::start();
    serve.send(serde_json::json!({ "cmd": "open", "root": root, "snapshot": null, "volume": "V" }));
    serve.until("opened");
    serve.send(serde_json::json!({ "cmd": "walk", "since": 100 }));
    let walked = serve.until("walked");
    // MustScanSubDirs and UserDropped, on the map's root.
    serve.send(serde_json::json!({ "cmd": "events", "events": [[101, 0x3, format!("{}/", root.display()), 0]] }));
    let checked = serve.until("checked");
    // The check counts the root too, which the walk's folder count doesn't.
    assert!(checked["folders"].as_u64() >= walked["folders"].as_u64(), "checked {checked}, walked {walked}");
    assert_eq!(checked["corrected"], 0);
    serve.close();
}

/// Review finding: Pith worked a walk's or a check's start out from how long the scanner said it ran, which `Instant`
/// measures, and `Instant` stops while the Mac sleeps, so a check the Mac slept through seemed to begin as much later
/// than it did as the sleep was long. Each says when it began by the wall clock, in seconds since 1970.
#[test]
fn a_walk_and_a_check_say_when_they_began_by_the_wall_clock() {
    let root = fixture("a_walk_and_a_check_say_when_they_began_by_the_wall_clock");
    seeded(&root);
    let now = || SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs_f64();
    let mut serve = Serve::start();
    serve.send(serde_json::json!({ "cmd": "open", "root": root, "snapshot": null, "volume": "V" }));
    serve.until("opened");
    for (command, report) in [(serde_json::json!({ "cmd": "walk", "since": 100 }), "walked"), (serde_json::json!({ "cmd": "check" }), "checked")] {
        let before = now();
        serve.send(command);
        let line = serve.until(report);
        let after = now();
        let began = line["startedAt"].as_f64().unwrap_or_else(|| panic!("no start: {line}"));
        assert!(before <= began && began <= after, "{report} began at {began}, outside {before} to {after}");
    }
    serve.close();
    remove(&root);
}

/// `serve` over its pipes: walk, report, apply events, answer for the map, save and reopen.
#[test]
fn serve_keeps_a_map_current_over_its_pipes() {
    let root = fixture("serve_keeps_a_map_current_over_its_pipes");
    seeded(&root);
    let snapshot = root.with_extension("index");
    let _ = fs::remove_file(&snapshot);
    let mut serve = Serve::start();
    serve.send(serde_json::json!({ "cmd": "open", "root": root, "snapshot": snapshot, "volume": "V" }));
    let opened = serve.until("opened");
    assert_eq!(opened["restored"], false);
    serve.send(serde_json::json!({ "cmd": "walk", "since": 100 }));
    let walked = serve.until("walked");
    let live = Live::build(&root);
    assert_eq!(walked["bytes"], live.index.totals(ROOT).size);
    serve.until("saved");

    fs::write(root.join("d/fresh.mov"), vec![b'm'; 200_000]).unwrap();
    serve.send(serde_json::json!({ "cmd": "events", "events": [[101, 0, format!("{}/d/", root.display()), 0]] }));
    // It waits for the folder to settle, then lists it, then reports everything through the event applied.
    let status = serve.until_where("status", |s| s["pending"] == 0 && s["through"] == 101);
    assert_eq!(status["changed"], true);
    serve.send(serde_json::json!({ "cmd": "tree", "path": root, "focus": null, "request": 7 }));
    let tree = serve.until("tree");
    assert_eq!(tree["request"], 7);
    let after = Live::build(&root);
    assert_eq!(tree["result"]["root"]["size"], after.index.totals(ROOT).size);
    serve.send(serde_json::json!({ "cmd": "save" }));
    assert_eq!(serve.until("saved")["through"], 101);
    serve.close();

    let mut again = Serve::start();
    again.send(serde_json::json!({ "cmd": "open", "root": root, "snapshot": snapshot, "volume": "V" }));
    let reopened = again.until("opened");
    assert_eq!((reopened["restored"].clone(), reopened["through"].clone()), (serde_json::json!(true), serde_json::json!(101)));
    again.send(serde_json::json!({ "cmd": "tree", "path": root, "focus": null, "request": 8 }));
    assert_eq!(again.until("tree")["result"]["root"]["size"], after.index.totals(ROOT).size);
    // A second copy of Pith can't save over the map this one keeps.
    let mut rival = Serve::start();
    rival.send(serde_json::json!({ "cmd": "open", "root": root, "snapshot": snapshot, "volume": "V" }));
    assert_eq!(rival.until("opened")["locked"], true);
    rival.close();
    again.close();
    let _ = fs::remove_file(&snapshot);
    let _ = fs::remove_file(snapshot.with_extension("lock"));
    remove(&root);
}

/// `serve` answers for the known places Pith names with the map they go with, from the same index: each folder's size
/// as that map shows it, or none where the map can't read it, and nothing for a place that isn't there.
#[test]
fn serve_gives_each_place_its_size_in_the_map_it_answers_with() {
    let root = fixture("serve_gives_each_place_its_size_in_the_map_it_answers_with");
    seeded(&root);
    let mut serve = Serve::start();
    serve.send(serde_json::json!({ "cmd": "open", "root": root, "snapshot": null, "volume": "V" }));
    serve.until("opened");
    serve.send(serde_json::json!({ "cmd": "walk", "since": 100 }));
    serve.until("walked");
    let at = |path: &str| root.join(path).to_string_lossy().into_owned();
    let places = [at("a"), at("a/b"), at("d/e"), at("locked"), at("locked/inside"), at("nowhere"), "/elsewhere".to_string()];
    serve.send(serde_json::json!({ "cmd": "tree", "path": root, "focus": null, "request": 3, "places": places }));
    let line = serve.line_where("tree", |_| true);
    let tree: serde_json::Value = serde_json::from_str(&line).unwrap();
    let answered: HashMap<String, serde_json::Value> =
        tree["places"].as_array().unwrap().iter().map(|place| (place["path"].as_str().unwrap().to_string(), place["size"].clone())).collect();
    fn find<'a>(node: &'a serde_json::Value, path: &str) -> Option<&'a serde_json::Value> {
        if node["path"] == path {
            return Some(node);
        }
        node["children"].as_array()?.iter().find_map(|child| find(child, path))
    }
    for folder in ["a", "a/b"] {
        let node = find(&tree["result"]["root"], &at(folder)).unwrap_or_else(|| panic!("the map has no {folder}"));
        assert_eq!(answered[&at(folder)], node["size"], "{folder}'s size is the map's");
    }
    assert_eq!(answered[&at("locked")], serde_json::Value::Null, "a folder the map couldn't read");
    assert_eq!(answered[&at("locked/inside")], serde_json::Value::Null, "inside one, where the map can't tell");
    assert_eq!(answered.len(), 5, "nothing for a folder that isn't there, or one outside the map: {answered:?}");
    // A folder too small for a block of its own in this map has the size its own map gives it.
    assert!(find(&tree["result"]["root"], &at("d/e")).is_none());
    serve.send(serde_json::json!({ "cmd": "tree", "path": at("d/e"), "focus": null, "request": 4 }));
    assert_eq!(answered[&at("d/e")], serve.until("tree")["result"]["root"]["size"]);
    // Pith hands the page the map as the scanner wrote it, everything after `,"result":`, so the places come first.
    assert!(line.find(r#","places":"#).is_some_and(|places| line.find(r#","result":"#).is_some_and(|result| places < result)), "{line}");
    // A map asked for without places says nothing of any.
    serve.send(serde_json::json!({ "cmd": "tree", "path": root, "focus": null, "request": 5 }));
    assert_eq!(serve.until("tree")["places"], serde_json::json!([]));
    serve.close();
    remove(&root);
}

/// Each place says how many files it holds and whether it holds folders, beside its size: the index counts a clone copy
/// whose bytes another copy holds, and an empty file, in its files and not its bytes, so a Trash holding only those, or
/// only empty folders, has no bytes and isn't empty.
#[test]
fn serve_says_what_each_place_holds_beside_its_size() {
    let root = fixture("serve_says_what_each_place_holds_beside_its_size");
    for folder in ["kept", "empty", "copies", "blank", "folders/inner", "pointing"] {
        fs::create_dir_all(root.join(folder)).unwrap();
    }
    fs::write(root.join("kept/original.bin"), vec![b'o'; 70_000]).unwrap();
    // The copy is made after the original, so the original, the lower inode, holds the bytes.
    assert!(clone_file(&root.join("kept/original.bin"), &root.join("copies/duplicate.bin")));
    fs::write(root.join("blank/empty.txt"), b"").unwrap();
    std::os::unix::fs::symlink(root.join("kept/original.bin"), root.join("pointing/shortcut")).unwrap();
    let mut serve = Serve::start();
    serve.send(serde_json::json!({ "cmd": "open", "root": root, "snapshot": null, "volume": "V" }));
    serve.until("opened");
    serve.send(serde_json::json!({ "cmd": "walk", "since": 100 }));
    serve.until("walked");
    let at = |path: &str| root.join(path).to_string_lossy().into_owned();
    let places = [at("kept"), at("empty"), at("copies"), at("blank"), at("folders"), at("pointing")];
    serve.send(serde_json::json!({ "cmd": "tree", "path": root, "focus": null, "request": 3, "places": places }));
    let tree = serve.until("tree");
    let answered: HashMap<String, serde_json::Value> =
        tree["places"].as_array().unwrap().iter().map(|place| (place["path"].as_str().unwrap().to_string(), place.clone())).collect();
    let held = |path: &str| {
        let place = &answered[&at(path)];
        (place["size"].as_u64(), place["files"].as_u64(), place["subfolders"].as_bool())
    };
    let (kept, files, subfolders) = held("kept");
    assert!(kept.is_some_and(|size| size >= 70_000), "the original holds the bytes: {kept:?}");
    assert_eq!((files, subfolders), (Some(1), Some(false)));
    assert_eq!(held("empty"), (Some(0), Some(0), Some(false)), "nothing at all");
    assert_eq!(held("copies"), (Some(0), Some(1), Some(false)), "a copy whose bytes the original holds");
    assert_eq!(held("blank"), (Some(0), Some(1), Some(false)), "an empty file");
    assert_eq!(held("folders"), (Some(0), Some(0), Some(true)), "an empty folder");
    assert_eq!(held("pointing"), (Some(0), Some(0), Some(false)), "a symbolic link, which no total counts");
    let entries = |path: &str| answered[&at(path)]["entries"].as_bool();
    assert_eq!(["kept", "empty", "copies", "blank", "folders", "pointing"].map(entries), [true, false, true, true, true, true].map(Some),
               "whether each listing had any entry at all");
    serve.close();
    remove(&root);
}

struct Serve {
    child: std::process::Child,
    lines: mpsc::Receiver<String>,
}

impl Serve {
    fn start() -> Serve {
        let mut child = Command::new(env!("CARGO_BIN_EXE_storage-scanner"))
            .arg("serve")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        let stdout = child.stdout.take().unwrap();
        let (tx, lines) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if tx.send(line).is_err() {
                    break;
                }
            }
        });
        Serve { child, lines }
    }

    fn send(&mut self, command: serde_json::Value) {
        let stdin = self.child.stdin.as_mut().unwrap();
        writeln!(stdin, "{command}").unwrap();
        stdin.flush().unwrap();
    }

    fn until(&mut self, kind: &str) -> serde_json::Value {
        self.until_where(kind, |_| true)
    }

    fn until_where(&mut self, kind: &str, accept: impl Fn(&serde_json::Value) -> bool) -> serde_json::Value {
        serde_json::from_str(&self.line_where(kind, accept)).unwrap()
    }

    /// The next line of `kind` that `accept` takes, as `serve` wrote it.
    fn line_where(&mut self, kind: &str, accept: impl Fn(&serde_json::Value) -> bool) -> String {
        loop {
            let line = self.lines.recv_timeout(Duration::from_secs(20)).unwrap_or_else(|_| panic!("no {kind} line within 20 s"));
            let value: serde_json::Value = serde_json::from_str(&line).unwrap();
            assert_ne!(value["type"], "error", "serve reported an error: {line}");
            assert_ne!(value["type"], "fatal", "serve stopped: {line}");
            if value["type"] == kind && accept(&value) {
                return line;
            }
        }
    }

    fn close(mut self) {
        drop(self.child.stdin.take());
        let _ = self.child.wait();
    }
}

/// Review finding: a listing's follow-ups carried no event ID, so the saved position passed a change whose subtree
/// was still being listed, and a snapshot taken then reopened with that subtree out of date.
#[test]
fn the_saved_position_waits_for_a_changes_whole_subtree() {
    let root = fixture("the_saved_position_waits_for_a_changes_whole_subtree");
    seeded(&root);
    let mut live = Live::build(&root);
    fs::write(root.join("a/b/c/new.bin"), vec![b'n'; 200_000]).unwrap();
    live.sched.received(500);
    // MustScanSubDirs on `a`: the whole subtree is listed again, a folder at a time.
    live.sched.note_item(root.join("a").to_string_lossy().into_owned(), Some(500), true, Instant::now(), true, None);
    let first = live.sched.due(&live.index, Instant::now());
    assert_eq!(first.len(), 1);
    let listing = list(&first[0].path, &live.cx);
    let (children, _) = live.sched.landed(&mut live.index, &first[0], listing, Duration::ZERO, Instant::now());
    assert!(!children.is_empty(), "the deep listing goes on to a's subfolders");
    assert!(live.sched.through() < 500, "the change isn't applied while a's subfolders wait: through {}", live.sched.through());
    live.drain(children, &mut Rng(5));
    assert_eq!(live.sched.through(), 500);
    assert_same(&live, "after the subtree");
    remove(&root);
}

/// Review finding: saving dropped a clone group whose holder had just gone, runner-up and all, before repair handed
/// its bytes on, so they counted nowhere.
#[test]
fn a_save_hands_a_lost_holders_bytes_to_its_runner_up() {
    let root = fixture("a_save_hands_a_lost_holders_bytes_to_its_runner_up");
    fs::create_dir_all(root.join("x")).unwrap();
    fs::create_dir_all(root.join("y")).unwrap();
    fs::write(root.join("x/original.bin"), vec![b'o'; 300_000]).unwrap();
    assert!(clone_file(&root.join("x/original.bin"), &root.join("y/copy.bin")));
    let mut live = Live::build(&root);
    fs::remove_file(root.join("x/original.bin")).unwrap();
    // Only x's listing lands before the save: the copy's folder isn't listed again.
    let x = live.index.find(root.join("x").to_str().unwrap()).unwrap().0;
    let request = live.sched.submit(x, root.join("x"), Purpose::Relist, false, None).unwrap();
    let listing = list(&request.path, &live.cx);
    live.sched.landed(&mut live.index, &request, listing, Duration::ZERO, Instant::now());
    let file = std::env::temp_dir().join(format!("pith-live-{}-runner.bin", std::process::id()));
    live.index.purge();
    snapshot::write(&file, &live.index, 1, "V", 1).unwrap();
    assert_same(&live, "purged");
    let (index, _) = snapshot::read(&file, root.to_str().unwrap(), Some("V")).unwrap();
    let reopened = Live::open(&root, index);
    assert_same(&reopened, "reopened");
    let _ = fs::remove_file(&file);
    remove(&root);
}

/// Review finding: a folder found missing was asked for again at every turn until its parent's listing landed.
#[test]
fn a_missing_folder_waits_for_its_parents_listing() {
    let root = fixture("a_missing_folder_waits_for_its_parents_listing");
    seeded(&root);
    let mut live = Live::build(&root);
    let b = live.index.find(root.join("a/b").to_str().unwrap()).unwrap().0;
    fs::remove_dir_all(root.join("a/b")).unwrap();
    live.sched.note(root.join("a/b").to_string_lossy().into_owned(), None, false, Instant::now(), true);
    let mut queue = live.sched.due(&live.index, Instant::now());
    let mut asked_for_b = 0;
    while let Some(request) = queue.pop() {
        if request.folder == b {
            asked_for_b += 1;
        }
        let listing = list(&request.path, &live.cx);
        let (next, _) = live.sched.landed(&mut live.index, &request, listing, Duration::ZERO, Instant::now());
        queue.extend(next);
        queue.extend(live.sched.due(&live.index, Instant::now()));
        assert!(asked_for_b < 10, "b is asked for in a loop");
    }
    assert_eq!(asked_for_b, 1, "b once, then its parent, whose listing shows it gone");
    live.index.settle(Duration::ZERO, true);
    assert_same(&live, "deleted");
    remove(&root);
}

/// Review finding: a walk kept every folder it made in the table of recent folders, 66 MB for a whole disk.
#[test]
fn a_walk_keeps_no_folders_in_mind_as_moves() {
    let root = fixture("a_walk_keeps_no_folders_in_mind_as_moves");
    seeded(&root);
    let mut live = Live::build(&root);
    assert_eq!(live.index.stats().recent, 0);
    fs::create_dir_all(root.join("d/later")).unwrap();
    // Listed without settling, which forgets recent folders past their grace.
    live.listed(&[root.join("d")], &mut Rng(4));
    assert_eq!(live.index.stats().recent, 1, "a folder made since may be a move");
    remove(&root);
}

/// Review finding: a subfolder with nothing in its totals, empty or unreadable, left its parent without the listing
/// that dropped it counting as a change, so the live map kept it on screen until something else changed. Joining
/// counts too, so the map shows a new folder with its parent's listing.
#[test]
fn a_subfolder_joining_or_leaving_is_a_change_though_it_holds_nothing() {
    let root = fixture("a_subfolder_joining_or_leaving_is_a_change_though_it_holds_nothing");
    fs::create_dir_all(root.join("empty")).unwrap();
    fs::create_dir_all(root.join("locked")).unwrap();
    fs::write(root.join("kept.bin"), vec![b'k'; 10_000]).unwrap();
    fs::set_permissions(root.join("locked"), fs::Permissions::from_mode(0o000)).unwrap();
    let mut live = Live::build(&root);
    let locked = live.index.find(root.join("locked").to_str().unwrap()).unwrap().0;
    assert_eq!(live.index.status(locked), Status::Unreadable);
    // The root listed again on its own, as a folder FSEvents names is: whether its listing changed what the map shows.
    let relisted = |live: &mut Live| {
        let request = live.sched.submit(ROOT, root.clone(), Purpose::Relist, false, None).unwrap();
        let listing = list(&request.path, &live.cx);
        live.sched.landed(&mut live.index, &request, listing, Duration::ZERO, Instant::now()).1.changed
    };
    assert!(!relisted(&mut live), "nothing changed yet");
    fs::remove_dir(root.join("empty")).unwrap();
    assert!(relisted(&mut live), "an empty folder left");
    fs::set_permissions(root.join("locked"), fs::Permissions::from_mode(0o755)).unwrap();
    fs::remove_dir(root.join("locked")).unwrap();
    assert!(relisted(&mut live), "a folder the map couldn't read left");
    fs::create_dir(root.join("new")).unwrap();
    assert!(relisted(&mut live), "an empty folder joined");
    assert!(!relisted(&mut live), "and nothing since");
    remove(&root);
}

/// A folder Pith asks to have listed again, as after the person moved an item out of it to the Trash, is listed at once,
/// though its last listing took long enough to put it in a cooldown: the person waits on it. A change FSEvents names
/// still waits the cooldown out.
#[test]
fn a_relist_pith_asks_for_skips_the_folders_cooldown() {
    let root = fixture("a_relist_pith_asks_for_skips_the_folders_cooldown");
    seeded(&root);
    let mut live = Live::build(&root);
    let mut sched = Scheduler::new(Duration::ZERO, 200);
    let a = root.join("a");
    let id = live.index.find(a.to_str().unwrap()).unwrap().0;
    let request = sched.submit(id, a.clone(), Purpose::Relist, false, None).unwrap();
    let listing = list(&a, &live.cx);
    // A listing that took a second: the folder waits 200 seconds before its next.
    sched.landed(&mut live.index, &request, listing, Duration::from_secs(1), Instant::now());
    sched.note(a.to_string_lossy().into_owned(), None, false, Instant::now(), true);
    assert!(sched.due(&live.index, Instant::now()).is_empty(), "a change waits out the cooldown");
    sched.ask(a.to_string_lossy().into_owned(), false, Instant::now());
    let due: Vec<u32> = sched.due(&live.index, Instant::now()).iter().map(|request| request.folder).collect();
    assert_eq!(due, vec![id], "Pith's own relist comes at once");
    remove(&root);
}

/// Pith's own relist of a folder by request, as Check Again asks for one, with everything inside it: it's answered once
/// the folder and every folder inside it have been listed again, and not before, and once. A relist of a path the index
/// doesn't have, inside the map or outside it, has nothing to list and is answered as soon as that's known.
#[test]
fn a_relist_pith_asks_for_is_answered_once_everything_inside_it_has_landed() {
    let root = fixture("a_relist_pith_asks_for_is_answered_once_everything_inside_it_has_landed");
    seeded(&root);
    let mut live = Live::build(&root);
    live.sched.ask_for(root.join("a").to_string_lossy().into_owned(), true, Instant::now(), 7);
    let mut queue = live.sched.due(&live.index, Instant::now());
    assert_eq!(queue.len(), 1, "a first");
    let mut landed = 0;
    while let Some(request) = queue.pop() {
        assert!(live.sched.take_answered().is_empty(), "answered after {landed} listings, with {} to go", queue.len() + 1);
        let listing = list(&request.path, &live.cx);
        let (next, _) = live.sched.landed(&mut live.index, &request, listing, Duration::ZERO, Instant::now());
        landed += 1;
        queue.extend(next);
        queue.extend(live.sched.due(&live.index, Instant::now()));
    }
    assert_eq!(landed, 3, "a, a/b and a/b/c");
    assert_eq!(live.sched.take_answered(), vec![7]);
    assert!(live.sched.take_answered().is_empty(), "answered once");

    live.sched.ask_for("/elsewhere".into(), true, Instant::now(), 8);
    assert!(live.sched.due(&live.index, Instant::now()).is_empty());
    assert_eq!(live.sched.take_answered(), vec![8], "outside the map");
    live.sched.ask_for(root.join("gone/deeper").to_string_lossy().into_owned(), true, Instant::now(), 9);
    let mut queue = live.sched.due(&live.index, Instant::now());
    while let Some(request) = queue.pop() {
        let listing = list(&request.path, &live.cx);
        let (next, _) = live.sched.landed(&mut live.index, &request, listing, Duration::ZERO, Instant::now());
        queue.extend(next);
        queue.extend(live.sched.due(&live.index, Instant::now()));
    }
    assert_eq!(live.sched.take_answered(), vec![9], "once the root's listing shows there's no such folder");
    remove(&root);
}

/// `serve` answers Pith's relist of a folder by request once it has landed, so the map asked for after it has what the
/// relist found, deep inside the folder too.
#[test]
fn serve_answers_a_relist_pith_asks_for_once_it_has_landed() {
    let root = fixture("serve_answers_a_relist_pith_asks_for_once_it_has_landed");
    seeded(&root);
    let mut serve = Serve::start();
    serve.send(serde_json::json!({ "cmd": "open", "root": root, "snapshot": null, "volume": "V" }));
    serve.until("opened");
    serve.send(serde_json::json!({ "cmd": "walk", "since": 100 }));
    serve.until("walked");
    // No event for it: only the relist finds it.
    fs::write(root.join("a/b/c/new.bin"), vec![b'n'; 200_000]).unwrap();
    serve.send(serde_json::json!({ "cmd": "relist", "path": root.join("a"), "deep": true, "request": 5 }));
    assert_eq!(serve.until("relisted")["request"], 5);
    serve.send(serde_json::json!({ "cmd": "tree", "path": root, "focus": null, "request": 6 }));
    assert_eq!(serve.until("tree")["result"]["root"]["size"], Live::build(&root).index.totals(ROOT).size);
    serve.close();
    remove(&root);
}

/// Which of the person's own changes the index doesn't show yet: an item moved to the Trash while the index still holds
/// it, and one put back until the index has listed it, a folder with everything inside it but what waits on macOS.
#[test]
fn the_index_says_which_of_pith_s_own_changes_it_doesnt_show_yet() {
    let root = fixture("the_index_says_which_of_pith_s_own_changes_it_doesnt_show_yet");
    seeded(&root);
    let mut live = Live::build(&root);
    let at = |relative: &str| root.join(relative).to_string_lossy().into_owned();
    let unlisted = |live: &Live, gone: &[String], back: &[String], asking: &dyn Fn(u32) -> bool| live.index.unlisted(gone, back, asking);
    let (photo, folder) = (at("a/b/photo.png"), at("d/e"));
    let away = root.with_extension("trash");
    remove(&away);
    fs::create_dir_all(&away).unwrap();
    // Moved out of the map: the index still holds both until their folders are listed again.
    fs::rename(&photo, away.join("photo.png")).unwrap();
    fs::rename(&folder, away.join("e")).unwrap();
    let both = vec![photo.clone(), folder.clone()];
    assert_eq!(unlisted(&live, &both, &[], &|_| false), both, "still held");
    assert_eq!(unlisted(&live, &[], &both, &|_| false), Vec::<String>::new(), "a change the other way is shown");
    live.listed(&[root.join("a/b"), root.join("d")], &mut Rng(11));
    assert_eq!(unlisted(&live, &both, &[], &|_| false), Vec::<String>::new(), "listed without them");
    // Put back: missing until their folders are listed again.
    fs::rename(away.join("photo.png"), &photo).unwrap();
    fs::rename(away.join("e"), &folder).unwrap();
    assert_eq!(unlisted(&live, &[], &both, &|_| false), both);
    live.listed(&[root.join("a/b"), root.join("d")], &mut Rng(12));
    assert_eq!(unlisted(&live, &[], &both, &|_| false), Vec::<String>::new(), "listed again, the folder whole, as it came back from limbo");
    // A folder found in its parent's listing but not listed itself, nor what's inside it, isn't listed whole, unless it
    // waits on macOS, which can take as long as the person takes to answer.
    fs::create_dir_all(root.join("new/inner")).unwrap();
    fs::write(root.join("new/inner/x.bin"), vec![b'x'; 10_000]).unwrap();
    let new = at("new");
    let request = live.sched.submit(ROOT, root.clone(), Purpose::Relist, false, None).unwrap();
    let listing = list(&request.path, &live.cx);
    let (next, _) = live.sched.landed(&mut live.index, &request, listing, Duration::ZERO, Instant::now());
    let id = live.index.find(&new).unwrap().0;
    assert_eq!(unlisted(&live, &[], &[new.clone()], &|_| false), vec![new.clone()], "found, not listed");
    assert_eq!(unlisted(&live, &[], &[new.clone()], &|folder| folder == id), Vec::<String>::new(), "waiting on macOS");
    live.drain(next, &mut Rng(13));
    assert_eq!(unlisted(&live, &[], &[new.clone()], &|_| false), Vec::<String>::new(), "listed whole");
    assert_eq!(unlisted(&live, &[at("nowhere"), "/elsewhere".into()], &[], &|_| false), Vec::<String>::new(), "nothing held there");
    remove(&away);
    remove(&root);
}

/// `serve` answers a map with which of the person's own changes its index doesn't show yet, before the map itself, and
/// Pith's relist of the folder brings them in at once.
#[test]
fn serve_says_which_of_pith_s_own_changes_its_map_doesnt_show_yet() {
    let root = fixture("serve_says_which_of_pith_s_own_changes_its_map_doesnt_show_yet");
    seeded(&root);
    // Over a mebibyte, so the index keeps the file by name, as a map shows it on its own.
    fs::write(root.join("d/movie.mov"), vec![b'm'; 2_000_000]).unwrap();
    let mut serve = Serve::start();
    serve.send(serde_json::json!({ "cmd": "open", "root": root, "snapshot": null, "volume": "V" }));
    serve.until("opened");
    serve.send(serde_json::json!({ "cmd": "walk", "since": 100 }));
    serve.until("walked");
    let at = |relative: &str| root.join(relative).to_string_lossy().into_owned();
    let both = vec![at("d/movie.mov"), at("d/e")];
    let mut request = 0;
    let mut ask = |serve: &mut Serve, gone: &[String], back: &[String]| -> (String, Vec<String>) {
        request += 1;
        serve.send(serde_json::json!({ "cmd": "tree", "path": root, "focus": null, "request": request, "gone": gone, "back": back }));
        let line = serve.line_where("tree", |tree| tree["request"] == request);
        let tree: serde_json::Value = serde_json::from_str(&line).unwrap();
        let unlisted = tree["unlisted"].as_array().unwrap_or_else(|| panic!("no unlisted in {line}")).iter().map(|p| p.as_str().unwrap().to_string()).collect();
        (line, unlisted)
    };
    let away = root.with_extension("trash");
    remove(&away);
    fs::create_dir_all(&away).unwrap();
    fs::rename(root.join("d/movie.mov"), away.join("movie.mov")).unwrap();
    fs::rename(root.join("d/e"), away.join("e")).unwrap();
    let (line, held) = ask(&mut serve, &both, &[]);
    assert_eq!(held, both, "the index has both until d is listed again");
    assert!(line.find(r#","unlisted":"#).is_some_and(|unlisted| line.find(r#","result":"#).is_some_and(|result| unlisted < result)), "{line}");
    serve.send(serde_json::json!({ "cmd": "relist", "path": at("d"), "deep": false }));
    let deadline = Instant::now() + Duration::from_secs(10);
    while !ask(&mut serve, &both, &[]).1.is_empty() {
        assert!(Instant::now() < deadline, "d was never listed again");
        std::thread::sleep(Duration::from_millis(50));
    }
    fs::rename(away.join("movie.mov"), root.join("d/movie.mov")).unwrap();
    fs::rename(away.join("e"), root.join("d/e")).unwrap();
    assert_eq!(ask(&mut serve, &[], &both).1, both, "put back, missing until d is listed again");
    serve.send(serde_json::json!({ "cmd": "relist", "path": at("d"), "deep": false }));
    let deadline = Instant::now() + Duration::from_secs(10);
    while !ask(&mut serve, &[], &both).1.is_empty() {
        assert!(Instant::now() < deadline, "d was never listed again");
        std::thread::sleep(Duration::from_millis(50));
    }
    assert_eq!(ask(&mut serve, &[], &[]).1, Vec::<String>::new(), "a map asked for without changes says nothing of any");
    serve.close();
    remove(&away);
    remove(&root);
}

/// A place the map can't read says whether it waits on macOS's question about Pith, which the person's answer settles,
/// or the map couldn't read it, which only Full Disk Access or its permissions change: Places words the two apart.
#[test]
fn a_place_says_whether_it_waits_on_macos() {
    let root = fixture("a_place_says_whether_it_waits_on_macos");
    seeded(&root);
    let mut live = Live::build(&root);
    fs::create_dir_all(root.join("asked")).unwrap();
    // The root listed again finds the new folder, which isn't listed itself yet.
    let request = live.sched.submit(ROOT, root.clone(), Purpose::Relist, false, None).unwrap();
    let listing = list(&request.path, &live.cx);
    live.sched.landed(&mut live.index, &request, listing, Duration::ZERO, Instant::now());
    let at = |relative: &str| root.join(relative).to_string_lossy().into_owned();
    let asked = live.index.find(&at("asked")).unwrap().0;
    let paths = [at("asked"), at("asked/inside"), at("locked"), at("d")];
    let waiting = live.index.places(&paths, &|folder| folder == asked);
    let by_path: HashMap<&str, &storage_scanner::index::Place> = waiting.iter().map(|place| (place.path.as_str(), place)).collect();
    assert_eq!((by_path[at("asked").as_str()].size, by_path[at("asked").as_str()].asking), (None, true), "macOS is asking");
    assert_eq!(by_path[at("asked/inside").as_str()].asking, true, "inside a folder macOS is asking about");
    assert_eq!((by_path[at("locked").as_str()].size, by_path[at("locked").as_str()].asking), (None, false), "unreadable");
    assert!(!by_path[at("d").as_str()].asking && by_path[at("d").as_str()].size.is_some());
    // Waiting its turn, not on macOS, it's no place yet; and only a place that waits says so.
    assert!(live.index.places(&[at("asked")], &|_| false).is_empty());
    let json = serde_json::to_value(&waiting).unwrap();
    assert_eq!(json.as_array().unwrap().iter().filter(|place| place.get("asking").is_some()).count(), 2, "{json}");
    remove(&root);
}
