//! NDJSON output shapes. The scanner prints one JSON object per line: many `progress`
//! events during the walk, then a single final `result` line.

use serde::Serialize;

use crate::model::{FileEntry, TreeNode};
use crate::volumes::VolumeEntry;
use crate::walk::UnreadableFolder;

/// Version of the `result` line's shape. The client ignores cached snapshots written by
/// a scanner with a different version. Bump it whenever `TreeNode` or `Result` changes.
pub const RESULT_VERSION: u32 = 4;

#[derive(Serialize)]
pub struct Summary {
    pub dirs: u64,
    pub files: u64,
    /// The scanned folder's size: its files, plus the used space of volumes that share its disk.
    pub bytes: u64,
    /// Folders the scan couldn't read, split by reason in `unreadable`.
    pub errors: u64,
    pub unreadable: Unreadable,
    /// Entries in readable folders that macOS wouldn't describe; the totals leave them out.
    #[serde(rename = "entryErrors")]
    pub entry_errors: u64,
    #[serde(rename = "cloudOnly")]
    pub cloud_only: CloudOnly,
    pub clones: Clones,
    #[serde(rename = "elapsedMs")]
    pub elapsed_ms: u128,
    pub engine: &'static str,
}

#[derive(Serialize)]
pub struct Unreadable {
    /// macOS privacy protection (EPERM). Full Disk Access lifts it for most folders.
    pub protected: u64,
    /// The folder's permissions (EACCES): another user's or the system's files.
    pub denied: u64,
    pub other: u64,
}

/// iCloud and File Provider items the scan counted without downloading.
#[derive(Serialize)]
pub struct CloudOnly {
    pub files: u64,
    /// Their full sizes, which they'd take once downloaded.
    pub bytes: u64,
    /// Folders whose contents macOS hasn't listed, so their files are unknown.
    pub folders: u64,
}

/// Full clones counted once, at another copy of their group, which the totals leave out.
#[derive(Serialize)]
pub struct Clones {
    pub files: u64,
    pub bytes: u64,
}

#[derive(Serialize)]
pub struct Result<'a> {
    #[serde(rename = "type")]
    pub kind: &'static str, // "result"
    pub version: u32,
    pub root: TreeNode,
    #[serde(rename = "topFiles")]
    pub top_files: &'a [FileEntry],
    /// Volumes mounted inside the scanned folder, which the walk didn't enter.
    pub volumes: &'a [VolumeEntry],
    /// Folders the scan couldn't read, shallowest first and capped; `summary.unreadable` counts them all.
    #[serde(rename = "unreadableFolders")]
    pub unreadable_folders: &'a [UnreadableFolder],
    pub summary: Summary,
}

/// Serialize the final result as a single NDJSON line.
pub fn emit_result(root: TreeNode, top_files: &[FileEntry], volumes: &[VolumeEntry], unreadable_folders: &[UnreadableFolder], summary: Summary) {
    let result = Result {
        kind: "result",
        version: RESULT_VERSION,
        root,
        top_files,
        volumes,
        unreadable_folders,
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
