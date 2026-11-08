//! Directory traversal. Fast path uses the macOS `getattrlistbulk(2)` syscall to batch
//! "readdir + stat" into one kernel call (128 KB buffer -> many entries per call); a
//! portable `std::fs` path is the fallback. Both parallelize across cores with rayon,
//! dedup hardlinks by device and inode, and never follow symlinks.
//!
//! The walk stays on the scanned folder's file system: a folder with another file system
//! mounted on it becomes a volume node (see `volumes`), and the startup disk's firmlinked
//! folders are counted once, at their visible paths. Folders it can't open are kept as
//! unreadable nodes with the reason, and iCloud items that aren't downloaded are counted
//! without being read, so a scan never downloads them.
//!
//! Full APFS clones share every block, so each group of them is counted once, at the copy macOS made first (the
//! lowest inode, which is also the group's clone ID), whichever order the parallel walk reaches them in. The other
//! copies count as files with no size, and their folders report the bytes as `clones`. Reading the clone ID and the
//! sharing flags in bulk added 5% to a scan of ~/Library (3.0 million files, 19.2 s to 20.2 s) and 45% to a folder
//! of pnpm projects whose node_modules are all clones (892,000 files, 3.2 s to 4.6 s).

use std::collections::hash_map::Entry as Slot;
use std::collections::{BinaryHeap, HashMap, HashSet};
use std::ffi::CString;
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
use std::os::unix::ffi::{OsStrExt, OsStringExt};
use std::os::macos::fs::MetadataExt as _;
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

use rayon::prelude::*;

use crate::kinds::{kind_of, KindBytes};
use crate::model::{CloneTag, DirNode, DirStatus, FileEntry, UnreadableReason};
use crate::volumes::{self, Identity, VolumeEntry};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Engine {
    Bulk,
    Std,
}

const INODE_SHARDS: usize = 128;
const TOP_FILES_GLOBAL: usize = 200;
/// Unreadable folders listed in the result, shallowest first. A startup-disk scan of the development Mac found
/// 487 with Full Disk Access off; past the cap the summary's counts still cover every one.
pub const UNREADABLE_LISTED: usize = 1000;

/// A folder the scan couldn't read, for the result's list.
#[derive(Clone, serde::Serialize)]
pub struct UnreadableFolder {
    pub path: String,
    pub reason: UnreadableReason,
}

/// `st_flags` bit for an iCloud or File Provider item whose contents aren't on this Mac (`<sys/stat.h>`).
const SF_DATALESS: u32 = 0x4000_0000;

/// Counts of unreadable folders by reason, for the summary.
#[derive(Default)]
pub struct UnreadableCounts {
    pub protected: AtomicU64,
    pub denied: AtomicU64,
    pub other: AtomicU64,
}

/// Full clones the scan counted once, at another copy of their group.
#[derive(Default)]
pub struct CloneCounts {
    pub files: AtomicU64,
    /// Their sizes, which the totals leave out.
    pub bytes: AtomicU64,
}

/// The copy of a clone group that holds its bytes so far, and the folder that counts them.
#[derive(Clone, Copy)]
struct Holder {
    inode: u64,
    dir: u32,
    size: u64,
    kind: u8,
}

/// Bytes a folder counted for clone copies that another copy, found later, holds instead.
#[derive(Clone, Copy, Default)]
struct Released {
    bytes: u64,
    kinds: KindBytes,
}

impl Released {
    fn add(&mut self, other: &Released) {
        self.bytes += other.bytes;
        self.kinds.add(&other.kinds);
    }
}

/// iCloud and File Provider items the scan left in the cloud.
#[derive(Default)]
pub struct CloudCounts {
    pub files: AtomicU64,
    /// The files' full sizes, which they'd take once downloaded; on disk they take almost nothing.
    pub bytes: AtomicU64,
    /// Folders whose contents macOS hasn't listed yet, so their files and sizes are unknown.
    pub folders: AtomicU64,
}

/// What the walk needs to know about the scanned folder before it starts.
struct Context {
    device: u64,
    /// The APFS container holding the scanned folder, such as "disk3".
    container: Option<String>,
    firmlinks: HashMap<Identity, PathBuf>,
}

impl Context {
    fn of(root: &Path) -> Self {
        let device = std::fs::symlink_metadata(root).map(|m| m.dev()).unwrap_or(0);
        let container = volumes::mounted_from(root).and_then(|from| volumes::container_of(&from).map(str::to_owned));
        let list = std::fs::read_to_string(volumes::FIRMLINKS).unwrap_or_default();
        Context { device, container, firmlinks: volumes::firmlinks_inside(root, device, &list) }
    }
}

/// Shared scan state. Counters drive the live progress feed; the sharded inode sets
/// dedup hardlinks with low lock contention; `top` keeps the globally largest files.
pub struct Scanner {
    pub engine: Engine,
    pub dirs: AtomicU64,
    pub files: AtomicU64,
    pub bytes: AtomicU64,
    /// Folders the scan couldn't read; `unreadable` splits them by reason.
    pub errors: AtomicU64,
    /// Entries inside a readable folder that macOS wouldn't describe, which the totals leave out.
    pub entry_errors: AtomicU64,
    pub unreadable: UnreadableCounts,
    pub cloud: CloudCounts,
    pub clones: CloneCounts,
    seen_inodes: Vec<Mutex<HashSet<Identity>>>,
    /// Each clone group's holder, by device and clone ID.
    holders: Vec<Mutex<HashMap<(u64, u64), Holder>>>,
    /// Bytes to take back out of folders whose copy lost its group to an earlier-made one, by folder ID.
    released: Vec<Mutex<HashMap<u32, Released>>>,
    any_released: AtomicBool,
    next_dir: AtomicU32,
    top: Mutex<TopFiles>,
    volumes: Mutex<Vec<VolumeEntry>>,
    unreadable_folders: Mutex<Vec<UnreadableFolder>>,
    context: OnceLock<Context>,
}

fn shards<T: Default>() -> Vec<Mutex<T>> {
    (0..INODE_SHARDS).map(|_| Mutex::new(T::default())).collect()
}

impl Scanner {
    pub fn new(engine: Engine) -> Self {
        Scanner {
            engine,
            dirs: AtomicU64::new(0),
            files: AtomicU64::new(0),
            bytes: AtomicU64::new(0),
            errors: AtomicU64::new(0),
            entry_errors: AtomicU64::new(0),
            unreadable: UnreadableCounts::default(),
            cloud: CloudCounts::default(),
            clones: CloneCounts::default(),
            seen_inodes: shards(),
            holders: shards(),
            released: shards(),
            any_released: AtomicBool::new(false),
            next_dir: AtomicU32::new(0),
            top: Mutex::new(TopFiles::new(TOP_FILES_GLOBAL)),
            volumes: Mutex::new(Vec::new()),
            unreadable_folders: Mutex::new(Vec::new()),
            context: OnceLock::new(),
        }
    }

    /// Whether this copy holds its clone group's bytes: true for the first copy seen, and for a copy made before
    /// the current holder, which then gives its bytes back to its folder in `settle`.
    fn hold_clone(&self, tag: CloneTag, dir: u32, size: u64, kind: usize) -> bool {
        let candidate = Holder { inode: tag.inode, dir, size, kind: kind as u8 };
        let displaced = {
            let mut holders = self.holders[(tag.id as usize) % INODE_SHARDS].lock().unwrap();
            match holders.entry((tag.device, tag.id)) {
                Slot::Vacant(slot) => {
                    slot.insert(candidate);
                    return true;
                }
                Slot::Occupied(mut slot) if tag.inode < slot.get().inode => slot.insert(candidate),
                Slot::Occupied(_) => return false,
            }
        };
        self.bytes.fetch_sub(displaced.size, Ordering::Relaxed);
        self.clones.files.fetch_add(1, Ordering::Relaxed);
        self.clones.bytes.fetch_add(displaced.size, Ordering::Relaxed);
        let mut released = self.released[(displaced.dir as usize) % INODE_SHARDS].lock().unwrap();
        let folder = released.entry(displaced.dir).or_default();
        folder.bytes += displaced.size;
        folder.kinds.0[displaced.kind as usize] += displaced.size;
        self.any_released.store(true, Ordering::Relaxed);
        true
    }

    /// Whether the copy `tag` names still holds its group's bytes once the walk is done.
    fn holds(&self, tag: CloneTag) -> bool {
        let holders = self.holders[(tag.id as usize) % INODE_SHARDS].lock().unwrap();
        holders.get(&(tag.device, tag.id)).is_none_or(|holder| holder.inode == tag.inode)
    }

    /// Takes the bytes of copies that lost their group out of their folders and every folder above, and drops those
    /// copies from the largest-files lists. Returns what left this subtree.
    fn settle(&self, node: &mut DirNode) -> Released {
        let mut left = self.released[(node.id as usize) % INODE_SHARDS].lock().unwrap().remove(&node.id).unwrap_or_default();
        node.own_files_size = node.own_files_size.saturating_sub(left.bytes);
        node.own_clones += left.bytes;
        for child in &mut node.dirs {
            let below = self.settle(child);
            left.add(&below);
        }
        node.size = node.size.saturating_sub(left.bytes);
        node.kinds.subtract(&left.kinds);
        node.clones += left.bytes;
        let mut changed = false;
        for file in &mut node.top_files {
            if file.clone.is_some_and(|tag| file.size > 0 && !self.holds(tag)) {
                file.size = 0;
                changed = true;
            }
        }
        if changed {
            node.top_files.sort_unstable_by(|a, b| b.size.cmp(&a.size));
        }
        left
    }

    /// Returns true if this file should be counted (false = already counted hardlink).
    fn first_sight(&self, identity: Identity, nlink: u32) -> bool {
        if nlink <= 1 {
            return true;
        }
        let shard = &self.seen_inodes[(identity.1 as usize) % INODE_SHARDS];
        shard.lock().unwrap().insert(identity)
    }

    fn offer_top(&self, name: &str, path: &str, size: u64, clone: Option<CloneTag>) {
        let mut top = self.top.lock().unwrap();
        top.offer(name, path, size, clone);
    }

    /// The largest files, less clone copies that turned out not to hold their group's bytes.
    pub fn into_top_files(self) -> Vec<FileEntry> {
        let files = self.top.lock().unwrap().take_sorted();
        files.into_iter().filter(|file| file.clone.is_none_or(|tag| self.holds(tag))).collect()
    }

    /// Unreadable folders, shallowest first, at most `UNREADABLE_LISTED`.
    pub fn unreadable_folders(&self) -> Vec<UnreadableFolder> {
        let mut folders = self.unreadable_folders.lock().unwrap().clone();
        folders.sort_by(|a, b| a.path.matches('/').count().cmp(&b.path.matches('/').count()).then_with(|| a.path.cmp(&b.path)));
        folders.truncate(UNREADABLE_LISTED);
        folders
    }

    /// The volumes mounted inside the scanned folder, in path order.
    pub fn volumes(&self) -> Vec<VolumeEntry> {
        let mut volumes = self.volumes.lock().unwrap().clone();
        volumes.sort_by(|a, b| a.path.cmp(&b.path));
        volumes
    }

    /// Walk the scanned folder `root`, returning its directory node. `name` is the node's display name.
    pub fn walk(&self, root: &Path, name: String) -> DirNode {
        self.walk_within(root, name, None)
    }

    /// Walks `root` as one folder of a larger map rooted at `within`, as when a folder is scanned again. A clone group
    /// whose first copy lies elsewhere on that map is counted there, so its copies here hold nothing, as in a scan of
    /// the whole map.
    pub fn walk_within(&self, root: &Path, name: String, within: Option<&Path>) -> DirNode {
        let context = self.context.get_or_init(|| Context::of(root));
        // The root is counted at its own path, so it's never a firmlinked copy.
        let mut tree = self
            .walk_dir(root, name, context)
            .unwrap_or_else(|| DirNode::new(String::new(), root.to_string_lossy().into_owned()));
        if let Some(within) = within {
            self.release_to_originals(root, within);
        }
        if self.any_released.load(Ordering::Relaxed) {
            self.settle(&mut tree);
        }
        tree
    }

    /// Gives up the groups whose original sits on the map outside `root`. A clone ID is the inode of the file the clones
    /// were made from, so fsgetpath(2) finds the original: 6.3 µs a lookup for 87,503 copies in a node_modules folder.
    fn release_to_originals(&self, root: &Path, within: &Path) {
        let Some(fsid) = volume_id(root) else { return };
        // fsgetpath(2) answers with real paths, such as /private/var for /var, so the two folders are resolved to match.
        let real = |path: &Path| std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        let (root, within) = (real(root), real(within));
        let (root, within) = (root.as_path(), within.as_path());
        let candidates: Vec<((u64, u64), Holder)> = self
            .holders
            .iter()
            .flat_map(|shard| {
                // A group whose original is here already holds at it.
                shard.lock().unwrap().iter().filter(|(key, holder)| holder.inode != key.1).map(|(key, holder)| (*key, *holder)).collect::<Vec<_>>()
            })
            .collect();
        let elsewhere: Vec<((u64, u64), Holder)> = candidates
            .into_par_iter()
            .filter(|(key, _)| path_of(fsid, key.1).is_some_and(|original| original.starts_with(within) && !original.starts_with(root)))
            .collect();
        for (key, holder) in elsewhere {
            // No copy here holds the group any more; its holder's bytes leave its folder in `settle`.
            if let Some(entry) = self.holders[(key.1 as usize) % INODE_SHARDS].lock().unwrap().get_mut(&key) {
                entry.inode = 0;
            }
            self.clones.files.fetch_add(1, Ordering::Relaxed);
            self.clones.bytes.fetch_add(holder.size, Ordering::Relaxed);
            let mut released = self.released[(holder.dir as usize) % INODE_SHARDS].lock().unwrap();
            let folder = released.entry(holder.dir).or_default();
            folder.bytes += holder.size;
            folder.kinds.0[holder.kind as usize] += holder.size;
            self.any_released.store(true, Ordering::Relaxed);
        }
    }

    /// One folder and everything below it, or nil for the startup disk's second path to a firmlinked folder.
    fn walk_dir(&self, path: &Path, name: String, cx: &Context) -> Option<DirNode> {
        let mut node = DirNode::new(name, path.to_string_lossy().into_owned());
        node.id = self.next_dir.fetch_add(1, Ordering::Relaxed);
        let folder = match open_dir(path, self.engine) {
            Ok(folder) => folder,
            Err(error) => {
                self.note_unreadable(&node, &error);
                node.status = DirStatus::Unreadable(error.raw_os_error().unwrap_or(0));
                return Some(node);
            }
        };
        if folder.identity.0 != cx.device {
            self.note_volume(path, &mut node, cx);
            return Some(node);
        }
        if cx.firmlinks.get(&folder.identity).is_some_and(|visible| visible != path) {
            return None;
        }
        let entries = match folder.entries(path) {
            Ok(entries) => entries,
            Err(error) => {
                self.note_unreadable(&node, &error);
                node.status = DirStatus::Unreadable(error.raw_os_error().unwrap_or(0));
                return Some(node);
            }
        };
        self.dirs.fetch_add(1, Ordering::Relaxed);

        let mut subdirs: Vec<(PathBuf, String)> = Vec::new();
        for e in entries {
            if e.error != 0 {
                // One entry macOS wouldn't describe; the rest of the folder still counts.
                self.entry_errors.fetch_add(1, Ordering::Relaxed);
                continue;
            }
            let dataless = e.flags & SF_DATALESS != 0;
            if e.is_dir {
                if dataless {
                    // Listing it would make macOS fetch its contents from the cloud.
                    self.cloud.folders.fetch_add(1, Ordering::Relaxed);
                } else {
                    subdirs.push((path.join(&e.name), e.name));
                }
            } else if e.is_file {
                if !self.first_sight((folder.identity.0, e.inode), e.nlink) {
                    continue;
                }
                if dataless {
                    self.cloud.files.fetch_add(1, Ordering::Relaxed);
                    self.cloud.bytes.fetch_add(e.length, Ordering::Relaxed);
                }
                let child = path.join(&e.name);
                let p = child.to_string_lossy();
                let tag = e.clone_group().map(|id| CloneTag { device: folder.identity.0, id, inode: e.inode });
                let holds = tag.is_none_or(|tag| self.hold_clone(tag, node.id, e.size, kind_of(&e.name)));
                if holds {
                    node.add_file(&e.name, &p, e.size, tag, 0);
                    self.offer_top(&e.name, &p, e.size, tag);
                    self.bytes.fetch_add(e.size, Ordering::Relaxed);
                } else {
                    // An earlier-made copy holds these bytes already.
                    node.add_file(&e.name, &p, 0, tag, e.size);
                    self.clones.files.fetch_add(1, Ordering::Relaxed);
                    self.clones.bytes.fetch_add(e.size, Ordering::Relaxed);
                }
                self.files.fetch_add(1, Ordering::Relaxed);
            }
            // symlinks / devices / fifos: ignored.
        }
        drop(folder);

        // Recurse into subdirectories in parallel.
        let children: Vec<DirNode> = subdirs
            .into_par_iter()
            .filter_map(|(p, n)| self.walk_dir(&p, n, cx))
            .collect();
        for c in children {
            node.add_child(c);
        }
        Some(node)
    }

    fn note_unreadable(&self, node: &DirNode, error: &std::io::Error) {
        self.errors.fetch_add(1, Ordering::Relaxed);
        let reason = UnreadableReason::of(error.raw_os_error().unwrap_or(0));
        let counter = match reason {
            UnreadableReason::Protected => &self.unreadable.protected,
            UnreadableReason::Denied => &self.unreadable.denied,
            UnreadableReason::Other => &self.unreadable.other,
        };
        counter.fetch_add(1, Ordering::Relaxed);
        self.unreadable_folders.lock().unwrap().push(UnreadableFolder { path: node.path.clone(), reason });
    }

    /// A folder with another file system mounted on it. A volume in the scanned disk's own APFS container, such
    /// as the startup disk's Preboot, takes its used space; anything else takes none, since its files live elsewhere.
    fn note_volume(&self, path: &Path, node: &mut DirNode, cx: &Context) {
        let from = volumes::mounted_from(path);
        let container = from.as_deref().and_then(volumes::container_of);
        let shares_disk = container.is_some() && container == cx.container.as_deref();
        let info = volumes::volume_info(path);
        let bytes = if shares_disk { info.used.unwrap_or(0) } else { 0 };
        node.status = DirStatus::Volume { shares_disk };
        node.size = bytes;
        let name = info.name.unwrap_or_else(|| node.name.clone());
        self.volumes.lock().unwrap().push(VolumeEntry { path: node.path.clone(), name, bytes, shares_disk });
    }
}

/// A directory entry with the attributes the scanner needs.
pub(crate) struct Entry {
    pub(crate) name: String,
    pub(crate) is_dir: bool,
    pub(crate) is_file: bool,
    pub(crate) inode: u64,
    pub(crate) nlink: u32,
    /// Allocated (on-disk) bytes.
    pub(crate) size: u64,
    /// Logical length in bytes, which a cloud-only file has though it takes no space.
    pub(crate) length: u64,
    pub(crate) flags: u32,
    /// Non-zero when macOS couldn't describe this entry.
    pub(crate) error: u32,
    /// The data stream's ID, which pure clones share; 0 when the volume doesn't say.
    pub(crate) clone_id: u64,
    /// How many files share all their blocks with this one, itself included.
    pub(crate) clone_refs: u32,
    /// `EF_*` flags: whether it shares some or all of its blocks with another file.
    pub(crate) ext_flags: u64,
    /// Bytes that deleting it would free now, read only when asked: it costs more than every other attribute together.
    pub(crate) private: Option<u64>,
}

impl Entry {
    /// The clone ID of a full clone, which shares every block with the other files that have the same ID: the walk
    /// counts each such group once.
    fn clone_group(&self) -> Option<u64> {
        (self.ext_flags & EF_SHARES_ALL_BLOCKS != 0 && self.clone_id != 0).then_some(self.clone_id)
    }
}

/// An open folder and its identity, which is the mounted volume's root at a mount point and the
/// data-volume folder at a firmlink.
pub(crate) struct OpenDir {
    pub(crate) fd: Option<OwnedFd>,
    pub(crate) identity: Identity,
    engine: Engine,
}

pub(crate) fn open_dir(path: &Path, engine: Engine) -> std::io::Result<OpenDir> {
    match engine {
        Engine::Std => {
            let meta = std::fs::symlink_metadata(path)?;
            Ok(OpenDir { fd: None, identity: (meta.dev(), meta.ino()), engine })
        }
        Engine::Bulk => {
            let cpath = CString::new(path.as_os_str().as_bytes())
                .map_err(|_| std::io::Error::from(std::io::ErrorKind::InvalidInput))?;
            let raw = unsafe { libc::open(cpath.as_ptr(), libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC) };
            if raw < 0 {
                return Err(std::io::Error::last_os_error());
            }
            let fd = unsafe { OwnedFd::from_raw_fd(raw) };
            let mut info: libc::stat = unsafe { std::mem::zeroed() };
            if unsafe { libc::fstat(fd.as_raw_fd(), &mut info) } != 0 {
                return Err(std::io::Error::last_os_error());
            }
            // Darwin's dev_t is signed; sign-extend it as std's `MetadataExt::dev` does.
            let device = i64::from(info.st_dev) as u64;
            Ok(OpenDir { fd: Some(fd), identity: (device, info.st_ino), engine })
        }
    }
}

impl OpenDir {
    fn entries(&self, path: &Path) -> std::io::Result<Vec<Entry>> {
        match (self.engine, &self.fd) {
            (Engine::Bulk, Some(fd)) => read_dir_bulk(fd.as_raw_fd(), false),
            _ => read_dir_std(path, false),
        }
    }
}

/// The file-system ID of the volume holding `path`, which fsgetpath(2) takes.
fn volume_id(path: &Path) -> Option<libc::fsid_t> {
    let cpath = CString::new(path.as_os_str().as_bytes()).ok()?;
    let mut info: libc::statfs = unsafe { std::mem::zeroed() };
    (unsafe { libc::statfs(cpath.as_ptr(), &mut info) } == 0).then_some(info.f_fsid)
}

/// The path of the file with inode `id` on the volume `fsid`, or nil when there's none.
fn path_of(mut fsid: libc::fsid_t, id: u64) -> Option<PathBuf> {
    let mut buffer = vec![0u8; libc::PATH_MAX as usize];
    let length = unsafe { fsgetpath(buffer.as_mut_ptr().cast(), buffer.len(), &mut fsid, id) };
    if length <= 0 {
        return None;
    }
    buffer.truncate(length as usize);
    if buffer.last() == Some(&0) {
        buffer.pop();
    }
    Some(PathBuf::from(std::ffi::OsString::from_vec(buffer)))
}

// ---- std::fs fallback path -------------------------------------------------

pub(crate) fn read_dir_std(path: &Path, private: bool) -> std::io::Result<Vec<Entry>> {
    let mut out = Vec::new();
    for entry in std::fs::read_dir(path)? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let meta = match entry.path().symlink_metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let ft = meta.file_type();
        // std::fs has no clone attributes, so the fallback asks for them file by file.
        let clone = if ft.is_file() { clone_attributes(&entry.path(), private) } else { CloneAttributes::default() };
        out.push(Entry {
            name: entry.file_name().to_string_lossy().into_owned(),
            is_dir: ft.is_dir(),
            is_file: ft.is_file(),
            inode: meta.ino(),
            nlink: meta.nlink() as u32,
            // blocks() is 512-byte units -> on-disk allocated size, matching `du`.
            size: meta.blocks() * 512,
            length: meta.len(),
            flags: meta.st_flags(),
            error: 0,
            clone_id: clone.id,
            clone_refs: clone.refs,
            ext_flags: clone.flags,
            private: clone.private,
        });
    }
    Ok(out)
}

#[derive(Default)]
pub(crate) struct CloneAttributes {
    pub(crate) id: u64,
    pub(crate) refs: u32,
    pub(crate) flags: u64,
    pub(crate) private: Option<u64>,
}

/// One file's clone ID, group size, sharing flags and (when asked) private size, from getattrlist(2). A volume that
/// doesn't keep them, or a file that vanished, reads as no clone.
pub(crate) fn clone_attributes(path: &Path, private: bool) -> CloneAttributes {
    let Ok(cpath) = CString::new(path.as_os_str().as_bytes()) else { return CloneAttributes::default() };
    let mut attrlist = Attrlist {
        bitmapcount: ATTR_BIT_MAP_COUNT,
        reserved: 0,
        commonattr: ATTR_CMN_RETURNED_ATTRS,
        volattr: 0,
        dirattr: 0,
        fileattr: 0,
        forkattr: clone_attrs(private),
    };
    let mut words = [0u64; 8];
    let status = unsafe {
        getattrlist(
            cpath.as_ptr(),
            &mut attrlist as *mut Attrlist as *mut libc::c_void,
            words.as_mut_ptr().cast(),
            std::mem::size_of_val(&words),
            (FSOPT_NOFOLLOW | FSOPT_ATTR_CMN_EXTENDED | FSOPT_PACK_INVAL_ATTRS) as u32,
        )
    };
    if status != 0 {
        return CloneAttributes::default();
    }
    let bytes: &[u8] = unsafe { std::slice::from_raw_parts(words.as_ptr().cast(), std::mem::size_of_val(&words)) };
    let mut cursor = Cursor { record: bytes, at: 4 };
    let (Some(_), Some(_), Some(_), Some(_), Some(returned)) = (cursor.u32(), cursor.u32(), cursor.u32(), cursor.u32(), cursor.u32()) else {
        return CloneAttributes::default();
    };
    read_clone_attributes(&mut cursor, attrlist.forkattr, returned)
}

/// The extended attributes a listing asks for. A scan needs only the clone ID and the sharing flags; the frees
/// command also reads each file's group size and private size. In parallel the flags and the group size each cost
/// about 40% more kernel time on a folder of clones, so a scan leaves the group size out.
fn clone_attrs(private: bool) -> u32 {
    let scan = ATTR_CMNEXT_CLONEID | ATTR_CMNEXT_EXT_FLAGS;
    if private { scan | ATTR_CMNEXT_PRIVATESIZE | ATTR_CMNEXT_CLONE_REFCNT } else { scan }
}

/// Reads the extended attributes in `requested`, which follow every other attribute in their bit order: the private
/// size, the clone ID, the flags, then the group size. `returned` says which ones the volume filled in.
fn read_clone_attributes(cursor: &mut Cursor<'_>, requested: u32, returned: u32) -> CloneAttributes {
    let asked = |attr: u32| requested & attr != 0;
    let filled = |attr: u32| requested & returned & attr != 0;
    let private = if asked(ATTR_CMNEXT_PRIVATESIZE) { cursor.i64().map(|bytes| bytes.max(0) as u64) } else { None };
    let id = if asked(ATTR_CMNEXT_CLONEID) { cursor.u64().unwrap_or(0) } else { 0 };
    let flags = if asked(ATTR_CMNEXT_EXT_FLAGS) { cursor.u64().unwrap_or(0) } else { 0 };
    let refs = if asked(ATTR_CMNEXT_CLONE_REFCNT) { cursor.u32().unwrap_or(0) } else { 0 };
    CloneAttributes {
        id: if filled(ATTR_CMNEXT_CLONEID) { id } else { 0 },
        refs: if filled(ATTR_CMNEXT_CLONE_REFCNT) { refs } else { 0 },
        flags: if filled(ATTR_CMNEXT_EXT_FLAGS) { flags } else { 0 },
        private: private.filter(|_| filled(ATTR_CMNEXT_PRIVATESIZE)),
    }
}

// ---- getattrlistbulk fast path --------------------------------------------

const ATTR_BIT_MAP_COUNT: u16 = 5;
const ATTR_CMN_RETURNED_ATTRS: u32 = 0x8000_0000;
const ATTR_CMN_NAME: u32 = 0x0000_0001;
const ATTR_CMN_OBJTYPE: u32 = 0x0000_0008;
const ATTR_CMN_FLAGS: u32 = 0x0004_0000;
const ATTR_CMN_FILEID: u32 = 0x0200_0000;
const ATTR_CMN_ERROR: u32 = 0x2000_0000;
const ATTR_FILE_LINKCOUNT: u32 = 0x0000_0001;
const ATTR_FILE_ALLOCSIZE: u32 = 0x0000_0004;
const ATTR_FILE_DATALENGTH: u32 = 0x0000_0200;
// Extended common attributes, asked for in the fork field with FSOPT_ATTR_CMN_EXTENDED (`<sys/attr.h>`).
const ATTR_CMNEXT_PRIVATESIZE: u32 = 0x0000_0008;
const ATTR_CMNEXT_CLONEID: u32 = 0x0000_0100;
const ATTR_CMNEXT_EXT_FLAGS: u32 = 0x0000_0200;
const ATTR_CMNEXT_CLONE_REFCNT: u32 = 0x0000_1000;
const FSOPT_NOFOLLOW: u64 = 0x0000_0001;
const FSOPT_PACK_INVAL_ATTRS: u64 = 0x0000_0008;
const FSOPT_ATTR_CMN_EXTENDED: u64 = 0x0000_0020;
/// `EF_*` in `<sys/stat.h>`: the file may share blocks with another (a clone), or shares all of them.
pub(crate) const EF_MAY_SHARE_BLOCKS: u64 = 0x0000_0001;
pub(crate) const EF_SHARES_ALL_BLOCKS: u64 = 0x0000_0040;

// fsobj_type_t values
const VREG: u32 = 1;
const VDIR: u32 = 2;

#[repr(C)]
struct Attrlist {
    bitmapcount: u16,
    reserved: u16,
    commonattr: u32,
    volattr: u32,
    dirattr: u32,
    fileattr: u32,
    forkattr: u32,
}

extern "C" {
    fn getattrlistbulk(
        dirfd: libc::c_int,
        attrlist: *mut libc::c_void,
        attrbuf: *mut libc::c_void,
        attrbufsize: libc::size_t,
        options: u64,
    ) -> libc::c_int;
    fn fsgetpath(buf: *mut libc::c_char, bufsize: libc::size_t, fsid: *mut libc::fsid_t, obj_id: u64) -> libc::ssize_t;
    fn getattrlist(
        path: *const libc::c_char,
        attrlist: *mut libc::c_void,
        attrbuf: *mut libc::c_void,
        attrbufsize: libc::size_t,
        options: libc::c_uint,
    ) -> libc::c_int;
}

/// Bytes per `getattrlistbulk` call: many entries per kernel call.
const BULK_BUFFER: usize = 128 * 1024;

/// Reads one record's attributes in the order the kernel packs them.
struct Cursor<'a> {
    record: &'a [u8],
    at: usize,
}

impl<'a> Cursor<'a> {
    fn take<const N: usize>(&mut self) -> Option<[u8; N]> {
        let bytes = self.record.get(self.at..self.at + N)?.try_into().ok()?;
        self.at += N;
        Some(bytes)
    }
    fn u32(&mut self) -> Option<u32> {
        self.take().map(u32::from_ne_bytes)
    }
    fn i32(&mut self) -> Option<i32> {
        self.take().map(i32::from_ne_bytes)
    }
    fn u64(&mut self) -> Option<u64> {
        self.take().map(u64::from_ne_bytes)
    }
    fn i64(&mut self) -> Option<i64> {
        self.take().map(i64::from_ne_bytes)
    }
}

/// One packed record, laid out as getattrlist(2) describes: its length, the returned-attribute set, the error
/// (only when returned), then the common attributes, then file attributes, which directories don't carry, then the
/// extended common attributes when `extended` asked for them.
fn parse_record(record: &[u8], extended: Option<u32>) -> Option<Entry> {
    let mut cursor = Cursor { record, at: 4 };
    let returned_common = cursor.u32()?;
    let _volume = cursor.u32()?;
    let _dir = cursor.u32()?;
    let _file = cursor.u32()?;
    let returned_extended = cursor.u32()?;
    let error = if returned_common & ATTR_CMN_ERROR != 0 { cursor.u32()? } else { 0 };
    let name_at = cursor.at;
    let name_offset = cursor.i32()?;
    let name_length = cursor.u32()? as usize;
    let start = usize::try_from(name_at as i64 + i64::from(name_offset)).ok()?;
    // The length includes the trailing NUL.
    let name = record.get(start..start + name_length.saturating_sub(1))?;
    let name = String::from_utf8_lossy(name).into_owned();
    let objtype = cursor.u32()?;
    let flags = cursor.u32()?;
    let inode = cursor.u64()?;
    let (nlink, size, length) = if objtype == VDIR {
        (1, 0, 0)
    } else {
        (cursor.u32()?, cursor.i64()?.max(0) as u64, cursor.i64()?.max(0) as u64)
    };
    let clone = match extended {
        Some(requested) => read_clone_attributes(&mut cursor, requested, returned_extended),
        None => CloneAttributes::default(),
    };
    Some(Entry {
        name,
        is_dir: objtype == VDIR,
        is_file: objtype == VREG,
        inode,
        nlink,
        size,
        length,
        flags,
        error,
        clone_id: clone.id,
        clone_refs: clone.refs,
        ext_flags: clone.flags,
        private: clone.private,
    })
}

/// A folder's entries with their sizes and clone attributes; with `private`, also what deleting each would free.
pub(crate) fn read_dir_bulk(fd: libc::c_int, private: bool) -> std::io::Result<Vec<Entry>> {
    let mut extended = Some(clone_attrs(private));
    let mut attrlist = Attrlist {
        bitmapcount: ATTR_BIT_MAP_COUNT,
        reserved: 0,
        commonattr: ATTR_CMN_RETURNED_ATTRS | ATTR_CMN_NAME | ATTR_CMN_OBJTYPE | ATTR_CMN_FLAGS | ATTR_CMN_FILEID | ATTR_CMN_ERROR,
        volattr: 0,
        dirattr: 0,
        fileattr: ATTR_FILE_LINKCOUNT | ATTR_FILE_ALLOCSIZE | ATTR_FILE_DATALENGTH,
        forkattr: clone_attrs(private),
    };

    // getattrlistbulk(2) starts every record on an eight-byte boundary, so the buffer is u64s.
    let mut words = vec![0u64; BULK_BUFFER / 8];
    let buf: &mut [u8] = unsafe { std::slice::from_raw_parts_mut(words.as_mut_ptr().cast::<u8>(), BULK_BUFFER) };
    let mut out = Vec::new();

    loop {
        let options = FSOPT_PACK_INVAL_ATTRS | if extended.is_some() { FSOPT_ATTR_CMN_EXTENDED } else { 0 };
        let n = unsafe {
            getattrlistbulk(
                fd,
                &mut attrlist as *mut Attrlist as *mut libc::c_void,
                buf.as_mut_ptr() as *mut libc::c_void,
                buf.len(),
                options,
            )
        };
        if n < 0 {
            let error = std::io::Error::last_os_error();
            // A file system that refuses the extended attributes still lists its folders without them.
            if extended.is_some() && out.is_empty() && error.raw_os_error() == Some(libc::EINVAL) {
                extended = None;
                attrlist.forkattr = 0;
                continue;
            }
            // A folder that failed partway still has the entries read so far.
            if out.is_empty() {
                return Err(error);
            }
            break;
        }
        if n == 0 {
            break; // no more entries
        }

        let mut cursor = 0usize;
        for _ in 0..n {
            let Some(length) = buf.get(cursor..cursor + 4).map(|b| u32::from_ne_bytes(b.try_into().unwrap()) as usize) else { break };
            let Some(record) = buf.get(cursor..cursor + length) else { break };
            if let Some(entry) = parse_record(record, extended) {
                if entry.name != "." && entry.name != ".." {
                    out.push(entry);
                }
            }
            cursor += length;
        }
    }
    Ok(out)
}

// ---- global largest-files heap --------------------------------------------

struct TopItem {
    size: u64,
    name: String,
    path: String,
    clone: Option<CloneTag>,
}

struct TopFiles {
    cap: usize,
    // Min-heap on size so the smallest is cheap to evict.
    heap: BinaryHeap<std::cmp::Reverse<OrdItem>>,
}

struct OrdItem(TopItem);
impl PartialEq for OrdItem {
    fn eq(&self, other: &Self) -> bool {
        self.0.size == other.0.size
    }
}
impl Eq for OrdItem {}
impl PartialOrd for OrdItem {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}
impl Ord for OrdItem {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.0.size.cmp(&other.0.size)
    }
}

impl TopFiles {
    fn new(cap: usize) -> Self {
        TopFiles {
            cap,
            heap: BinaryHeap::new(),
        }
    }
    fn offer(&mut self, name: &str, path: &str, size: u64, clone: Option<CloneTag>) {
        let item = || std::cmp::Reverse(OrdItem(TopItem { size, name: name.to_string(), path: path.to_string(), clone }));
        if self.heap.len() < self.cap {
            self.heap.push(item());
        } else if let Some(std::cmp::Reverse(min)) = self.heap.peek() {
            if size > min.0.size {
                self.heap.pop();
                self.heap.push(item());
            }
        }
    }
    fn take_sorted(&mut self) -> Vec<FileEntry> {
        let mut v: Vec<FileEntry> = std::mem::take(&mut self.heap)
            .into_iter()
            .map(|std::cmp::Reverse(it)| FileEntry { name: it.0.name, path: it.0.path, size: it.0.size, clone: it.0.clone })
            .collect();
        v.sort_unstable_by(|a, b| b.size.cmp(&a.size));
        v
    }
}

/// Spawn a background thread that prints periodic progress NDJSON until `done` flips.
/// Returns its handle so the caller can join it before reclaiming the `Scanner`.
pub fn spawn_progress(
    scanner: std::sync::Arc<Scanner>,
    done: std::sync::Arc<AtomicBool>,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        use std::io::Write;
        while !done.load(Ordering::Relaxed) {
            let line = format!(
                "{{\"type\":\"progress\",\"dirs\":{},\"files\":{},\"bytes\":{},\"errors\":{}}}\n",
                scanner.dirs.load(Ordering::Relaxed),
                scanner.files.load(Ordering::Relaxed),
                scanner.bytes.load(Ordering::Relaxed),
                scanner.errors.load(Ordering::Relaxed),
            );
            let stdout = std::io::stdout();
            let mut h = stdout.lock();
            let _ = h.write_all(line.as_bytes());
            let _ = h.flush();
            std::thread::sleep(std::time::Duration::from_millis(120));
        }
    })
}
