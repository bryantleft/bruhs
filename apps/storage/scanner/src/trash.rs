//! Reversible deletion: move a path to the macOS Trash (Put-Back supported) rather than
//! unlinking it. Emits a single JSON line describing the outcome.

use std::path::Path;

use serde_json::json;

pub fn trash_path(path: &str) {
    let p = Path::new(path);
    // `symlink_metadata` doesn't follow links, so a dangling symlink still counts as
    // present and can be trashed (the link itself goes to the Trash, not its target).
    let line = if p.symlink_metadata().is_err() {
        json!({ "type": "trash", "ok": false, "path": path, "reason": "not_found" })
    } else {
        match trash::delete(p) {
            Ok(()) => json!({ "type": "trash", "ok": true, "path": path }),
            Err(e) => {
                json!({ "type": "trash", "ok": false, "path": path, "reason": e.to_string() })
            }
        }
    };
    println!("{line}");
}
