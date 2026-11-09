//! Where one volume ends and another begins, and which folders macOS shows at two paths.
//!
//! On the startup disk, macOS joins the read-only system volume and the data volume into one
//! tree: `/Users`, `/Applications`, `/Library` and the other paths in `/usr/share/firmlinks`
//! are firmlinks into the data volume, which is also mounted whole at `/System/Volumes/Data`.
//! Both volumes report one device number and a firmlinked folder has the same inode at both
//! of its paths, so a device check alone counts the data volume twice. The walk counts each
//! firmlinked folder at its visible path and skips the copy under `/System/Volumes/Data`.

use std::collections::HashMap;
use std::ffi::{CStr, CString, OsStr};
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use serde::Serialize;

/// A file system object's device and inode. A firmlinked folder has one identity at both of its paths.
pub type Identity = (u64, u64);

/// The firmlink list macOS ships: each line is a visible path, a tab, and its place on the data volume.
pub const FIRMLINKS: &str = "/usr/share/firmlinks";

/// Firmlinked folders inside `root`, by identity, each with the visible path the walk counts it under.
///
/// Empty unless `root` is on the startup disk's volume group, whose device is `/`'s.
pub fn firmlinks_inside(root: &Path, root_device: u64, list: &str) -> HashMap<Identity, PathBuf> {
    let on_startup_disk = std::fs::metadata("/").is_ok_and(|m| m.dev() == root_device);
    if !on_startup_disk {
        return HashMap::new();
    }
    list.lines()
        .filter_map(|line| line.split('\t').next())
        .map(Path::new)
        .filter(|visible| visible.is_absolute() && visible.starts_with(root))
        .filter_map(|visible| {
            // `metadata` follows the firmlink, so this is the folder's identity on the data volume.
            let meta = std::fs::metadata(visible).ok()?;
            Some(((meta.dev(), meta.ino()), visible.to_path_buf()))
        })
        .collect()
}

/// The disk a `/dev/diskNsM…` device belongs to, e.g. "disk3": APFS volumes in one container share its space.
pub fn container_of(device: &str) -> Option<&str> {
    let name = device.strip_prefix("/dev/")?;
    let digits = name.strip_prefix("disk")?.bytes().take_while(u8::is_ascii_digit).count();
    (digits > 0).then(|| &name[..4 + digits])
}

/// The device a path's file system is mounted from, such as "/dev/disk3s6", or a name such as "devfs".
pub fn mounted_from(path: &Path) -> Option<String> {
    let cpath = CString::new(path.as_os_str().as_bytes()).ok()?;
    let mut info: libc::statfs = unsafe { std::mem::zeroed() };
    if unsafe { libc::statfs(cpath.as_ptr(), &mut info) } != 0 {
        return None;
    }
    Some(unsafe { CStr::from_ptr(info.f_mntfromname.as_ptr()) }.to_string_lossy().into_owned())
}

/// The name the map gives another volume mounted at `path`, which it shows without opening it, or none when the path
/// may be opened: it isn't a mount point, or it's the mapped volume itself, or it's in the mapped disk's own APFS
/// container, as the startup disk's Preboot is, whose used space the map counts. Opening any other volume's mount
/// point can make macOS ask the person about Pith, for network and removable volumes, and the automount every Mac
/// has at /System/Volumes/Data/home counts as a network volume.
pub fn left_unopened(path: &Path, device: u64, container: Option<&str>) -> Option<String> {
    let mount = mount_at(path)?;
    if mount.device == device {
        return None;
    }
    let theirs = container_of(&mount.from);
    if theirs.is_some() && theirs == container {
        return None;
    }
    Some(path.file_name().map_or_else(|| path.to_string_lossy().into_owned(), |name| name.to_string_lossy().into_owned()))
}

/// A file system as the mount table gives it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Mount {
    /// The device its files report, as `st_dev` gives it.
    pub device: u64,
    /// Where it's mounted from, such as "/dev/disk3s2" or "map auto_home".
    pub from: String,
}

/// The file system mounted at exactly `path`, from the mount table rather than from the path, which isn't touched.
pub fn mount_at(path: &Path) -> Option<Mount> {
    mount_table().iter().find(|(at, _)| at == path).map(|(_, mount)| mount.clone())
}

type MountTable = Arc<Vec<(PathBuf, Mount)>>;

/// The mount table, read again whenever the number of file systems mounted changes. Counting them takes 0.44 µs on
/// the development Mac, which every listing can afford, so a disk plugged in mid-walk is never opened.
fn mount_table() -> MountTable {
    static TABLE: RwLock<Option<(i32, MountTable)>> = RwLock::new(None);
    let count = unsafe { libc::getfsstat(std::ptr::null_mut(), 0, libc::MNT_NOWAIT) };
    if let Some((read, table)) = TABLE.read().unwrap().as_ref() {
        if *read == count {
            return table.clone();
        }
    }
    let table = Arc::new(read_mount_table());
    *TABLE.write().unwrap() = Some((count, table.clone()));
    table
}

fn read_mount_table() -> Vec<(PathBuf, Mount)> {
    let count = unsafe { libc::getfsstat(std::ptr::null_mut(), 0, libc::MNT_NOWAIT) };
    // Room for a few more, in case some mount in between.
    let mut all: Vec<libc::statfs> = vec![unsafe { std::mem::zeroed() }; count.max(0) as usize + 4];
    let size = (all.len() * std::mem::size_of::<libc::statfs>()) as libc::c_int;
    // MNT_NOWAIT answers from the kernel's table without asking any file system, a network one included.
    let read = unsafe { libc::getfsstat(all.as_mut_ptr(), size, libc::MNT_NOWAIT) };
    all.truncate(read.max(0) as usize);
    all.iter()
        .map(|fs| {
            let at = PathBuf::from(OsStr::from_bytes(unsafe { CStr::from_ptr(fs.f_mntonname.as_ptr()) }.to_bytes()));
            let from = unsafe { CStr::from_ptr(fs.f_mntfromname.as_ptr()) }.to_string_lossy().into_owned();
            // fsid_t's first half is the device number its files report; libc keeps the field private.
            let fsid: [i32; 2] = unsafe { std::mem::transmute(fs.f_fsid) };
            // Darwin's dev_t is signed; sign-extended as listings do.
            (at, Mount { device: i64::from(fsid[0]) as u64, from })
        })
        .collect()
}

/// A volume's own name and used space. `statfs(2)` can't give the space: APFS volumes in one container report
/// the container's blocks, so every volume would claim the whole disk's use. `df` reads this attribute too.
pub struct VolumeInfo {
    /// E.g. "Preboot" or "iOS 17.2 21C62 Simulator"; nil when the volume has none.
    pub name: Option<String>,
    pub used: Option<u64>,
}

pub fn volume_info(path: &Path) -> VolumeInfo {
    #[repr(C)]
    struct AttrList {
        bitmapcount: u16,
        reserved: u16,
        commonattr: u32,
        volattr: u32,
        dirattr: u32,
        fileattr: u32,
        forkattr: u32,
    }
    const ATTR_VOL_INFO: u32 = 0x8000_0000;
    const ATTR_VOL_NAME: u32 = 0x0000_2000;
    const ATTR_VOL_SPACEUSED: u32 = 0x0080_0000;
    let none = VolumeInfo { name: None, used: None };
    let Ok(cpath) = CString::new(path.as_os_str().as_bytes()) else { return none };
    let mut list = AttrList { bitmapcount: 5, reserved: 0, commonattr: 0, volattr: ATTR_VOL_INFO | ATTR_VOL_NAME | ATTR_VOL_SPACEUSED, dirattr: 0, fileattr: 0, forkattr: 0 };
    // u32 length, the used space, then the name's attrreference_t; the name's bytes follow. The kernel packs the
    // space attributes ahead of the name, not in bit order (checked on macOS 26.3 against `df`).
    let mut words = [0u64; 160];
    let buf: &mut [u8] = unsafe { std::slice::from_raw_parts_mut(words.as_mut_ptr().cast::<u8>(), words.len() * 8) };
    let status = unsafe {
        libc::getattrlist(cpath.as_ptr(), &mut list as *mut AttrList as *mut libc::c_void, buf.as_mut_ptr() as *mut libc::c_void, buf.len(), 0)
    };
    if status != 0 {
        return none;
    }
    let used = buf.get(4..12).map(|b| i64::from_ne_bytes(b.try_into().unwrap()).max(0) as u64);
    let name = (|| {
        let offset = i32::from_ne_bytes(buf.get(12..16)?.try_into().ok()?);
        let length = u32::from_ne_bytes(buf.get(16..20)?.try_into().ok()?) as usize;
        // The offset is relative to the attrreference_t itself.
        let start = usize::try_from(12 + i64::from(offset)).ok()?;
        let name = String::from_utf8_lossy(buf.get(start..start + length.saturating_sub(1))?).into_owned();
        (!name.is_empty()).then_some(name)
    })();
    VolumeInfo { name, used }
}

/// A volume mounted inside the scanned folder. The walk doesn't enter it: its files are on another file system.
#[derive(Clone, Serialize)]
pub struct VolumeEntry {
    pub path: String,
    pub name: String,
    /// The volume's used space when it shares the scanned disk, such as the startup disk's Preboot and VM volumes.
    /// Zero for anything else (an external disk, a mounted disk image), whose space isn't on this disk.
    pub bytes: u64,
    #[serde(rename = "sharesDisk")]
    pub shares_disk: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn containers_come_from_the_device_name() {
        assert_eq!(container_of("/dev/disk3s1s1"), Some("disk3"));
        assert_eq!(container_of("/dev/disk3s6"), Some("disk3"));
        assert_eq!(container_of("/dev/disk12s2"), Some("disk12"));
        assert_eq!(container_of("devfs"), None);
        assert_eq!(container_of("map auto_home"), None);
        assert_eq!(container_of("/dev/diskX"), None);
    }

    #[test]
    fn a_volume_reports_its_own_space_not_its_containers() {
        let preboot = Path::new("/System/Volumes/Preboot");
        let (Some(volume), Some(disk)) = (volume_info(preboot).used, volume_info(Path::new("/")).used) else {
            return; // Not a Mac with the startup disk's volume layout.
        };
        let container = {
            let cpath = CString::new("/").unwrap();
            let mut info: libc::statfs = unsafe { std::mem::zeroed() };
            assert_eq!(unsafe { libc::statfs(cpath.as_ptr(), &mut info) }, 0);
            (info.f_blocks - info.f_bfree) * u64::from(info.f_bsize)
        };
        assert!(volume < container / 4, "Preboot's {volume} bytes should be a fraction of the container's {container}");
        assert!(disk < container, "the system volume's own use, not the container's");
        assert_eq!(volume_info(preboot).name.as_deref(), Some("Preboot"));
    }

    #[test]
    fn the_mount_table_matches_what_files_report() {
        let data = Path::new("/System/Volumes/Data");
        let Some(mount) = mount_at(data) else { return }; // Not a Mac with the startup disk's volume layout.
        assert_eq!(mount.device, std::fs::metadata("/Users").unwrap().dev());
        assert_eq!(mount_at(Path::new("/System/Volumes/Preboot")).map(|m| m.device), Some(std::fs::metadata("/System/Volumes/Preboot").unwrap().dev()));
        assert!(mount_at(Path::new("/Users")).is_none(), "a firmlink isn't a mount point");
    }

    /// Review of a whole-disk walk without Full Disk Access: opening every Mac's automount asked the person about
    /// "files on a network volume", and the walk waited on the answer.
    #[test]
    fn other_volumes_are_shown_without_being_opened() {
        let root = Path::new("/");
        let device = std::fs::metadata(root).unwrap().dev();
        let container = mounted_from(root).as_deref().and_then(container_of).map(str::to_owned);
        let left = |path: &str| left_unopened(Path::new(path), device, container.as_deref());
        assert_eq!(left("/dev").as_deref(), Some("dev"));
        if mount_at(Path::new("/System/Volumes/Data/home")).is_some() {
            assert_eq!(left("/System/Volumes/Data/home").as_deref(), Some("home"));
        }
        // The startup disk's own volumes are opened for their used space, and plain folders as ever.
        assert_eq!(left("/System/Volumes/Data"), None);
        assert_eq!(left("/System/Volumes/Preboot"), None);
        assert_eq!(left("/Users"), None);
        assert_eq!(left("/"), None);
    }

    #[test]
    fn firmlinks_outside_the_startup_disk_are_ignored() {
        // A device no file system uses: nothing is on the startup disk, so nothing is skipped.
        assert!(firmlinks_inside(Path::new("/"), u64::MAX, "/Users\tUsers\n").is_empty());
    }

    #[test]
    fn firmlinks_are_kept_only_inside_the_scan() {
        let root = std::fs::metadata("/").unwrap().dev();
        let list = "/Users\tUsers\n/Applications\tApplications\n";
        let all = firmlinks_inside(Path::new("/"), root, list);
        assert_eq!(all.len(), 2);
        assert!(all.values().any(|p| p == Path::new("/Users")));
        let users = firmlinks_inside(Path::new("/Users"), root, list);
        assert_eq!(users.values().collect::<Vec<_>>(), vec![Path::new("/Users")]);
        assert!(firmlinks_inside(Path::new("/Library"), root, list).is_empty());
    }
}
