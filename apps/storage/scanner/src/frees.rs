//! What deleting some items would free right away. macOS reports each file's private size: the bytes no clone or
//! snapshot shares, which deleting that file alone frees (getattrlist(2), `ATTR_CMNEXT_PRIVATESIZE`). A group of
//! full clones whose every copy is among the items goes with them too, and so does a hard-linked file whose every
//! link is; anything else outside the items keeps its bytes. Reading private sizes cost 55% more than the rest of a
//! listing on pnpm's store, so this runs only for what the user selects, never as part of a scan.

use std::collections::HashMap;
use std::ffi::CString;
use std::os::fd::AsRawFd;
use std::os::unix::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use rayon::prelude::*;
use serde::Serialize;

use crate::walk::{clone_attributes, open_dir, read_dir_bulk, read_dir_std, Engine, EF_MAY_SHARE_BLOCKS, EF_SHARES_ALL_BLOCKS};

/// `st_flags` bit for an iCloud or File Provider item whose contents aren't on this Mac (`<sys/stat.h>`).
const SF_DATALESS: u32 = 0x4000_0000;

/// What deleting the items frees now, and why the rest of their size stays.
#[derive(Serialize, Debug, PartialEq, Eq)]
pub struct Frees {
    #[serde(rename = "type")]
    pub kind: &'static str,
    /// Bytes deleting them frees at once, which emptying the Trash does for items moved there.
    pub bytes: u64,
    /// Bytes that stay because clones or hard links outside the items share them.
    pub shared: u64,
    /// Bytes that stay until the local snapshots holding them are gone.
    pub snapshots: u64,
    pub files: u64,
    /// Folders it couldn't read, whose contents it couldn't count.
    pub unreadable: u64,
    #[serde(rename = "elapsedMs")]
    pub elapsed_ms: u128,
}

/// How a file shares its blocks, from its clone ID, `EF_*` flags and clone count.
#[derive(Clone, Copy)]
enum Sharing {
    None,
    /// Some blocks: a clone that changed after it was made.
    Partly,
    /// Every block, with the other files of the group `id` (`copies` of them, itself included).
    Group { id: u64, copies: u32 },
}

impl Sharing {
    fn of(id: u64, copies: u32, flags: u64) -> Self {
        if flags & EF_SHARES_ALL_BLOCKS != 0 && id != 0 && copies >= 2 {
            Sharing::Group { id, copies }
        } else if flags & (EF_MAY_SHARE_BLOCKS | EF_SHARES_ALL_BLOCKS) != 0 {
            Sharing::Partly
        } else {
            Sharing::None
        }
    }
}

/// A clone group or hard-linked file seen among the items, until the walk knows whether every copy is there.
#[derive(Default)]
struct Copies {
    seen: u32,
    /// How many copies exist on the volume: the clone group's size, or the file's link count.
    total: u32,
    /// One copy's allocated size: the blocks the copies share.
    size: u64,
    /// One copy's private size.
    private: u64,
    /// The copies' sizes added up, as each looks among the items.
    apparent: u64,
}

#[derive(Default)]
struct Tally {
    bytes: AtomicU64,
    shared: AtomicU64,
    snapshots: AtomicU64,
    files: AtomicU64,
    unreadable: AtomicU64,
    clones: Mutex<HashMap<(u64, u64), Copies>>,
    links: Mutex<HashMap<(u64, u64), Copies>>,
}

impl Tally {
    fn note(&self, map: &Mutex<HashMap<(u64, u64), Copies>>, key: (u64, u64), total: u32, size: u64, private: u64) {
        let mut copies = map.lock().unwrap();
        let entry = copies.entry(key).or_default();
        entry.seen += 1;
        entry.total = total;
        entry.size = size;
        entry.private = private;
        entry.apparent += size;
    }

    fn file(&self, device: u64, inode: u64, nlink: u32, size: u64, private: Option<u64>, sharing: Sharing) {
        self.files.fetch_add(1, Ordering::Relaxed);
        // A volume without private sizes (not APFS) has no clones or snapshots, so a file frees what it takes.
        let private = private.unwrap_or(size).min(size);
        if nlink > 1 {
            self.note(&self.links, (device, inode), nlink, size, private);
            return;
        }
        match sharing {
            Sharing::Group { id, copies } => self.note(&self.clones, (device, id), copies, size, private),
            Sharing::Partly => {
                // A clone that has since changed still shares its other blocks, which stay.
                self.bytes.fetch_add(private, Ordering::Relaxed);
                self.shared.fetch_add(size - private, Ordering::Relaxed);
            }
            Sharing::None => {
                // Nothing shares its blocks, so what it doesn't free sits in a local snapshot.
                self.bytes.fetch_add(private, Ordering::Relaxed);
                self.snapshots.fetch_add(size - private, Ordering::Relaxed);
            }
        }
    }

    /// Settles the groups and links: those with every copy among the items free their shared blocks once.
    fn finish(self, elapsed_ms: u128) -> Frees {
        let mut bytes = self.bytes.into_inner();
        let mut shared = self.shared.into_inner();
        let mut snapshots = self.snapshots.into_inner();
        for copies in self.clones.into_inner().unwrap().into_values() {
            if copies.seen >= copies.total {
                bytes += copies.size;
            } else {
                // Each copy here frees only blocks it no longer shares; the rest stays with the copies elsewhere.
                bytes += copies.private * u64::from(copies.seen);
                shared += copies.apparent.saturating_sub(copies.private * u64::from(copies.seen));
            }
        }
        for links in self.links.into_inner().unwrap().into_values() {
            // A file goes when its last link does, so one with a link elsewhere frees nothing.
            if links.seen >= links.total {
                bytes += links.private;
                snapshots += links.size - links.private;
            } else {
                shared += links.size;
            }
        }
        Frees {
            kind: "frees",
            bytes,
            shared,
            snapshots,
            files: self.files.into_inner(),
            unreadable: self.unreadable.into_inner(),
            elapsed_ms,
        }
    }
}

/// Measures what deleting `paths` frees: each a file or a folder, walked without crossing into other volumes.
pub fn measure(paths: &[PathBuf]) -> Frees {
    let start = std::time::Instant::now();
    let tally = Tally::default();
    paths.par_iter().for_each(|path| measure_item(&tally, path));
    tally.finish(start.elapsed().as_millis())
}

fn measure_item(tally: &Tally, path: &Path) {
    use std::os::unix::fs::MetadataExt;
    let Ok(meta) = std::fs::symlink_metadata(path) else {
        tally.unreadable.fetch_add(1, Ordering::Relaxed);
        return;
    };
    if meta.is_dir() {
        walk(tally, path, meta.dev());
    } else if meta.is_file() {
        let attrs = clone_attributes(path, true);
        let sharing = Sharing::of(attrs.id, attrs.refs, attrs.flags);
        tally.file(meta.dev(), meta.ino(), meta.nlink() as u32, meta.blocks() * 512, attrs.private, sharing);
    }
}

fn walk(tally: &Tally, path: &Path, device: u64) {
    let Ok(folder) = open_dir(path, Engine::Bulk) else {
        tally.unreadable.fetch_add(1, Ordering::Relaxed);
        return;
    };
    // Another volume mounted inside: deleting the folder can't free its space.
    if folder.identity.0 != device {
        return;
    }
    let entries = match folder.fd.as_ref().map(|fd| read_dir_bulk(fd.as_raw_fd(), true)) {
        Some(Ok(entries)) => entries,
        _ => match read_dir_std(path, true) {
            Ok(entries) => entries,
            Err(_) => {
                tally.unreadable.fetch_add(1, Ordering::Relaxed);
                return;
            }
        },
    };
    drop(folder);
    let mut subdirs = Vec::new();
    for entry in &entries {
        if entry.error != 0 {
            continue;
        }
        if entry.is_dir {
            // A cloud folder whose contents macOS hasn't listed holds nothing on this Mac.
            if entry.flags & SF_DATALESS == 0 {
                subdirs.push(path.join(&entry.name));
            }
        } else if entry.is_file {
            let sharing = Sharing::of(entry.clone_id, entry.clone_refs, entry.ext_flags);
            tally.file(device, entry.inode, entry.nlink, entry.size, entry.private, sharing);
        }
    }
    subdirs.par_iter().for_each(|subdir| walk(tally, subdir, device));
}

/// Prints the measurement as one JSON line, as `scan` prints its result.
pub fn print(paths: &[String]) {
    let paths: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();
    // Paths come from the app's own scan, so a NUL in one is a bug there, not something to measure.
    if paths.iter().any(|path| CString::new(path.as_os_str().as_bytes()).is_err()) {
        println!("{}", serde_json::json!({ "type": "fatal", "reason": "A path to measure contains a NUL byte." }));
        std::process::exit(2);
    }
    match serde_json::to_string(&measure(&paths)) {
        Ok(line) => println!("{line}"),
        Err(error) => println!("{}", serde_json::json!({ "type": "fatal", "reason": error.to_string() })),
    }
}
