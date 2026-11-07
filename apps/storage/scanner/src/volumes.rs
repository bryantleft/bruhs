//! Where one volume ends and another begins, and which folders macOS shows at two paths.
//!
//! On the startup disk, macOS joins the read-only system volume and the data volume into one
//! tree: `/Users`, `/Applications`, `/Library` and the other paths in `/usr/share/firmlinks`
//! are firmlinks into the data volume, which is also mounted whole at `/System/Volumes/Data`.
//! Both volumes report one device number and a firmlinked folder has the same inode at both
//! of its paths, so a device check alone counts the data volume twice. The walk counts each
//! firmlinked folder at its visible path and skips the copy under `/System/Volumes/Data`.

use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};

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
