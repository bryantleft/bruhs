use super::*;
use std::os::unix::fs::{symlink, PermissionsExt};

struct Fixture(PathBuf);
impl Fixture {
    fn new(name: &str) -> Self {
        let path =
            std::env::temp_dir().join(format!("pith-report-store-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
    fn store(&self) -> Store {
        Store {
            directory: self.0.join("private-cache"),
        }
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn report(root: &str, marker: &str) -> Value {
    json!({ "root": root, "candidates": [{"marker": marker}], "completedAt": cleanup::now() })
}
fn id(report: &Value) -> &str {
    report["scan_id"].as_str().unwrap()
}

#[test]
fn immutable_reports_are_addressable_by_id_from_new_store_instances() {
    let fixture = Fixture::new("immutable");
    let scope = Path::new("/Users/test");
    let store = fixture.store();
    let first = store
        .put(scope, report("/Users/test/first", "first"))
        .unwrap();
    let second = store
        .put(scope, report("/Users/test/second", "second"))
        .unwrap();
    assert!(valid_id(id(&first)) && valid_id(id(&second)));
    assert_ne!(id(&first), id(&second));
    assert_eq!(fixture.store().get(scope, id(&first)).unwrap(), first);
    assert_eq!(fixture.store().get(scope, id(&second)).unwrap(), second);
    assert_eq!(
        fs::metadata(&store.directory).unwrap().permissions().mode() & 0o777,
        0o700
    );
    assert_eq!(
        fs::metadata(store.path(id(&first)))
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o600
    );
    assert!(fixture
        .store()
        .get(Path::new("/Users/test/first"), id(&first))
        .unwrap_err()
        .contains("different configured folder scope"));
}

#[test]
fn invalid_unknown_expired_and_damaged_ids_fail_explicitly() {
    let fixture = Fixture::new("invalid");
    let scope = Path::new("/Users/test");
    let store = fixture.store();
    assert!(store
        .get(scope, "../secret")
        .unwrap_err()
        .contains("Invalid scan_id"));
    assert!(
        !store.directory.exists(),
        "invalid IDs must fail before filesystem access"
    );
    assert!(store
        .get(scope, "scan_00000000000000000000000000000000")
        .unwrap_err()
        .contains("unavailable"));
    let first = store
        .put(scope, report("/Users/test/first", "first"))
        .unwrap();
    let path = store.path(id(&first));
    let mut saved: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    saved["report"]["expiresAt"] = json!(cleanup::now().saturating_sub(1));
    fs::write(&path, saved.to_string()).unwrap();
    assert!(store
        .get(scope, id(&first))
        .unwrap_err()
        .contains("expired"));
    assert!(!path.exists());
    let second = store
        .put(scope, report("/Users/test/second", "second"))
        .unwrap();
    fs::write(store.path(id(&second)), "{").unwrap();
    assert!(store
        .get(scope, id(&second))
        .unwrap_err()
        .contains("damaged"));
}

#[test]
fn cache_budget_evicts_old_ids_instead_of_substituting_new_evidence() {
    let fixture = Fixture::new("budget");
    let scope = Path::new("/Users/test");
    let store = fixture.store();
    let first = store
        .put(scope, report("/Users/test/first", "first"))
        .unwrap();
    let second = store
        .put(scope, report("/Users/test/second", "second"))
        .unwrap();
    let earlier = SystemTime::now() - Duration::from_secs(10);
    File::open(store.path(id(&first)))
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(earlier))
        .unwrap();
    let latest = fs::metadata(store.path(id(&second))).unwrap();
    let latest_size = latest.blocks() * 512;
    assert!(
        fs::metadata(store.path(id(&first))).unwrap().len() + latest.len() <= latest_size,
        "Small reports fit logically in one allocation, but must still evict by physical storage"
    );
    {
        let _lock = store.lock().unwrap();
        store.prune(latest_size, None).unwrap();
    }
    assert!(store
        .get(scope, id(&first))
        .unwrap_err()
        .contains("unavailable"));
    assert_eq!(store.get(scope, id(&second)).unwrap(), second);
}

#[test]
fn failed_publication_does_not_truncate_a_large_report_or_change_existing_evidence() {
    let fixture = Fixture::new("oversized");
    let scope = Path::new("/Users/test");
    let store = fixture.store();
    let first = store
        .put(scope, report("/Users/test/first", "first"))
        .unwrap();
    let mut oversized = report("/Users/test/second", "second");
    oversized["large"] = json!("x".repeat(usize::try_from(REPORT_BYTES).unwrap()));
    assert!(store
        .put(scope, oversized)
        .unwrap_err()
        .contains("no evidence was truncated"));
    assert_eq!(store.get(scope, id(&first)).unwrap(), first);
}

#[test]
fn cache_rejects_symlinks_and_shared_permissions() {
    let fixture = Fixture::new("private");
    let scope = Path::new("/Users/test");
    let store = fixture.store();
    let first = store
        .put(scope, report("/Users/test/first", "first"))
        .unwrap();
    fs::set_permissions(&store.directory, fs::Permissions::from_mode(0o755)).unwrap();
    assert!(store
        .get(scope, id(&first))
        .unwrap_err()
        .contains("private directory"));
    fs::set_permissions(&store.directory, fs::Permissions::from_mode(0o700)).unwrap();
    let outside = fixture.0.join("outside.json");
    fs::write(&outside, "outside data").unwrap();
    fs::remove_file(store.path(id(&first))).unwrap();
    symlink(&outside, store.path(id(&first))).unwrap();
    assert!(store.get(scope, id(&first)).is_err());
    assert_eq!(fs::read_to_string(&outside).unwrap(), "outside data");
    let alias = Store {
        directory: fixture.0.join("alias"),
    };
    symlink(&store.directory, &alias.directory).unwrap();
    assert!(alias.lock().is_err());
}

#[test]
fn concurrent_publishers_keep_distinct_reports_and_clean_only_owned_partial_files() {
    let fixture = Fixture::new("concurrent");
    let store = fixture.store();
    {
        let _lock = store.lock().unwrap();
    }
    let partial = store
        .directory
        .join("partial-scan_00000000000000000000000000000000");
    fs::write(&partial, "partial").unwrap();
    fs::set_permissions(&partial, fs::Permissions::from_mode(0o600)).unwrap();
    let unrelated = store.directory.join("unrelated");
    fs::write(&unrelated, "keep").unwrap();
    let jobs: Vec<_> = (0..8)
        .map(|number| {
            let directory = store.directory.clone();
            std::thread::spawn(move || {
                Store { directory }
                    .put(
                        Path::new("/Users/test"),
                        report("/Users/test/folder", &number.to_string()),
                    )
                    .unwrap()
            })
        })
        .collect();
    let reports: Vec<_> = jobs.into_iter().map(|job| job.join().unwrap()).collect();
    let ids: std::collections::HashSet<_> = reports.iter().map(id).collect();
    assert_eq!(ids.len(), 8);
    for report in &reports {
        assert_eq!(
            fixture
                .store()
                .get(Path::new("/Users/test"), id(report))
                .unwrap(),
            *report
        );
    }
    assert!(!partial.exists());
    assert!(unrelated.exists());
}
