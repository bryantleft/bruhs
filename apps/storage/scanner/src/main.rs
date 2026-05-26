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
use storage_scanner::output::{self, Summary};
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

    let scanner = Arc::new(Scanner::new(engine));
    let done = Arc::new(AtomicBool::new(false));
    let progress = walk::spawn_progress(scanner.clone(), done.clone());

    let start = Instant::now();
    // Walk on the rayon pool. Scanner is shared immutably; interior mutability handles state.
    let tree = scanner.walk(root_path, root_name);
    done.store(true, Ordering::Relaxed);
    let _ = progress.join();

    let summary = Summary {
        dirs: scanner.dirs.load(Ordering::Relaxed),
        files: scanner.files.load(Ordering::Relaxed),
        bytes: scanner.bytes.load(Ordering::Relaxed),
        errors: scanner.errors.load(Ordering::Relaxed),
        elapsed_ms: start.elapsed().as_millis(),
        engine: engine_name,
    };

    let prune = PruneConfig::from_total(tree.size);
    let tree_node = tree.into_tree(&prune);

    // `scanner` is still shared via Arc; recover the owned Scanner to drain top files.
    let top_files = match Arc::try_unwrap(scanner) {
        Ok(s) => s.into_top_files(),
        Err(_) => Vec::new(),
    };

    output::emit_result(tree_node, &top_files, summary);
}
