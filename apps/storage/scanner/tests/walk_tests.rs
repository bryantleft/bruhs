//! Integration tests for the scanner's traversal and aggregation invariants.
//! These exercise the `std` engine against a fixture tree (the `bulk` engine is verified
//! to produce identical totals empirically against `du`).

use std::fs;
use std::path::PathBuf;

use storage_scanner::model::PruneConfig;
use storage_scanner::walk::{Engine, Scanner};

/// Each test gets its own fixture directory: tests run in parallel threads of one process.
fn fixture(test: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "storage-scanner-test-{}-{test}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(dir.join("a/b")).unwrap();
    fs::create_dir_all(dir.join("c")).unwrap();
    // Sizes are rounded up to filesystem block size; tests assert on relative structure
    // and counts rather than exact byte totals.
    fs::write(dir.join("a/file1.txt"), vec![b'x'; 8000]).unwrap();
    fs::write(dir.join("a/b/file2.bin"), vec![b'y'; 20000]).unwrap();
    fs::write(dir.join("c/file3.log"), vec![b'z'; 3000]).unwrap();
    dir
}

#[test]
fn counts_files_and_dirs() {
    let root = fixture("counts_files_and_dirs");
    let scanner = Scanner::new(Engine::Std);
    let tree = scanner.walk(&root, "root".into());

    assert_eq!(
        tree.file_count, 3,
        "should count all three files recursively"
    );
    assert!(tree.size > 0, "root must aggregate a non-zero size");
    // root + a + a/b + c = 4 dirs
    assert_eq!(scanner.dirs.load(std::sync::atomic::Ordering::Relaxed), 4);
    assert_eq!(scanner.files.load(std::sync::atomic::Ordering::Relaxed), 3);

    fs::remove_dir_all(&root).unwrap();
}

#[test]
fn sizes_aggregate_bottom_up() {
    let root = fixture("sizes_aggregate_bottom_up");
    let scanner = Scanner::new(Engine::Std);
    let tree = scanner.walk(&root, "root".into());

    // The size of the root equals the sum of its children's sizes.
    let child_sum: u64 = tree.dirs.iter().map(|d| d.size).sum::<u64>() + tree.own_files_size;
    assert_eq!(
        tree.size, child_sum,
        "root size must equal sum of subtrees + own files"
    );

    fs::remove_dir_all(&root).unwrap();
}

#[test]
fn prune_keeps_total_size() {
    let root = fixture("prune_keeps_total_size");
    let scanner = Scanner::new(Engine::Std);
    let tree = scanner.walk(&root, "root".into());
    let total = tree.size;

    let cfg = PruneConfig::from_total(total);
    let pruned = tree.into_tree(&cfg);
    // Pruning folds small nodes into aggregates but must preserve the total.
    assert_eq!(
        pruned.size, total,
        "pruned tree must preserve the total size"
    );
    let children_sum: u64 = pruned.children.iter().map(|c| c.size).sum();
    assert_eq!(
        children_sum, total,
        "children (incl. aggregates) must sum to total"
    );
    fn files(node: &storage_scanner::model::TreeNode) -> u64 {
        match node.kind {
            storage_scanner::model::NodeKind::File => 1,
            _ => node.files.unwrap_or(0),
        }
    }
    assert_eq!(pruned.files, Some(3));
    // A huge threshold folds every file into the root's group, which still says what they are.
    let tree = Scanner::new(Engine::Std).walk(&root, "root".into());
    let grouped = tree.into_tree(&PruneConfig { min_bytes: u64::MAX });
    let kinds = grouped.children[0].kinds.expect("a group carries its kinds");
    let names = storage_scanner::kinds::KIND_NAMES;
    let by = |name: &str| kinds.0[names.iter().position(|n| *n == name).unwrap()];
    assert!(by("document") > 0, "file1.txt and file3.log are documents");
    assert!(by("binary") > 0, "file2.bin is a binary");
    assert_eq!(kinds.0.iter().sum::<u64>(), grouped.children[0].size, "every grouped byte has a kind");
    assert_eq!(pruned.children.iter().map(files).sum::<u64>(), 3, "children's file counts add up to the folder's");

    fs::remove_dir_all(&root).unwrap();
}

#[test]
fn tree_nodes_carry_a_kind() {
    use storage_scanner::model::NodeKind;

    let root = fixture("tree_nodes_carry_a_kind");
    let scanner = Scanner::new(Engine::Std);
    let tree = scanner.walk(&root, "root".into());
    // A huge threshold folds everything below the root into one aggregate node.
    let pruned = tree.into_tree(&PruneConfig {
        min_bytes: u64::MAX,
    });
    assert_eq!(pruned.kind, NodeKind::Dir);
    assert_eq!(pruned.children.len(), 1);
    assert_eq!(pruned.children[0].kind, NodeKind::Aggregate);
    assert!(pruned.children[0].path.ends_with("/__other__"));

    let json = serde_json::to_value(&pruned).unwrap();
    assert_eq!(json["kind"], "dir");
    assert_eq!(json["children"][0]["kind"], "aggregate");
    assert!(json.get("isDir").is_none());

    fs::remove_dir_all(&root).unwrap();
}

#[test]
fn unreadable_folders_stay_in_the_tree_with_their_reason() {
    use std::os::unix::fs::PermissionsExt;
    use storage_scanner::model::{DirStatus, NodeKind, UnreadableReason};

    let root = fixture("unreadable_folders_stay_in_the_tree");
    let locked = root.join("locked");
    fs::create_dir_all(&locked).unwrap();
    fs::write(locked.join("secret.bin"), vec![b's'; 50_000]).unwrap();
    fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();

    for engine in [Engine::Bulk, Engine::Std] {
        let scanner = Scanner::new(engine);
        let tree = scanner.walk(&root, "root".into());
        let node = tree.dirs.iter().find(|d| d.name == "locked").expect("the locked folder is kept");
        assert_eq!(node.status, DirStatus::Unreadable(libc::EACCES));
        assert_eq!(node.size, 0, "an unreadable folder's size is unknown, not guessed");
        assert_eq!(scanner.errors.load(std::sync::atomic::Ordering::Relaxed), 1);
        assert_eq!(scanner.unreadable.denied.load(std::sync::atomic::Ordering::Relaxed), 1);

        let pruned = tree.into_tree(&PruneConfig { min_bytes: u64::MAX });
        let child = pruned.children.iter().find(|c| c.kind == NodeKind::Unreadable).expect("pruning keeps it");
        assert_eq!(child.reason, Some(UnreadableReason::Denied));
        let json = serde_json::to_value(child).unwrap();
        assert_eq!(json["kind"], "unreadable");
        assert_eq!(json["reason"], "denied");
    }

    fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
    fs::remove_dir_all(&root).unwrap();
}

#[test]
fn hard_links_count_once() {
    let root = fixture("hard_links_count_once");
    fs::hard_link(root.join("a/b/file2.bin"), root.join("c/twin.bin")).unwrap();
    for engine in [Engine::Bulk, Engine::Std] {
        let scanner = Scanner::new(engine);
        let tree = scanner.walk(&root, "root".into());
        assert_eq!(tree.file_count, 3, "the second link to file2.bin isn't another file");
    }
    fs::remove_dir_all(&root).unwrap();
}

#[test]
fn both_engines_agree() {
    let root = fixture("both_engines_agree");
    let bulk = Scanner::new(Engine::Bulk).walk(&root, "root".into());
    let std = Scanner::new(Engine::Std).walk(&root, "root".into());
    assert_eq!(bulk.size, std.size);
    assert_eq!(bulk.file_count, std.file_count);
    assert_eq!(bulk.dirs.len(), std.dirs.len());
    fs::remove_dir_all(&root).unwrap();
}

/// An APFS clone of `from` at `to`, as Finder's Duplicate and `cp -c` make.
fn clone_file(from: &std::path::Path, to: &std::path::Path) {
    use std::os::unix::ffi::OsStrExt;
    let from = std::ffi::CString::new(from.as_os_str().as_bytes()).unwrap();
    let to = std::ffi::CString::new(to.as_os_str().as_bytes()).unwrap();
    assert_eq!(unsafe { libc::clonefile(from.as_ptr(), to.as_ptr(), 0) }, 0, "the temp folder is on APFS");
}

#[test]
fn clones_count_once_at_the_copy_made_first() {
    use storage_scanner::model::NodeKind;

    let root = fixture("clones_count_once");
    let original = root.join("a/b/file2.bin");
    // The copies sit where the parallel walk can reach them before the original, which still holds the bytes.
    fs::create_dir_all(root.join("c/d")).unwrap();
    clone_file(&original, &root.join("c/copy.bin"));
    clone_file(&original, &root.join("c/d/copy2.bin"));
    let size = fs::metadata(&original).map(|m| std::os::unix::fs::MetadataExt::blocks(&m) * 512).unwrap();
    let plain = Scanner::new(Engine::Std).walk(&fixture("clones_count_once_plain"), "root".into()).size;

    for engine in [Engine::Bulk, Engine::Std] {
        let scanner = Scanner::new(engine);
        let tree = scanner.walk(&root, "root".into());
        assert_eq!(tree.size, plain, "two clones of file2.bin add nothing to the total");
        assert_eq!(tree.file_count, 5, "the copies are still files");
        assert_eq!(tree.clones, 2 * size, "the root says how much its clones leave out");
        let c = tree.dirs.iter().find(|d| d.name == "c").unwrap();
        let a = tree.dirs.iter().find(|d| d.name == "a").unwrap();
        assert_eq!(c.clones, 2 * size);
        assert_eq!(a.clones, 0, "the original holds the bytes");
        assert_eq!(a.size, 8192 + size, "file1.txt and the original");
        assert_eq!(scanner.clones.files.load(std::sync::atomic::Ordering::Relaxed), 2);
        assert_eq!(scanner.clones.bytes.load(std::sync::atomic::Ordering::Relaxed), 2 * size);

        let pruned = tree.into_tree(&PruneConfig { min_bytes: 1 });
        let c = pruned.children.iter().find(|n| n.name == "c").unwrap();
        assert_eq!(c.clones, Some(2 * size));
        assert!(
            c.children.iter().all(|n| n.kind != NodeKind::File || n.size > 0),
            "a copy whose bytes another file holds isn't drawn as a file"
        );
        let json = serde_json::to_value(&pruned).unwrap();
        assert!(json["children"].as_array().unwrap().iter().any(|n| n["clones"].as_u64() == Some(2 * size)));
        let top = scanner.into_top_files();
        assert_eq!(top.iter().filter(|f| f.name.contains("copy")).count(), 0, "copies aren't among the largest files");
        assert!(top.iter().any(|f| f.name == "file2.bin"));
    }
    fs::remove_dir_all(&root).unwrap();
    fs::remove_dir_all(fixture("clones_count_once_plain")).unwrap();
}

#[test]
fn a_changed_clone_counts_in_full() {
    let root = fixture("a_changed_clone_counts_in_full");
    let original = root.join("a/b/file2.bin");
    let copy = root.join("c/copy.bin");
    clone_file(&original, &copy);
    // Writing to a clone gives it blocks of its own, so it's no longer a full clone.
    let mut bytes = fs::read(&copy).unwrap();
    bytes[0] = b'!';
    fs::write(&copy, bytes).unwrap();
    let tree = Scanner::new(Engine::Bulk).walk(&root, "root".into());
    assert_eq!(tree.clones, 0);
    assert_eq!(tree.file_count, 4);
    fs::remove_dir_all(&root).unwrap();
}

#[test]
fn a_folder_scanned_again_leaves_its_clones_to_originals_elsewhere_on_the_map() {
    let root = fixture("rescanned_folder_clones");
    let original = root.join("a/b/file2.bin");
    clone_file(&original, &root.join("c/copy.bin"));
    let size = fs::metadata(&original).map(|m| std::os::unix::fs::MetadataExt::blocks(&m) * 512).unwrap();
    let log = 4096;

    let alone = Scanner::new(Engine::Bulk).walk(&root.join("c"), "c".into());
    assert_eq!(alone.size, log + size, "scanned on its own, the copy is the first it finds");
    let again = Scanner::new(Engine::Bulk).walk_within(&root.join("c"), "c".into(), Some(&root));
    assert_eq!(again.size, log, "as part of the map, the original in a/b holds the bytes");
    assert_eq!(again.clones, size);
    let outside = Scanner::new(Engine::Bulk).walk_within(&root.join("c"), "c".into(), Some(&root.join("c")));
    assert_eq!(outside.size, log + size, "an original outside the map counts for nothing on it");

    fs::remove_file(&original).unwrap();
    let orphan = Scanner::new(Engine::Bulk).walk_within(&root.join("c"), "c".into(), Some(&root));
    assert_eq!(orphan.size, log + size, "with the original gone, the copy holds its blocks alone");
    fs::remove_dir_all(&root).unwrap();
}
