//! One folder listed for the live index: its entries with sizes and clone attributes, or why there are none.

use std::ffi::CString;
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
use std::os::unix::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use crate::volumes;
use crate::walk::{path_of, read_dir_bulk, volume_id, Context, Entry};

pub enum Outcome {
    Listed(Vec<Entry>),
    /// Opening or listing it failed with this errno.
    Unreadable(i32),
    /// Another file system is mounted here. Its used space counts when it shares the indexed disk, as the startup
    /// disk's Preboot and VM volumes do; any other is never opened, so its listing has no inode.
    Volume { shares_disk: bool, used: u64, name: String },
    /// Nothing is at the path any more, or it isn't a folder now.
    Missing,
    /// The startup disk's second path to a firmlinked folder, which the index counts at its visible path.
    Firmlinked,
}

pub struct Listing {
    /// The folder's inode, or 0 when it couldn't be opened.
    pub inode: u64,
    pub outcome: Outcome,
}

impl Listing {
    fn failed(errno: i32) -> Self {
        let outcome = match errno {
            // O_NOFOLLOW refuses a symlink with ELOOP: a folder replaced by a link is gone as a folder.
            libc::ENOENT | libc::ENOTDIR | libc::ELOOP => Outcome::Missing,
            _ => Outcome::Unreadable(errno),
        };
        Listing { inode: 0, outcome }
    }
}

/// Lists the folder at `path`. It never follows a symlink at the path itself: an event can name a folder that a link
/// has since replaced, and the index must not count what the link points at.
pub fn list(path: &Path, cx: &Context) -> Listing {
    list_with(path, cx, &mut || {})
}

/// Lists the folder at `path`, calling `opened` once opening it is over. Opening a folder macOS protects waits until
/// the person answers macOS's question about Pith; reading what's in it never does.
pub fn list_with(path: &Path, cx: &Context, opened: &mut dyn FnMut()) -> Listing {
    if let Some(name) = volumes::left_unopened(path, cx.device, cx.container.as_deref()) {
        opened();
        return Listing { inode: 0, outcome: Outcome::Volume { shares_disk: false, used: 0, name } };
    }
    let Ok(cpath) = CString::new(path.as_os_str().as_bytes()) else { return Listing::failed(libc::ENOENT) };
    let raw = unsafe { libc::open(cpath.as_ptr(), libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC) };
    opened();
    if raw < 0 {
        return Listing::failed(errno());
    }
    let fd = unsafe { OwnedFd::from_raw_fd(raw) };
    let mut info: libc::stat = unsafe { std::mem::zeroed() };
    if unsafe { libc::fstat(fd.as_raw_fd(), &mut info) } != 0 {
        return Listing::failed(errno());
    }
    // Darwin's dev_t is signed; sign-extend it as std's `MetadataExt::dev` does.
    let device = i64::from(info.st_dev) as u64;
    let inode = info.st_ino;
    if device != cx.device {
        let from = volumes::mounted_from(path);
        let container = from.as_deref().and_then(volumes::container_of);
        let shares_disk = container.is_some() && container == cx.container.as_deref();
        let volume = volumes::volume_info(path);
        let name = volume.name.unwrap_or_else(|| path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default());
        let used = if shares_disk { volume.used.unwrap_or(0) } else { 0 };
        return Listing { inode, outcome: Outcome::Volume { shares_disk, used, name } };
    }
    if cx.firmlinks.get(&(device, inode)).is_some_and(|visible| visible != path) {
        return Listing { inode, outcome: Outcome::Firmlinked };
    }
    match read_dir_bulk(fd.as_raw_fd(), false) {
        Ok(entries) => Listing { inode, outcome: Outcome::Listed(entries) },
        Err(error) => Listing { inode, outcome: Outcome::Unreadable(error.raw_os_error().unwrap_or(0)) },
    }
}

fn errno() -> i32 {
    std::io::Error::last_os_error().raw_os_error().unwrap_or(0)
}

/// Where the file with inode `inode` is, on the volume holding `folder`, at the path the index counts it under.
/// fsgetpath(2) answers with the startup disk's data volume paths, such as /System/Volumes/Data/Users/…, which the
/// index counts at their firmlinked visible paths, such as /Users/….
pub fn path_of_inode(folder: &Path, inode: u64) -> Option<PathBuf> {
    let path = path_of(volume_id(folder)?, inode)?;
    Some(visible(path))
}

const DATA: &str = "/System/Volumes/Data";

fn visible(path: PathBuf) -> PathBuf {
    static FIRMLINKS: OnceLock<Vec<(String, String)>> = OnceLock::new();
    let firmlinks = FIRMLINKS.get_or_init(|| {
        std::fs::read_to_string(volumes::FIRMLINKS)
            .unwrap_or_default()
            .lines()
            .filter_map(|line| line.split_once('\t'))
            .map(|(shown, target)| (shown.to_string(), format!("{DATA}/{target}")))
            .collect()
    });
    let text = path.to_string_lossy();
    for (shown, target) in firmlinks {
        if let Some(rest) = text.strip_prefix(target.as_str()) {
            if rest.is_empty() || rest.starts_with('/') {
                return PathBuf::from(format!("{shown}{rest}"));
            }
        }
    }
    path
}
