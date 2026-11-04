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
