//! Immutable scan handles survive reconnects without using a transport as a conversation/session boundary.

use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::os::fd::AsRawFd;
use std::os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::cleanup;

const FORMAT: u32 = 1;
// Initial resource budget: 64 MiB of retained report blocks, with at most 8 MiB read into a worker for one report.
// Publishing may temporarily add one report under the cross-process lock; directory/lock metadata is separate.
// This retains at least eight maximum-size reports, above bruhs-ai's three concurrent turns. Exposed in status;
// replace these budgets with measured report sizes if actual whole-disk workloads need more. No report is truncated.
pub(super) const CACHE_BYTES: u64 = 64 << 20;
pub(super) const REPORT_BYTES: u64 = 8 << 20;
// Pith already checks its live map once a day. An assistant's older point-in-time evidence needs a new scan too.
pub(super) const RETENTION: u64 = 24 * 60 * 60;
const CACHE_ENV: &str = "PITH_MCP_REPORTS";

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Saved {
    format: u32,
    scope: PathBuf,
    report: Value,
}

pub(super) struct Store {
    directory: PathBuf,
}

pub(super) fn valid_id(id: &str) -> bool {
    id.strip_prefix("scan_").is_some_and(|hex| {
        hex.len() == 32
            && hex
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    })
}

pub(super) fn policy() -> Value {
    json!({ "retentionSeconds": RETENTION, "maxCacheBytes": CACHE_BYTES, "cacheAccounting": "allocated report blocks; excludes directory/lock metadata and one in-progress report", "maxReportBytes": REPORT_BYTES, "scopeBound": true })
}

impl Store {
    pub(super) fn from_env() -> Result<Self, String> {
        let directory = match std::env::var_os(CACHE_ENV) {
            Some(path) => PathBuf::from(path),
            None => PathBuf::from(
                std::env::var_os("HOME")
                    .ok_or("HOME is unavailable. Set it to this user's home folder.")?,
            )
            .join("Library/Caches/app.bruhs.pith/mcp-reports"),
        };
        if !directory.is_absolute() {
            return Err(format!(
                "{CACHE_ENV} must be an absolute private cache directory."
            ));
        }
        Ok(Self { directory })
    }

    pub(super) fn put(&self, scope: &Path, mut report: Value) -> Result<Value, String> {
        let mut entropy = [0; 16];
        getrandom::fill(&mut entropy)
            .map_err(|error| format!("Cannot create a scan ID: {error}"))?;
        let id = format!(
            "scan_{}",
            entropy
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>()
        );
        report["scan_id"] = json!(id);
        report["expiresAt"] = json!(cleanup::now().saturating_add(RETENTION));
        let saved = Saved {
            format: FORMAT,
            scope: scope.into(),
            report,
        };
        let bytes = serde_json::to_vec(&saved)
            .map_err(|error| format!("Cannot encode the scan report: {error}"))?;
        let length = u64::try_from(bytes.len()).map_err(|_| "The scan report is too large.")?;
        if length > REPORT_BYTES {
            return Err(format!("The scan report exceeds the {REPORT_BYTES}-byte report budget. Scan a narrower folder; no evidence was truncated."));
        }
        let _lock = self.lock()?;
        let temporary = self.directory.join(format!("partial-{id}"));
        let path = self.path(&id);
        let write = || -> std::io::Result<()> {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .mode(0o600)
                .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
                .open(&temporary)?;
            file.write_all(&bytes)?;
            file.sync_all()?;
            let allocated = file.metadata()?.blocks().saturating_mul(512);
            let budget = CACHE_BYTES.checked_sub(allocated).ok_or_else(|| {
                std::io::Error::other("The report's allocated blocks exceed the cache budget. Scan a narrower folder.")
            })?;
            self.prune(budget, Some(&temporary))
                .map_err(std::io::Error::other)?;
            // Publishing without replacement makes an ID collision fail rather than change an existing report.
            fs::hard_link(&temporary, &path)?;
            fs::remove_file(&temporary)?;
            File::open(&self.directory)?.sync_all()
        };
        if let Err(error) = write() {
            let _ = fs::remove_file(&temporary);
            return Err(format!("Cannot save Pith's scan report: {error}. Check the private cache directory and free disk space."));
        }
        Ok(saved.report)
    }

    pub(super) fn get(&self, scope: &Path, id: &str) -> Result<Value, String> {
        if !valid_id(id) {
            return Err("Invalid scan_id. Pass the exact scan_id returned by pith_scan.".into());
        }
        let _lock = self.lock()?;
        let path = self.path(id);
        let mut file = OpenOptions::new().read(true).custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC).open(&path)
            .map_err(|error| format!("Scan {id} is unavailable (expired, evicted, or removed): {error}. Run pith_scan again and use its new scan_id."))?;
        let meta = file
            .metadata()
            .map_err(|error| format!("Cannot inspect scan {id}: {error}"))?;
        private(&meta, false)?;
        if meta.len() > REPORT_BYTES {
            return Err("The cached scan exceeds its report budget. Run pith_scan again on a narrower folder.".into());
        }
        let mut bytes = Vec::new();
        (&mut file)
            .take(REPORT_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|error| format!("Cannot read scan {id}: {error}"))?;
        if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > REPORT_BYTES {
            return Err(
                "The cached scan changed past its report budget. Run pith_scan again.".into(),
            );
        }
        let saved: Saved = serde_json::from_slice(&bytes)
            .map_err(|error| format!("Scan {id} is damaged: {error}. Run pith_scan again."))?;
        if saved.format != FORMAT || saved.report["scan_id"] != id {
            return Err(format!(
                "Scan {id} uses an incompatible report format. Run pith_scan again."
            ));
        }
        if saved.scope != scope {
            return Err("This scan_id belongs to a different configured folder scope. Reconnect with the original scope or run pith_scan in this scope.".into());
        }
        let expires = saved.report["expiresAt"]
            .as_u64()
            .ok_or("The scan has no expiry. Run pith_scan again.")?;
        if cleanup::now() >= expires {
            fs::remove_file(&path)
                .map_err(|error| format!("Cannot remove expired scan {id}: {error}"))?;
            return Err(format!(
                "Scan {id} expired. Run pith_scan again and use its new scan_id."
            ));
        }
        let root = saved.report["root"]
            .as_str()
            .ok_or("The scan has no root. Run pith_scan again.")?;
        if !Path::new(root).starts_with(scope) || !saved.report["candidates"].is_array() {
            return Err("The cached scan contains invalid evidence. Run pith_scan again.".into());
        }
        Ok(saved.report)
    }

    fn path(&self, id: &str) -> PathBuf {
        self.directory.join(format!("{id}.json"))
    }

    fn lock(&self) -> Result<File, String> {
        fs::DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(&self.directory)
            .map_err(|error| format!("Cannot create Pith's private report cache: {error}"))?;
        let metadata = fs::symlink_metadata(&self.directory)
            .map_err(|error| format!("Cannot inspect Pith's report cache: {error}"))?;
        private(&metadata, true)?;
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
            .open(self.directory.join(".lock"))
            .map_err(|error| format!("Cannot open Pith's report cache lock: {error}"))?;
        private(
            &lock
                .metadata()
                .map_err(|error| format!("Cannot inspect the cache lock: {error}"))?,
            false,
        )?;
        // SAFETY: lock owns this open file descriptor; flock does not retain a pointer. Closing the file releases it.
        if unsafe { libc::flock(lock.as_raw_fd(), libc::LOCK_EX) } != 0 {
            return Err(format!(
                "Cannot lock Pith's report cache: {}",
                std::io::Error::last_os_error()
            ));
        }
        Ok(lock)
    }

    fn prune(&self, budget: u64, publishing: Option<&Path>) -> Result<(), String> {
        let mut reports = Vec::new();
        let mut total: u64 = 0;
        for entry in fs::read_dir(&self.directory)
            .map_err(|error| format!("Cannot list the report cache: {error}"))?
        {
            let entry =
                entry.map_err(|error| format!("Cannot list a report cache entry: {error}"))?;
            let name = entry.file_name();
            let Some(name) = name.to_str() else { continue };
            let partial = name.strip_prefix("partial-").is_some_and(valid_id);
            let report = name.strip_suffix(".json").is_some_and(valid_id);
            if !partial && !report {
                continue;
            }
            if publishing.is_some_and(|path| path == entry.path()) {
                continue;
            }
            let meta = fs::symlink_metadata(entry.path())
                .map_err(|error| format!("Cannot inspect a cached report: {error}"))?;
            private(&meta, false)?;
            let modified = meta
                .modified()
                .map_err(|error| format!("Cannot read a report's age: {error}"))?;
            let expired = SystemTime::now()
                .duration_since(modified)
                .is_ok_and(|age| age >= Duration::from_secs(RETENTION));
            if partial || expired {
                fs::remove_file(entry.path())
                    .map_err(|error| format!("Cannot remove an expired report: {error}"))?;
            } else {
                let allocated = meta.blocks().saturating_mul(512);
                total = total.saturating_add(allocated);
                reports.push((modified, entry.path(), allocated));
            }
        }
        reports.sort();
        for (_, path, length) in reports {
            if total <= budget {
                break;
            }
            fs::remove_file(path)
                .map_err(|error| format!("Cannot evict an old report: {error}"))?;
            total = total.saturating_sub(length);
        }
        Ok(())
    }
}

fn private(meta: &fs::Metadata, directory: bool) -> Result<(), String> {
    // SAFETY: geteuid takes no arguments and has no failure mode.
    let user = unsafe { libc::geteuid() };
    if meta.uid() != user
        || meta.mode() & 0o077 != 0
        || (directory && !meta.is_dir())
        || (!directory && !meta.is_file())
    {
        return Err("Pith's report cache must be a private directory owned by this user (0700), with regular files (0600). Choose a new private PITH_MCP_REPORTS directory or repair its permissions.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests;
