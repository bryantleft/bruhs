//! storage-scanner — fast macOS disk-usage scanner for the Storage app.
//!
//! Usage:
//!   storage-scanner scan --root <path> [--engine bulk|std]
//!   storage-scanner trash --path <path>
//!
//! `scan` streams NDJSON: repeated `{"type":"progress",...}` lines, then one
//! `{"type":"result",...}` line with the pruned treemap tree, largest files, and a summary.

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

use storage_scanner::model::PruneConfig;
use storage_scanner::output::{self, CloudOnly, Summary, Unreadable};
use storage_scanner::trash;
use storage_scanner::walk::{self, Engine, Scanner};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("scan") => cmd_scan(&args[1..]),
        Some("trash") => cmd_trash(&args[1..]),
        _ => {
            eprintln!("usage: storage-scanner <scan|trash> [options]");
            std::process::exit(2);
        }
    }
}

fn flag<'a>(args: &'a [String], name: &str) -> Option<&'a str> {
    args.iter()
        .position(|a| a == name)
        .and_then(|i| args.get(i + 1))
        .map(String::as_str)
}

fn cmd_trash(args: &[String]) {
    match flag(args, "--path") {
        Some(p) => trash::trash_path(p),
        None => {
            eprintln!("trash: --path <path> required");
            std::process::exit(2);
        }
    }
}

fn cmd_scan(args: &[String]) {
    let root = match flag(args, "--root") {
        Some(r) => r.to_string(),
        None => {
            eprintln!("scan: --root <path> required");
            std::process::exit(2);
        }
    };
    let engine = match flag(args, "--engine") {
        Some("std") => Engine::Std,
        _ => Engine::Bulk,
    };
    let engine_name = if engine == Engine::Std { "std" } else { "bulk" };

    let root_path = Path::new(&root);
    let root_name = root_path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| root.clone());

    if let Err(reason) = stop_cloud_downloads() {
        println!("{}", serde_json::json!({ "type": "fatal", "reason": reason }));
        std::process::exit(1);
    }

    let scanner = Arc::new(Scanner::new(engine));
    let done = Arc::new(AtomicBool::new(false));
    let progress = walk::spawn_progress(scanner.clone(), done.clone());

    let start = Instant::now();
    // Walk on the rayon pool. Scanner is shared immutably; interior mutability handles state.
    let tree = scanner.walk(root_path, root_name);
    done.store(true, Ordering::Relaxed);
    let _ = progress.join();

    let load = |counter: &std::sync::atomic::AtomicU64| counter.load(Ordering::Relaxed);
    let summary = Summary {
        dirs: load(&scanner.dirs),
        files: load(&scanner.files),
        bytes: tree.size,
        errors: load(&scanner.errors),
        unreadable: Unreadable {
            protected: load(&scanner.unreadable.protected),
            denied: load(&scanner.unreadable.denied),
            other: load(&scanner.unreadable.other),
        },
        entry_errors: load(&scanner.entry_errors),
        cloud_only: CloudOnly {
            files: load(&scanner.cloud.files),
            bytes: load(&scanner.cloud.bytes),
            folders: load(&scanner.cloud.folders),
        },
        elapsed_ms: start.elapsed().as_millis(),
        engine: engine_name,
    };
    let volumes = scanner.volumes();
    let unreadable_folders = scanner.unreadable_folders();

    let prune = PruneConfig::from_total(tree.size);
    let tree_node = tree.into_tree(&prune);

    // `scanner` is still shared via Arc; recover the owned Scanner to drain top files.
    let top_files = match Arc::try_unwrap(scanner) {
        Ok(s) => s.into_top_files(),
        Err(_) => Vec::new(),
    };

    output::emit_result(tree_node, &top_files, &volumes, &unreadable_folders, summary);
}

/// Reading an iCloud file that isn't downloaded makes macOS download it, and so can reading its
/// attributes when a folder above it isn't downloaded either (Apple TN3150). This process opts out
/// before it reads anything; a scan that can't opt out doesn't run.
fn stop_cloud_downloads() -> Result<(), String> {
    const IOPOL_TYPE_VFS_MATERIALIZE_DATALESS_FILES: libc::c_int = 3;
    const IOPOL_SCOPE_PROCESS: libc::c_int = 0;
    const IOPOL_MATERIALIZE_DATALESS_FILES_OFF: libc::c_int = 1;
    extern "C" {
        fn setiopolicy_np(iotype: libc::c_int, scope: libc::c_int, policy: libc::c_int) -> libc::c_int;
    }
    let status = unsafe { setiopolicy_np(IOPOL_TYPE_VFS_MATERIALIZE_DATALESS_FILES, IOPOL_SCOPE_PROCESS, IOPOL_MATERIALIZE_DATALESS_FILES_OFF) };
    if status == 0 {
        Ok(())
    } else {
        Err(format!(
            "The scan didn't start: macOS wouldn't let it skip iCloud downloads ({}).",
            std::io::Error::last_os_error()
        ))
    }
}
