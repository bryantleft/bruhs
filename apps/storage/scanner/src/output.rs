//! NDJSON output shapes. The scanner prints one JSON object per line: many `progress`
//! events during the walk, then a single final `result` line.

use serde::Serialize;

use crate::model::{FileEntry, TreeNode};

/// Version of the `result` line's shape. The client ignores cached snapshots written by
/// a scanner with a different version. Bump it whenever `TreeNode` or `Result` changes.
pub const RESULT_VERSION: u32 = 2;

#[derive(Serialize)]
pub struct Summary {
    pub dirs: u64,
    pub files: u64,
    pub bytes: u64,
    pub errors: u64,
    #[serde(rename = "elapsedMs")]
    pub elapsed_ms: u128,
    pub engine: &'static str,
}

#[derive(Serialize)]
pub struct Result<'a> {
    #[serde(rename = "type")]
    pub kind: &'static str, // "result"
    pub version: u32,
    pub root: TreeNode,
    #[serde(rename = "topFiles")]
    pub top_files: &'a [FileEntry],
    pub summary: Summary,
}

/// Serialize the final result as a single NDJSON line.
pub fn emit_result(root: TreeNode, top_files: &[FileEntry], summary: Summary) {
    let result = Result {
        kind: "result",
        version: RESULT_VERSION,
        root,
        top_files,
        summary,
    };
    // A failure to serialize is unrecoverable; surface it as an error line.
    match serde_json::to_string(&result) {
        Ok(s) => println!("{s}"),
        Err(e) => println!(
            "{}",
            serde_json::json!({ "type": "fatal", "reason": e.to_string() })
        ),
    }
}
