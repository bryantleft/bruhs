//! Reversible deletion: move a path to the macOS Trash (Put-Back supported) rather than
//! unlinking it. Emits a single JSON line describing the outcome.
//!
//! Both clients check a path against their scan before asking, but they compare paths, and the
//! startup disk shows the same folder at two paths (`/Users/you` and
//! `/System/Volumes/Data/Users/you`). So the last check is here, by file identity: the folders
//! macOS and the user can't do without are refused at any path that reaches them.

use std::collections::HashSet;
use std::ffi::CStr;
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};

use serde_json::json;

use crate::volumes::Identity;

/// Folders in the home folder that are never trashed whole: the system and apps keep data there, or iCloud
/// syncs them. Their contents can still go to the Trash item by item.
pub const VITAL_HOME_FOLDERS: &[&str] = &[
    ".Trash",
    "Applications",
    "Desktop",
    "Documents",
    "Downloads",
    "Library",
    "Library/Application Support",
    "Library/CloudStorage",
    "Library/Containers",
    "Library/Group Containers",
    "Library/Mobile Documents",
    "Library/Mobile Documents/com~apple~CloudDocs",
    "Movies",
    "Music",
    "Pictures",
    "Public",
];

/// Volume roots whose top-level folders hold the system: the startup disk as it's shown, and its data volume.
const SYSTEM_ROOTS: &[&str] = &["/", "/System/Volumes/Data"];

/// Why a path can't be trashed, as the `reason` both clients already map to a message.
#[derive(Debug, PartialEq, Eq)]
pub enum Refusal {
    NotFound,
    /// A folder on the protected list, reached at any path.
    Protected,
    /// A mounted volume's root: Finder ejects a volume, it doesn't trash one.
    Volume,
}

impl Refusal {
    pub fn reason(&self) -> &'static str {
        match self {
            Refusal::NotFound => "not_found",
            Refusal::Protected => "protected_path",
            Refusal::Volume => "volume",
        }
    }
}

/// The identities of every protected folder: the system roots and their top-level folders, the home folder and
/// each folder above it, and the vital folders inside it.
pub fn protected_identities(home: &Path) -> HashSet<Identity> {
    let mut protected = HashSet::new();
    // `metadata` follows symlinks and firmlinks, so /etc protects /private/etc and /Users protects the data volume's.
    let mut add = |path: &Path| {
        if let Ok(meta) = std::fs::metadata(path) {
            protected.insert((meta.dev(), meta.ino()));
        }
    };
    for root in SYSTEM_ROOTS {
        add(Path::new(root));
        for entry in std::fs::read_dir(root).into_iter().flatten().flatten() {
            add(&entry.path());
        }
    }
    for ancestor in home.ancestors() {
        add(ancestor);
    }
    for folder in VITAL_HOME_FOLDERS {
        add(&home.join(folder));
    }
    protected
}

/// Checks a path against the protected folders. The final component isn't followed: a symlink is trashed as itself.
pub fn check(path: &Path, protected: &HashSet<Identity>) -> Result<(), Refusal> {
    let meta = path.symlink_metadata().map_err(|_| Refusal::NotFound)?;
    if protected.contains(&(meta.dev(), meta.ino())) {
        return Err(Refusal::Protected);
    }
    if meta.is_dir() {
        let parent = path.parent().and_then(|p| std::fs::metadata(p).ok());
        if parent.is_some_and(|p| p.dev() != meta.dev()) {
            return Err(Refusal::Volume);
        }
    }
    Ok(())
}

/// The account's home folder from the user database, which an environment variable can't redirect.
pub fn home_folder() -> Option<PathBuf> {
    let entry = unsafe { libc::getpwuid(libc::getuid()) };
    if entry.is_null() {
        return None;
    }
    let dir = unsafe { CStr::from_ptr((*entry).pw_dir) };
    Some(PathBuf::from(dir.to_string_lossy().into_owned()))
}

pub fn trash_path(path: &str) {
    let p = Path::new(path);
    let protected = home_folder().map(|home| protected_identities(&home)).unwrap_or_default();
    // `symlink_metadata` doesn't follow links, so a dangling symlink still counts as
    // present and can be trashed (the link itself goes to the Trash, not its target).
    let line = match check(p, &protected) {
        Err(refusal) => json!({ "type": "trash", "ok": false, "path": path, "reason": refusal.reason() }),
        Ok(()) => match trash::delete(p) {
            Ok(()) => json!({ "type": "trash", "ok": true, "path": path }),
            Err(e) => {
                json!({ "type": "trash", "ok": false, "path": path, "reason": e.to_string() })
            }
        },
    };
    println!("{line}");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_home_folder_is_protected_at_its_data_volume_path() {
        let home = home_folder().expect("a home folder");
        let protected = protected_identities(&home);
        assert_eq!(check(&home, &protected), Err(Refusal::Protected));
        assert_eq!(check(Path::new("/Users"), &protected), Err(Refusal::Protected));
        assert_eq!(check(&home.join("Library"), &protected), Err(Refusal::Protected));
        // The same folder through the data volume: a path check passes it, the identity check doesn't.
        let twin = Path::new("/System/Volumes/Data").join(home.strip_prefix("/").unwrap());
        if twin.exists() {
            assert_eq!(check(&twin, &protected), Err(Refusal::Protected));
            assert_eq!(check(Path::new("/System/Volumes/Data/Users"), &protected), Err(Refusal::Protected));
            assert_eq!(check(&twin.join("Library"), &protected), Err(Refusal::Protected));
        }
    }

    #[test]
    fn ordinary_items_and_symlinks_to_protected_folders_pass() {
        let dir = std::env::temp_dir().join(format!("storage-trash-check-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let home = home_folder().unwrap();
        let protected = protected_identities(&home);
        let file = dir.join("file.bin");
        std::fs::write(&file, b"x").unwrap();
        let link = dir.join("home-link");
        std::os::unix::fs::symlink(&home, &link).unwrap();
        assert_eq!(check(&file, &protected), Ok(()));
        assert_eq!(check(&link, &protected), Ok(()), "a link goes to the Trash as itself");
        assert_eq!(check(&dir.join("missing"), &protected), Err(Refusal::NotFound));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_mounted_volume_is_refused() {
        let protected = HashSet::new();
        // /dev is devfs on every Mac: a volume root, whatever its path.
        assert_eq!(check(Path::new("/dev"), &protected), Err(Refusal::Volume));
    }
}
