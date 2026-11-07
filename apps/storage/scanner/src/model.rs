//! Tree model produced by the walk and serialized as the final NDJSON `tree` event.
//!
//! Memory is bounded during the walk: every directory keeps exact aggregate sizes
//! plus only its few largest direct files. Tiny files are folded into `own_files_size`
//! so a whole-disk scan stays compact instead of materializing one node per file.

use serde::Serialize;

use crate::kinds::{kind_of, KindBytes};

/// Number of largest direct files retained per directory for the treemap.
pub const TOP_FILES_PER_DIR: usize = 8;

/// Unreadable folders listed per directory. Each costs a few bytes of payload, and past this many the summary's
/// counts say how many more there are.
pub const UNREADABLE_PER_DIR: usize = 64;

/// Why a folder isn't in the totals.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DirStatus {
    Listed,
    /// Opening or listing it failed with this errno.
    Unreadable(i32),
    /// Another file system is mounted here. When it shares the scanned disk its used space is the folder's size.
    Volume { shares_disk: bool },
}

/// Why a folder couldn't be read, from its errno. Serialized as `"protected"`, `"denied"` or `"other"`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum UnreadableReason {
    /// EPERM: macOS privacy protection. Full Disk Access lifts it for most folders.
    Protected,
    /// EACCES: the folder's permissions, such as another user's or the system's files.
    Denied,
    Other,
}

impl UnreadableReason {
    pub fn of(errno: i32) -> Self {
        match errno {
            libc::EPERM => UnreadableReason::Protected,
            libc::EACCES => UnreadableReason::Denied,
            _ => UnreadableReason::Other,
        }
    }
}

/// A single large file worth showing individually in the treemap / largest-files list.
#[derive(Clone, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    /// Allocated (on-disk) bytes.
    pub size: u64,
}

/// A directory in the scanned tree.
pub struct DirNode {
    pub name: String,
    pub path: String,
    pub status: DirStatus,
    /// Total allocated bytes for this directory and everything beneath it.
    pub size: u64,
    /// Allocated bytes of files directly in this directory (not subdirectories).
    pub own_files_size: u64,
    /// Count of files (recursive).
    pub file_count: u64,
    /// Bytes by file kind (recursive), so grouped small items can still say what they are.
    pub kinds: KindBytes,
    pub dirs: Vec<DirNode>,
    /// Largest direct files (capped at TOP_FILES_PER_DIR), descending by size.
    pub top_files: Vec<FileEntry>,
}

impl DirNode {
    pub fn new(name: String, path: String) -> Self {
        DirNode {
            name,
            path,
            status: DirStatus::Listed,
            size: 0,
            own_files_size: 0,
            file_count: 0,
            kinds: KindBytes::default(),
            dirs: Vec::new(),
            top_files: Vec::new(),
        }
    }

    /// Record a direct file: add to aggregates and keep it if it's among the largest.
    pub fn add_file(&mut self, name: &str, path: &str, size: u64) {
        self.own_files_size += size;
        self.size += size;
        self.file_count += 1;
        self.kinds.0[kind_of(name)] += size;
        // Keep only the largest TOP_FILES_PER_DIR files.
        if self.top_files.len() < TOP_FILES_PER_DIR {
            self.top_files.push(FileEntry {
                name: name.to_string(),
                path: path.to_string(),
                size,
            });
            self.top_files.sort_unstable_by(|a, b| b.size.cmp(&a.size));
        } else if size > self.top_files[TOP_FILES_PER_DIR - 1].size {
            self.top_files[TOP_FILES_PER_DIR - 1] = FileEntry {
                name: name.to_string(),
                path: path.to_string(),
                size,
            };
            self.top_files.sort_unstable_by(|a, b| b.size.cmp(&a.size));
        }
    }

    /// Fold a finished child directory into this one.
    pub fn add_child(&mut self, child: DirNode) {
        self.size += child.size;
        self.file_count += child.file_count;
        self.kinds.add(&child.kinds);
        self.dirs.push(child);
    }
}

/// What a treemap node stands for. Serialized as `"dir"`, `"file"`, `"aggregate"`, `"unreadable"` or `"volume"`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeKind {
    Dir,
    File,
    /// Synthetic "(smaller items)" node: many small files and folders folded together.
    /// It has no real path on disk and can't be trashed.
    Aggregate,
    /// A folder the scan couldn't read. Its size is unknown, so it's 0 and `reason` says why.
    Unreadable,
    /// Another volume mounted here, which the walk doesn't enter. Its size is its used space when
    /// `sharesDisk` is true (the startup disk's Preboot and VM volumes), and 0 otherwise.
    Volume,
}

/// Serialized treemap node sent to the client. Directories and files share one shape
/// so the treemap layout can treat them uniformly; `kind` tells them apart.
#[derive(Serialize)]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub kind: NodeKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<UnreadableReason>,
    #[serde(rename = "sharesDisk", skip_serializing_if = "Option::is_none")]
    pub shares_disk: Option<bool>,
    /// Files inside a folder or a group of smaller items, counted once each; absent for a file.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub files: Option<u64>,
    /// A group of smaller items' bytes by file kind, so the map's legend counts them as what they are.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kinds: Option<KindBytes>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<TreeNode>,
}

impl TreeNode {
    fn leaf(name: String, path: String, size: u64, kind: NodeKind) -> Self {
        TreeNode { name, path, size, kind, reason: None, shares_disk: None, files: None, kinds: None, children: Vec::new() }
    }
}

/// Threshold policy controlling how aggressively small nodes are pruned for the payload.
pub struct PruneConfig {
    /// A node is emitted individually only if its size >= this many bytes.
    pub min_bytes: u64,
}

impl PruneConfig {
    /// Derive a threshold from the total so the payload stays bounded regardless of disk size.
    pub fn from_total(total: u64) -> Self {
        // Anything smaller than ~1/20000 of the total is folded into an aggregate so the
        // payload stays bounded on huge disks. A small 4 KB floor preserves structure when
        // scanning small folders (where the node count is naturally tiny anyway).
        let dynamic = total / 20_000;
        PruneConfig {
            min_bytes: dynamic.max(4 * 1024),
        }
    }
}

impl DirNode {
    /// Convert the in-memory tree into the pruned, serializable treemap tree.
    pub fn into_tree(self, cfg: &PruneConfig) -> TreeNode {
        let DirNode {
            name,
            path,
            status,
            size,
            own_files_size,
            file_count,
            kinds,
            dirs,
            top_files,
        } = self;
        match status {
            DirStatus::Listed => {}
            DirStatus::Unreadable(errno) => {
                return TreeNode { reason: Some(UnreadableReason::of(errno)), ..TreeNode::leaf(name, path, 0, NodeKind::Unreadable) };
            }
            DirStatus::Volume { shares_disk } => {
                return TreeNode { shares_disk: Some(shares_disk), ..TreeNode::leaf(name, path, size, NodeKind::Volume) };
            }
        }

        let mut children: Vec<TreeNode> = Vec::new();
        let mut folded_dirs_bytes: u64 = 0;
        // Files in the aggregate: those of folded folders and the direct files not shown on their own.
        let mut folded_files: u64 = file_count - dirs.iter().map(|d| d.file_count).sum::<u64>();
        // What the aggregate holds by kind: everything here, less what's shown on its own.
        let mut folded_kinds = kinds;
        let mut unreadable = 0;

        for d in dirs {
            match d.status {
                // Unknown size, so never folded by size: the map lists them, up to a bound.
                DirStatus::Unreadable(_) => {
                    if unreadable < UNREADABLE_PER_DIR {
                        unreadable += 1;
                        children.push(d.into_tree(cfg));
                    }
                }
                // Few, and each says where the scan stopped, so a volume stays visible even when small.
                DirStatus::Volume { .. } => children.push(d.into_tree(cfg)),
                DirStatus::Listed if d.size >= cfg.min_bytes => {
                    folded_kinds.subtract(&d.kinds);
                    children.push(d.into_tree(cfg));
                }
                DirStatus::Listed => {
                    folded_dirs_bytes += d.size;
                    folded_files += d.file_count;
                }
            }
        }

        // Add large direct files; fold the rest of own_files_size into "other files".
        let mut shown_files_bytes: u64 = 0;
        for f in &top_files {
            if f.size >= cfg.min_bytes {
                shown_files_bytes += f.size;
                folded_files -= 1;
                folded_kinds.0[kind_of(&f.name)] = folded_kinds.0[kind_of(&f.name)].saturating_sub(f.size);
                children.push(TreeNode::leaf(f.name.clone(), f.path.clone(), f.size, NodeKind::File));
            }
        }

        let other_files = own_files_size.saturating_sub(shown_files_bytes);
        let other = other_files + folded_dirs_bytes;
        if other > 0 {
            let aggregate = TreeNode::leaf("(smaller items)".to_string(), format!("{path}/__other__"), other, NodeKind::Aggregate);
            children.push(TreeNode { files: Some(folded_files), kinds: Some(folded_kinds), ..aggregate });
        }

        children.sort_unstable_by(|a, b| b.size.cmp(&a.size));

        TreeNode { children, files: Some(file_count), ..TreeNode::leaf(name, path, size, NodeKind::Dir) }
    }
}
