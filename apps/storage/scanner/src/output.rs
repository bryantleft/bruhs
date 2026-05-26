//! NDJSON output shapes. The scanner prints one JSON object per line: many `progress`
//! events during the walk, then a single final `result` line.

use serde::Serialize;

use crate::model::{FileEntry, TreeNode};

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
    pub root: TreeNode,
    #[serde(rename = "topFiles")]
    pub top_files: &'a [FileEntry],
    pub summary: Summary,
}

/// Serialize the final result as a single NDJSON line.
pub fn emit_result(root: TreeNode, top_files: &[FileEntry], summary: Summary) {
    let result = Result {
        kind: "result",
        root,
        top_files,
        summary,
    };
    // A failure to serialize is unrecoverable; surface it as an error line.
    match serde_json::to_string(&result) {
        Ok(s) => println!("{s}"),
        Err(e) => println!("{{\"type\":\"fatal\",\"reason\":{:?}}}", e.to_string()),
    }
}
