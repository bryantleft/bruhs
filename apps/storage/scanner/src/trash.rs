//! Reversible deletion: move a path to the macOS Trash (Put-Back supported) rather than
//! unlinking it. Emits a single JSON line describing the outcome.

use std::path::Path;

pub fn trash_path(path: &str) {
    let p = Path::new(path);
    if !p.exists() {
        println!(
            "{{\"type\":\"trash\",\"ok\":false,\"path\":{path:?},\"reason\":\"not_found\"}}"
        );
        return;
    }
    match trash::delete(p) {
        Ok(()) => println!("{{\"type\":\"trash\",\"ok\":true,\"path\":{path:?}}}"),
        Err(e) => println!(
            "{{\"type\":\"trash\",\"ok\":false,\"path\":{path:?},\"reason\":{:?}}}",
            e.to_string()
        ),
    }
}
