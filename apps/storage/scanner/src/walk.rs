//! Directory traversal. Fast path uses the macOS `getattrlistbulk(2)` syscall to batch
//! "readdir + stat" into one kernel call (128 KB buffer -> many entries per call); a
//! portable `std::fs` path is the fallback. Both parallelize across cores with rayon,
//! dedup hardlinks by inode, and never follow symlinks.

use std::collections::{BinaryHeap, HashSet};
use std::ffi::CString;
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::MetadataExt;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;

use rayon::prelude::*;

use crate::model::{DirNode, FileEntry};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Engine {
    Bulk,
    Std,
}

const INODE_SHARDS: usize = 128;
const TOP_FILES_GLOBAL: usize = 200;

/// Shared scan state. Counters drive the live progress feed; the sharded inode sets
/// dedup hardlinks with low lock contention; `top` keeps the globally largest files.
pub struct Scanner {
    pub engine: Engine,
    pub dirs: AtomicU64,
    pub files: AtomicU64,
    pub bytes: AtomicU64,
    pub errors: AtomicU64,
    seen_inodes: Vec<Mutex<HashSet<u64>>>,
    top: Mutex<TopFiles>,
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
            seen_inodes: shards,
            top: Mutex::new(TopFiles::new(TOP_FILES_GLOBAL)),
        }
    }

    /// Returns true if this inode should be counted (false = already counted hardlink).
    fn first_sight(&self, inode: u64, nlink: u32) -> bool {
        if nlink <= 1 {
            return true;
        }
        let shard = &self.seen_inodes[(inode as usize) % INODE_SHARDS];
        shard.lock().unwrap().insert(inode)
    }

    fn offer_top(&self, name: &str, path: &str, size: u64) {
        let mut top = self.top.lock().unwrap();
        top.offer(name, path, size);
    }

    pub fn into_top_files(self) -> Vec<FileEntry> {
        self.top.into_inner().unwrap().into_sorted()
    }

    /// Walk `path`, returning its directory node. `name` is the node's display name.
    pub fn walk(&self, path: &Path, name: String) -> DirNode {
        self.dirs.fetch_add(1, Ordering::Relaxed);
        let mut node = DirNode::new(name, path.to_string_lossy().into_owned());

        let entries = match self.engine {
            Engine::Bulk => read_dir_bulk(path),
            Engine::Std => read_dir_std(path),
        };
        let entries = match entries {
            Ok(e) => e,
            Err(_) => {
                self.errors.fetch_add(1, Ordering::Relaxed);
                return node;
            }
        };

        let mut subdirs: Vec<(std::path::PathBuf, String)> = Vec::new();
        for e in entries {
            let child_path = path.join(&e.name);
            if e.is_dir {
                subdirs.push((child_path, e.name));
            } else if e.is_file {
                if !self.first_sight(e.inode, e.nlink) {
                    continue;
                }
                let p = child_path.to_string_lossy();
                node.add_file(&e.name, &p, e.size);
                self.offer_top(&e.name, &p, e.size);
                self.files.fetch_add(1, Ordering::Relaxed);
                self.bytes.fetch_add(e.size, Ordering::Relaxed);
            }
            // symlinks / devices / fifos: ignored.
        }

        // Recurse into subdirectories in parallel.
        let children: Vec<DirNode> = subdirs
            .into_par_iter()
            .map(|(p, n)| self.walk(&p, n))
            .collect();
        for c in children {
            node.add_child(c);
        }
        node
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
        });
    }
    Ok(out)
}

// ---- getattrlistbulk fast path --------------------------------------------

const ATTR_BIT_MAP_COUNT: u16 = 5;
const ATTR_CMN_RETURNED_ATTRS: u32 = 0x8000_0000;
const ATTR_CMN_NAME: u32 = 0x0000_0001;
const ATTR_CMN_OBJTYPE: u32 = 0x0000_0008;
const ATTR_CMN_FILEID: u32 = 0x0200_0000;
const ATTR_FILE_LINKCOUNT: u32 = 0x0000_0001;
const ATTR_FILE_ALLOCSIZE: u32 = 0x0000_0004;
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

#[inline]
fn rd_u32(buf: &[u8], off: usize) -> u32 {
    u32::from_ne_bytes(buf[off..off + 4].try_into().unwrap())
}
#[inline]
fn rd_i32(buf: &[u8], off: usize) -> i32 {
    i32::from_ne_bytes(buf[off..off + 4].try_into().unwrap())
}
#[inline]
fn rd_u64(buf: &[u8], off: usize) -> u64 {
    u64::from_ne_bytes(buf[off..off + 8].try_into().unwrap())
}
#[inline]
fn rd_i64(buf: &[u8], off: usize) -> i64 {
    i64::from_ne_bytes(buf[off..off + 8].try_into().unwrap())
}

// Fixed field offsets within each packed entry (FSOPT_PACK_INVAL_ATTRS gives a uniform
// layout for every entry regardless of which attributes actually apply):
//   0  : u32  entry length
//   4  : attribute_set_t returned (5 x u32 = 20 bytes)
//   24 : ATTR_CMN_NAME    attrreference_t { i32 dataoffset; u32 length }  (8 bytes)
//   32 : ATTR_CMN_OBJTYPE u32
//   36 : ATTR_CMN_FILEID  u64
//   44 : ATTR_FILE_LINKCOUNT u32
//   48 : ATTR_FILE_ALLOCSIZE i64
const OFF_NAME_REF: usize = 24;
const OFF_OBJTYPE: usize = 32;
const OFF_FILEID: usize = 36;
const OFF_LINKCOUNT: usize = 44;
const OFF_ALLOCSIZE: usize = 48;

fn read_dir_bulk(path: &Path) -> std::io::Result<Vec<Entry>> {
    let cpath = CString::new(path.as_os_str().as_bytes())
        .map_err(|_| std::io::Error::from(std::io::ErrorKind::InvalidInput))?;
    let fd = unsafe { libc::open(cpath.as_ptr(), libc::O_RDONLY | libc::O_DIRECTORY) };
    if fd < 0 {
        return Err(std::io::Error::last_os_error());
    }

    let mut attrlist = Attrlist {
        bitmapcount: ATTR_BIT_MAP_COUNT,
        reserved: 0,
        commonattr: ATTR_CMN_RETURNED_ATTRS | ATTR_CMN_NAME | ATTR_CMN_OBJTYPE | ATTR_CMN_FILEID,
        volattr: 0,
        dirattr: 0,
        fileattr: ATTR_FILE_LINKCOUNT | ATTR_FILE_ALLOCSIZE,
        forkattr: 0,
    };

    let mut buf = vec![0u8; 128 * 1024];
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
            unsafe { libc::close(fd) };
            return Err(std::io::Error::last_os_error());
        }
        if n == 0 {
            break; // no more entries
        }

        let mut cursor = 0usize;
        for _ in 0..n {
            let entry = &buf[cursor..];
            let len = rd_u32(entry, 0) as usize;

            let name_data_off = rd_i32(entry, OFF_NAME_REF) as usize;
            let name_len = rd_u32(entry, OFF_NAME_REF + 4) as usize;
            let name_start = OFF_NAME_REF + name_data_off;
            // name_len includes the trailing NUL.
            let name_end = name_start + name_len.saturating_sub(1);
            let name = String::from_utf8_lossy(&entry[name_start..name_end]).into_owned();

            let objtype = rd_u32(entry, OFF_OBJTYPE);
            let inode = rd_u64(entry, OFF_FILEID);
            let nlink = rd_u32(entry, OFF_LINKCOUNT);
            let alloc = rd_i64(entry, OFF_ALLOCSIZE).max(0) as u64;

            if name != "." && name != ".." {
                out.push(Entry {
                    name,
                    is_dir: objtype == VDIR,
                    is_file: objtype == VREG,
                    inode,
                    nlink,
                    size: alloc,
                });
            }

            cursor += len;
        }
    }

    unsafe { libc::close(fd) };
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
