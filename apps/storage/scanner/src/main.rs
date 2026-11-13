//! storage-scanner — fast macOS disk-usage scanner for the Storage app.
//!
//! Usage:
//!   storage-scanner scan --root <path> [--within <map root>] [--engine bulk|std]
//!   storage-scanner trash --path <path>
//!   storage-scanner frees --path <path> [--path <path>…]
//!   storage-scanner serve
//!
//! `scan` streams NDJSON: repeated `{"type":"progress",...}` lines, then one
//! `{"type":"result",...}` line with the pruned treemap tree, largest files, and a summary.
//! `frees` prints one `{"type":"frees",...}` line: what deleting the paths would free now.
//! `serve` keeps a live index of a disk for Pith, taking commands on stdin (see `serve.rs`).

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

use storage_scanner::model::PruneConfig;
use storage_scanner::frees;
use storage_scanner::output::{self, Clones, CloudOnly, Summary, Unreadable};
use storage_scanner::system::stop_cloud_downloads;
use storage_scanner::{serve, trash};
use storage_scanner::walk::{self, Engine, Scanner};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("scan") => cmd_scan(&args[1..]),
        Some("trash") => cmd_trash(&args[1..]),
        Some("frees") => cmd_frees(&args[1..]),
        Some("serve") => std::process::exit(serve::run()),
        _ => {
            eprintln!("usage: storage-scanner <scan|trash|frees|serve> [options]");
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

fn cmd_frees(args: &[String]) {
    let paths: Vec<String> = args.windows(2).filter(|pair| pair[0] == "--path").map(|pair| pair[1].clone()).collect();
    if paths.is_empty() {
        eprintln!("frees: --path <path> required");
        std::process::exit(2);
    }
    if let Err(reason) = stop_cloud_downloads() {
        println!("{}", serde_json::json!({ "type": "fatal", "reason": reason }));
        std::process::exit(1);
    }
    frees::print(&paths);
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
    // A folder scanned again inside a larger map: clone groups whose first copy lies elsewhere on it are counted there.
    let within = flag(args, "--within").map(Path::new);
    // Walk on the rayon pool. Scanner is shared immutably; interior mutability handles state.
    let tree = scanner.walk_within(root_path, root_name, within);
    done.store(true, Ordering::Relaxed);
    progress.thread().unpark();
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
        clones: Clones { files: load(&scanner.clones.files), bytes: load(&scanner.clones.bytes) },
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
