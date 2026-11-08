//! What deleting items frees now, against clones and hard links whose copies sit inside or outside the items.

use std::fs;
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};

use storage_scanner::frees::measure;

fn folder(test: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("storage-frees-test-{}-{test}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(dir.join("inside")).unwrap();
    fs::create_dir_all(dir.join("outside")).unwrap();
    dir
}

fn write(path: &Path, bytes: usize) -> u64 {
    // Distinct bytes per file, so APFS can't share anything between them.
    let fill: Vec<u8> = (0..bytes).map(|i| (i as u8) ^ (path.as_os_str().len() as u8)).collect();
    fs::write(path, fill).unwrap();
    fs::metadata(path).unwrap().blocks() * 512
}

fn clone_file(from: &Path, to: &Path) {
    use std::os::unix::ffi::OsStrExt;
    let from = std::ffi::CString::new(from.as_os_str().as_bytes()).unwrap();
    let to = std::ffi::CString::new(to.as_os_str().as_bytes()).unwrap();
    assert_eq!(unsafe { libc::clonefile(from.as_ptr(), to.as_ptr(), 0) }, 0, "the temp folder is on APFS");
}

#[test]
fn shared_blocks_free_only_when_every_copy_goes() {
    let dir = folder("shared_blocks");
    let inside = dir.join("inside");
    let pair = write(&inside.join("pair"), 400_000);
    clone_file(&inside.join("pair"), &inside.join("pair-copy"));
    let shared = write(&inside.join("shared"), 200_000);
    clone_file(&inside.join("shared"), &dir.join("outside/shared-copy"));
    let linked = write(&inside.join("linked"), 100_000);
    fs::hard_link(inside.join("linked"), dir.join("outside/linked-too")).unwrap();
    let solo = write(&inside.join("solo"), 50_000);

    let frees = measure(&[inside.clone()]);
    assert_eq!(frees.files, 5);
    assert_eq!(frees.bytes, pair + solo, "the pair goes together; the clone and link outside keep theirs");
    assert_eq!(frees.shared, shared + linked);

    let both = measure(&[inside.clone(), dir.join("outside")]);
    assert_eq!(both.bytes, pair + shared + linked + solo, "with every copy deleted, everything goes");
    assert_eq!(both.shared, 0);

    let one = measure(&[inside.join("pair")]);
    assert_eq!((one.bytes, one.shared), (0, pair), "one copy of a pair frees nothing");
    fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn a_missing_path_counts_as_unreadable() {
    let frees = measure(&[PathBuf::from("/nonexistent/pith-frees-test")]);
    assert_eq!((frees.bytes, frees.files, frees.unreadable), (0, 0, 1));
}
