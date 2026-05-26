//! Tree model produced by the walk and serialized as the final NDJSON `tree` event.
//!
//! Memory is bounded during the walk: every directory keeps exact aggregate sizes
//! plus only its few largest direct files. Tiny files are folded into `own_files_size`
//! so a whole-disk scan stays compact instead of materializing one node per file.

use serde::Serialize;

/// Number of largest direct files retained per directory for the treemap.
pub const TOP_FILES_PER_DIR: usize = 8;

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
    /// Total allocated bytes for this directory and everything beneath it.
    pub size: u64,
    /// Allocated bytes of files directly in this directory (not subdirectories).
    pub own_files_size: u64,
    /// Count of files (recursive).
    pub file_count: u64,
    pub dirs: Vec<DirNode>,
    /// Largest direct files (capped at TOP_FILES_PER_DIR), descending by size.
    pub top_files: Vec<FileEntry>,
}

impl DirNode {
    pub fn new(name: String, path: String) -> Self {
        DirNode {
            name,
            path,
            size: 0,
            own_files_size: 0,
            file_count: 0,
            dirs: Vec::new(),
            top_files: Vec::new(),
        }
    }

    /// Record a direct file: add to aggregates and keep it if it's among the largest.
    pub fn add_file(&mut self, name: &str, path: &str, size: u64) {
        self.own_files_size += size;
        self.size += size;
        self.file_count += 1;
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
        self.dirs.push(child);
    }
}

/// Serialized treemap node sent to the client. Directories and files share one shape
/// so the treemap layout can treat them uniformly.
#[derive(Serialize)]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    pub size: u64,
    #[serde(rename = "isDir")]
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<TreeNode>,
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
            size,
            own_files_size,
            file_count: _,
            dirs,
            top_files,
        } = self;

        let mut children: Vec<TreeNode> = Vec::new();
        let mut folded_dirs_bytes: u64 = 0;

        for d in dirs {
            if d.size >= cfg.min_bytes {
                children.push(d.into_tree(cfg));
            } else {
                folded_dirs_bytes += d.size;
            }
        }

        // Add large direct files; fold the rest of own_files_size into "other files".
        let mut shown_files_bytes: u64 = 0;
        for f in &top_files {
            if f.size >= cfg.min_bytes {
                shown_files_bytes += f.size;
                children.push(TreeNode {
                    name: f.name.clone(),
                    path: f.path.clone(),
                    size: f.size,
                    is_dir: false,
                    children: Vec::new(),
                });
            }
        }

        let other_files = own_files_size.saturating_sub(shown_files_bytes);
        let other = other_files + folded_dirs_bytes;
        if other > 0 {
            children.push(TreeNode {
                name: "(smaller items)".to_string(),
                path: format!("{path}/__other__"),
                size: other,
                is_dir: false,
                children: Vec::new(),
            });
        }

        children.sort_unstable_by(|a, b| b.size.cmp(&a.size));

        TreeNode {
            name,
            path,
            size,
            is_dir: true,
            children,
        }
    }
}
