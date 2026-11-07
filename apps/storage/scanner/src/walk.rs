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

use std::collections::{BinaryHeap, HashMap, HashSet};
use std::ffi::CString;
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
use std::os::unix::ffi::OsStrExt;
use std::os::macos::fs::MetadataExt as _;
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

use rayon::prelude::*;

use crate::model::{DirNode, DirStatus, FileEntry, UnreadableReason};
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
    seen_inodes: Vec<Mutex<HashSet<Identity>>>,
    top: Mutex<TopFiles>,
    volumes: Mutex<Vec<VolumeEntry>>,
    unreadable_folders: Mutex<Vec<UnreadableFolder>>,
    context: OnceLock<Context>,
}

impl Scanner {
    pub fn new(engine: Engine) -> Self {
        let mut shards = Vec::with_capacity(INODE_SHARDS);
        for _ in 0..INODE_SHARDS {
            shards.push(Mutex::new(HashSet::new()));
        }
        Scanner {
            engine,
            dirs: AtomicU64::new(0),
            files: AtomicU64::new(0),
            bytes: AtomicU64::new(0),
            errors: AtomicU64::new(0),
            entry_errors: AtomicU64::new(0),
            unreadable: UnreadableCounts::default(),
            cloud: CloudCounts::default(),
            seen_inodes: shards,
            top: Mutex::new(TopFiles::new(TOP_FILES_GLOBAL)),
            volumes: Mutex::new(Vec::new()),
            unreadable_folders: Mutex::new(Vec::new()),
            context: OnceLock::new(),
        }
    }

    /// Returns true if this file should be counted (false = already counted hardlink).
    fn first_sight(&self, identity: Identity, nlink: u32) -> bool {
        if nlink <= 1 {
            return true;
        }
        let shard = &self.seen_inodes[(identity.1 as usize) % INODE_SHARDS];
        shard.lock().unwrap().insert(identity)
    }

    fn offer_top(&self, name: &str, path: &str, size: u64) {
        let mut top = self.top.lock().unwrap();
        top.offer(name, path, size);
    }

    pub fn into_top_files(self) -> Vec<FileEntry> {
        self.top.into_inner().unwrap().into_sorted()
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
        let context = self.context.get_or_init(|| Context::of(root));
        // The root is counted at its own path, so it's never a firmlinked copy.
        self.walk_dir(root, name, context).unwrap_or_else(|| DirNode::new(String::new(), root.to_string_lossy().into_owned()))
    }

    /// One folder and everything below it, or nil for the startup disk's second path to a firmlinked folder.
    fn walk_dir(&self, path: &Path, name: String, cx: &Context) -> Option<DirNode> {
        let mut node = DirNode::new(name, path.to_string_lossy().into_owned());
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
                node.add_file(&e.name, &p, e.size);
                self.offer_top(&e.name, &p, e.size);
                self.files.fetch_add(1, Ordering::Relaxed);
                self.bytes.fetch_add(e.size, Ordering::Relaxed);
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
struct Entry {
    name: String,
    is_dir: bool,
    is_file: bool,
    inode: u64,
    nlink: u32,
    /// Allocated (on-disk) bytes.
    size: u64,
    /// Logical length in bytes, which a cloud-only file has though it takes no space.
    length: u64,
    flags: u32,
    /// Non-zero when macOS couldn't describe this entry.
    error: u32,
}

/// An open folder and its identity, which is the mounted volume's root at a mount point and the
/// data-volume folder at a firmlink.
struct OpenDir {
    fd: Option<OwnedFd>,
    identity: Identity,
    engine: Engine,
}

fn open_dir(path: &Path, engine: Engine) -> std::io::Result<OpenDir> {
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
            (Engine::Bulk, Some(fd)) => read_dir_bulk(fd.as_raw_fd()),
            _ => read_dir_std(path),
        }
    }
}

// ---- std::fs fallback path -------------------------------------------------

fn read_dir_std(path: &Path) -> std::io::Result<Vec<Entry>> {
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
        });
    }
    Ok(out)
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
const FSOPT_PACK_INVAL_ATTRS: u64 = 0x0000_0008;

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
/// (only when returned), then the common attributes, then file attributes, which directories don't carry.
fn parse_record(record: &[u8]) -> Option<Entry> {
    let mut cursor = Cursor { record, at: 4 };
    let returned_common = cursor.u32()?;
    let _volume = cursor.u32()?;
    let _dir = cursor.u32()?;
    let _file = cursor.u32()?;
    let _fork = cursor.u32()?;
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
    Some(Entry { name, is_dir: objtype == VDIR, is_file: objtype == VREG, inode, nlink, size, length, flags, error })
}

fn read_dir_bulk(fd: libc::c_int) -> std::io::Result<Vec<Entry>> {
    let mut attrlist = Attrlist {
        bitmapcount: ATTR_BIT_MAP_COUNT,
        reserved: 0,
        commonattr: ATTR_CMN_RETURNED_ATTRS | ATTR_CMN_NAME | ATTR_CMN_OBJTYPE | ATTR_CMN_FLAGS | ATTR_CMN_FILEID | ATTR_CMN_ERROR,
        volattr: 0,
        dirattr: 0,
        fileattr: ATTR_FILE_LINKCOUNT | ATTR_FILE_ALLOCSIZE | ATTR_FILE_DATALENGTH,
        forkattr: 0,
    };

    // getattrlistbulk(2) starts every record on an eight-byte boundary, so the buffer is u64s.
    let mut words = vec![0u64; BULK_BUFFER / 8];
    let buf: &mut [u8] = unsafe { std::slice::from_raw_parts_mut(words.as_mut_ptr().cast::<u8>(), BULK_BUFFER) };
    let mut out = Vec::new();

    loop {
        let n = unsafe {
            getattrlistbulk(
                fd,
                &mut attrlist as *mut Attrlist as *mut libc::c_void,
                buf.as_mut_ptr() as *mut libc::c_void,
                buf.len(),
                FSOPT_PACK_INVAL_ATTRS,
            )
        };
        if n < 0 {
            let error = std::io::Error::last_os_error();
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
            if let Some(entry) = parse_record(record) {
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
    fn offer(&mut self, name: &str, path: &str, size: u64) {
        if self.heap.len() < self.cap {
            self.heap.push(std::cmp::Reverse(OrdItem(TopItem {
                size,
                name: name.to_string(),
                path: path.to_string(),
            })));
        } else if let Some(std::cmp::Reverse(min)) = self.heap.peek() {
            if size > min.0.size {
                self.heap.pop();
                self.heap.push(std::cmp::Reverse(OrdItem(TopItem {
                    size,
                    name: name.to_string(),
                    path: path.to_string(),
                })));
            }
        }
    }
    fn into_sorted(self) -> Vec<FileEntry> {
        let mut v: Vec<FileEntry> = self
            .heap
            .into_iter()
            .map(|std::cmp::Reverse(it)| FileEntry {
                name: it.0.name,
                path: it.0.path,
                size: it.0.size,
            })
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
