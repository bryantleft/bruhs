//! The live index: every folder of a disk with its size, kept current by listing again only the folders that change.
//!
//! Each folder keeps its totals for everything beneath it, so a change in one folder costs a listing of that folder
//! and an update of each folder above it. Files aren't kept, except those of `BIG_FILE` or more, by name, so the map
//! can show them on their own and list the largest. Every count follows the walk's rules (`walk.rs`): a hard-linked
//! file counts once, at the first link listed, and a group of full APFS clones counts once, at its lowest inode, with
//! the other copies' bytes reported as `clones`.
//!
//! A listing records what it found under a new generation of its folder. A clone group's holder and a hard link's
//! counted link are recorded with the generation of the folder they were found in, so a later listing of that folder
//! retires them without having to remember each file: whatever it finds again it records again.

use std::collections::{BinaryHeap, HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use crate::kinds::{kind_of, KindBytes, KIND_COUNT};
use crate::listing::{Listing, Outcome};
use crate::model::{FileEntry, NodeKind, PruneConfig, TreeNode, UnreadableReason, UNREADABLE_PER_DIR};
use crate::output::{self, Clones, CloudOnly, Summary, Unreadable};
use crate::volumes::VolumeEntry;
use crate::walk::{UnreadableFolder, SF_DATALESS, UNREADABLE_LISTED};

/// No folder: the end of a child list, or the root's parent.
pub const NONE: u32 = u32::MAX;
/// The indexed folder itself.
pub const ROOT: u32 = 0;

/// Files kept by name. Smaller files count in their folder's totals only. A map of a whole disk shows a file on its
/// own from 1/20,000 of the disk, about 38 MB on the development Mac's 770 GB, so 1 MiB only matters inside folders
/// under 20 GiB. `Index::stats` reports how many files it keeps.
pub const BIG_FILE: u64 = 1 << 20;

/// Kinds are kept in allocation blocks: APFS allocates whole 4 KiB blocks, so a u32 holds 16 TiB of one kind.
const BLOCK: u64 = 4096;

/// The largest files a map lists, as the walk's `TOP_FILES_GLOBAL`.
const TOP_FILES: usize = 200;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum Status {
    /// Found in its parent's listing and not listed itself yet.
    Pending = 0,
    Listed = 1,
    /// Opening or listing it failed; `Index::unreadable` has the errno.
    Unreadable = 2,
    /// Another file system is mounted here; `Index::volumes` has its space.
    Volume = 3,
    /// An unused slot.
    Free = 4,
}

impl Status {
    pub fn from_u8(value: u8) -> Option<Status> {
        Some(match value {
            0 => Status::Pending,
            1 => Status::Listed,
            2 => Status::Unreadable,
            3 => Status::Volume,
            4 => Status::Free,
            _ => return None,
        })
    }
}

/// One folder. Its totals are for everything beneath it; what its own files hold is the difference from its
/// subfolders' totals. 88 bytes, which `a_folder_stays_small` holds to.
#[derive(Clone)]
pub(crate) struct Folder {
    pub(crate) parent: u32,
    pub(crate) first_child: u32,
    pub(crate) next_sibling: u32,
    /// Bumped each time the folder is listed or freed, so records made at an earlier listing stop counting.
    pub(crate) gen: u32,
    pub(crate) name_at: u32,
    pub(crate) files: u32,
    /// Clone copies whose bytes another copy holds.
    pub(crate) clone_files: u32,
    pub(crate) name_len: u16,
    pub(crate) status: Status,
    pub(crate) inode: u64,
    pub(crate) size: u64,
    /// Bytes of clone copies that `size` leaves out, because another copy holds them.
    pub(crate) clones: u64,
    /// Bytes by kind, in `BLOCK`s.
    pub(crate) kinds: [u32; KIND_COUNT],
}

/// Totals for a folder, or for its own files, as signed changes are applied to them.
#[derive(Clone, Copy, Default, Debug, PartialEq, Eq)]
pub struct Totals {
    pub size: u64,
    pub clones: u64,
    pub files: u64,
    pub clone_files: u64,
    /// In `BLOCK`s.
    pub kinds: [u64; KIND_COUNT],
}

impl Totals {
    fn of(folder: &Folder) -> Totals {
        Totals {
            size: folder.size,
            clones: folder.clones,
            files: u64::from(folder.files),
            clone_files: u64::from(folder.clone_files),
            kinds: folder.kinds.map(u64::from),
        }
    }

    fn add(&mut self, other: &Totals) {
        self.size += other.size;
        self.clones += other.clones;
        self.files += other.files;
        self.clone_files += other.clone_files;
        for (mine, theirs) in self.kinds.iter_mut().zip(other.kinds) {
            *mine += theirs;
        }
    }

    /// What's left after taking `other` away, and whether any of it was more than there was.
    fn less(&self, other: &Totals) -> (Totals, bool) {
        let mut short = false;
        let mut sub = |a: u64, b: u64| {
            short |= b > a;
            a.saturating_sub(b)
        };
        let mut kinds = [0; KIND_COUNT];
        for (i, kind) in kinds.iter_mut().enumerate() {
            *kind = sub(self.kinds[i], other.kinds[i]);
        }
        let totals = Totals {
            size: sub(self.size, other.size),
            clones: sub(self.clones, other.clones),
            files: sub(self.files, other.files),
            clone_files: sub(self.clone_files, other.clone_files),
            kinds,
        };
        (totals, short)
    }

    fn kind_bytes(&self) -> KindBytes {
        KindBytes(self.kinds.map(|blocks| blocks * BLOCK))
    }
}

fn blocks(bytes: u64) -> u64 {
    bytes.div_ceil(BLOCK)
}

/// One copy of a clone group, where a listing found it.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Copy {
    pub(crate) inode: u64,
    pub(crate) size: u64,
    pub(crate) folder: u32,
    /// The folder's generation when the copy was found: once the folder is listed again or freed, the copy is
    /// only known there if that listing found it again.
    pub(crate) gen: u32,
    pub(crate) kind: u8,
}

/// Where a clone group's bytes count: at the lowest inode the index has seen, with the next copy to take them if
/// that one goes. Copies aren't all kept, for memory: a group whose holder and runner-up both go before another copy's
/// folder is listed counts nowhere until then, at the latest until the daily check.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Holder {
    pub(crate) holder: Copy,
    /// The lowest copy found counting none, since another holds the bytes.
    pub(crate) runner: Option<Copy>,
}

/// Clone groups' records, in a dense array behind a table of their places. A hash table of the records themselves
/// sits about half empty, rounding up to a power of two: the development Mac's 532,134 groups took 1,048,576 slots
/// of 80 bytes, where the table of places takes 12 bytes a slot.
#[derive(Default)]
pub(crate) struct Groups {
    at: HashMap<u64, u32>,
    keys: Vec<u64>,
    records: Vec<Holder>,
}

impl Groups {
    pub(crate) fn get(&self, group: &u64) -> Option<&Holder> {
        self.at.get(group).map(|&i| &self.records[i as usize])
    }

    pub(crate) fn insert(&mut self, group: u64, record: Holder) {
        match self.at.get(&group) {
            Some(&i) => self.records[i as usize] = record,
            None => {
                self.at.insert(group, self.records.len() as u32);
                self.keys.push(group);
                self.records.push(record);
            }
        }
    }

    pub(crate) fn remove(&mut self, group: &u64) {
        let Some(i) = self.at.remove(group) else { return };
        let i = i as usize;
        self.records.swap_remove(i);
        self.keys.swap_remove(i);
        if let Some(&moved) = self.keys.get(i) {
            self.at.insert(moved, i as u32);
        }
    }

    pub(crate) fn iter(&self) -> impl Iterator<Item = (&u64, &Holder)> {
        self.keys.iter().zip(self.records.iter())
    }

    pub(crate) fn values_mut(&mut self) -> impl Iterator<Item = &mut Holder> {
        self.records.iter_mut()
    }

    pub(crate) fn retain(&mut self, mut keep: impl FnMut(&u64, &Holder) -> bool) {
        let gone: Vec<u64> = self.iter().filter(|(group, record)| !keep(group, record)).map(|(&group, _)| group).collect();
        for group in gone {
            self.remove(&group);
        }
    }

    pub(crate) fn len(&self) -> usize {
        self.records.len()
    }

    pub(crate) fn shrink_to_fit(&mut self) {
        self.at.shrink_to_fit();
        self.keys.shrink_to_fit();
        self.records.shrink_to_fit();
    }

    /// Bytes the tables take, with a hash table's control byte and spare eighth.
    fn memory(&self) -> usize {
        self.at.capacity() * 13 * 8 / 7 + self.keys.capacity() * 8 + self.records.capacity() * std::mem::size_of::<Holder>()
    }
}

/// The link at which a hard-linked file counts.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Link {
    pub(crate) folder: u32,
    pub(crate) gen: u32,
}

/// A file of `BIG_FILE` or more.
#[derive(Clone, Debug)]
pub(crate) struct BigFile {
    pub(crate) name: Box<str>,
    /// Its allocated bytes, whether or not another copy of its clone group holds them.
    pub(crate) size: u64,
    pub(crate) inode: u64,
    /// Its clone group, or 0 when it isn't a full clone.
    pub(crate) group: u64,
}

#[derive(Clone, Debug)]
pub(crate) struct Volume {
    pub(crate) name: String,
    pub(crate) used: u64,
    pub(crate) shares_disk: bool,
}

/// iCloud and File Provider items a folder holds without their contents.
#[derive(Clone, Copy, Default, Debug, PartialEq, Eq)]
pub(crate) struct Cloud {
    pub(crate) files: u64,
    pub(crate) bytes: u64,
    pub(crate) folders: u64,
}

impl Cloud {
    fn is_empty(&self) -> bool {
        *self == Cloud::default()
    }
}

/// A folder that left its parent, kept whole for a while in case it turns up elsewhere: a move shows as one folder
/// losing it and another gaining it, often in listings seconds apart.
struct Limbo {
    folder: u32,
    since: Instant,
}

/// What applying a listing found.
pub struct Applied {
    /// Folders to list next: new subfolders, and every subfolder when the listing was deep.
    pub next: Vec<(u32, PathBuf)>,
    /// Whether anything the map shows changed.
    pub changed: bool,
    /// How many bytes the folder's own files and subfolders gained or lost, for a check's report of how far off the
    /// index was.
    pub drift: u64,
    /// Clone groups a copy here now holds though the copy isn't the group's original, which may still be counted
    /// in full in a folder listed before the clone was made: that folder is listed again, so the original takes the
    /// group's bytes back.
    pub originals: Vec<u64>,
    /// Nothing was at the folder's path: its parent has to be listed to tell whether it went or moved with a folder
    /// above it.
    pub missing: bool,
}

pub struct Index {
    root: String,
    pub(crate) folders: Vec<Folder>,
    free: Vec<u32>,
    /// Slots freed while a listing of them might still be in flight: reused only once none is.
    quarantine: Vec<u32>,
    pub(crate) names: Vec<u8>,
    /// Bytes of `names` no live folder uses.
    garbage: usize,
    pub(crate) holders: Groups,
    pub(crate) links: HashMap<u64, Link>,
    pub(crate) big: HashMap<u32, Vec<BigFile>>,
    pub(crate) unreadable: HashMap<u32, i32>,
    pub(crate) volumes: HashMap<u32, Volume>,
    pub(crate) cloud: HashMap<u32, Cloud>,
    pub(crate) entry_errors: HashMap<u32, u32>,
    /// Folders the startup disk shows at two paths, by inode, with the visible path the index counts them at.
    firmlinks: HashMap<u64, PathBuf>,
    /// The same firmlinks by visible path, and the folders that hold them. A firmlinked folder's parent on the system
    /// volume lists it by the system volume's inode, not the data volume's its own listing gives.
    firmlink_inodes: HashMap<PathBuf, u64>,
    firmlink_parents: HashSet<PathBuf>,
    limbo: HashMap<u64, Limbo>,
    /// Folders made new lately, by inode. A move whose new parent is listed before its old one makes a new folder
    /// for it first; when the old copy leaves, the new one is listed again in full, since its first listing skipped
    /// the hard links and clone copies the old copy still counted.
    recent: HashMap<u64, Limbo>,
    /// Folders to list again in full, for `Scheduler` to take.
    rescans: Vec<u32>,
    listed: u64,
    /// Files kept by name: `BIG_FILE`, or less in tests.
    big_file: u64,
    /// Times a total would have gone below zero. Each is a bookkeeping bug; `stats` reports them.
    pub inconsistencies: u64,
    /// How long the walk that built the index took.
    pub walk_ms: u64,
}

impl Index {
    /// An index of `root` holding only the root, to be listed first. `firmlinks` are the startup disk's firmlinked
    /// folders inside it, by inode, with the path each is counted at.
    pub fn new(root: &str, firmlinks: HashMap<u64, PathBuf>) -> Index {
        let (firmlink_inodes, firmlink_parents) = by_visible_path(&firmlinks);
        let mut index = Index {
            root: root.to_string(),
            folders: Vec::new(),
            free: Vec::new(),
            quarantine: Vec::new(),
            names: Vec::new(),
            garbage: 0,
            holders: Groups::default(),
            links: HashMap::new(),
            big: HashMap::new(),
            unreadable: HashMap::new(),
            volumes: HashMap::new(),
            cloud: HashMap::new(),
            entry_errors: HashMap::new(),
            firmlinks,
            firmlink_inodes,
            firmlink_parents,
            limbo: HashMap::new(),
            recent: HashMap::new(),
            rescans: Vec::new(),
            listed: 0,
            big_file: BIG_FILE,
            inconsistencies: 0,
            walk_ms: 0,
        };
        let root = index.allocate("", 0, NONE);
        debug_assert_eq!(root, ROOT);
        index
    }

    /// Keeps files of `bytes` or more by name, rather than `BIG_FILE`: tests use small files.
    pub fn keep_files_from(&mut self, bytes: u64) {
        self.big_file = bytes;
    }

    pub fn root(&self) -> &str {
        &self.root
    }

    pub fn set_firmlinks(&mut self, firmlinks: HashMap<u64, PathBuf>) {
        (self.firmlink_inodes, self.firmlink_parents) = by_visible_path(&firmlinks);
        self.firmlinks = firmlinks;
    }

    // ---- folders and names ----------------------------------------------------------------------------------------

    pub(crate) fn name(&self, id: u32) -> &str {
        let folder = &self.folders[id as usize];
        let at = folder.name_at as usize;
        std::str::from_utf8(&self.names[at..at + usize::from(folder.name_len)]).unwrap_or("")
    }

    fn push_name(&mut self, name: &str) -> (u32, u16) {
        // A name longer than any file system allows is cut at a character boundary rather than lost.
        let mut end = name.len().min(usize::from(u16::MAX));
        while !name.is_char_boundary(end) {
            end -= 1;
        }
        let at = self.names.len();
        if self.names.len() + end > self.names.capacity() {
            grow(&mut self.names);
        }
        self.names.extend_from_slice(&name.as_bytes()[..end]);
        (at as u32, end as u16)
    }

    fn rename(&mut self, id: u32, name: &str) {
        if self.name(id) == name {
            return;
        }
        self.garbage += usize::from(self.folders[id as usize].name_len);
        let (at, len) = self.push_name(name);
        let folder = &mut self.folders[id as usize];
        folder.name_at = at;
        folder.name_len = len;
    }

    fn allocate(&mut self, name: &str, inode: u64, parent: u32) -> u32 {
        let (name_at, name_len) = self.push_name(name);
        let folder = Folder {
            parent,
            first_child: NONE,
            next_sibling: NONE,
            gen: 0,
            name_at,
            files: 0,
            clone_files: 0,
            name_len,
            status: Status::Pending,
            inode,
            size: 0,
            clones: 0,
            kinds: [0; KIND_COUNT],
        };
        match self.free.pop() {
            Some(id) => {
                // A reused slot keeps counting generations up, so nothing recorded in its last use counts again.
                let gen = self.folders[id as usize].gen;
                self.folders[id as usize] = Folder { gen, ..folder };
                id
            }
            None => {
                grow(&mut self.folders);
                self.folders.push(folder);
                (self.folders.len() - 1) as u32
            }
        }
    }

    pub(crate) fn children(&self, id: u32) -> Children<'_> {
        Children { index: self, next: self.folders[id as usize].first_child }
    }

    fn relink(&mut self, id: u32, children: &[u32]) {
        self.folders[id as usize].first_child = children.first().copied().unwrap_or(NONE);
        for pair in children.windows(2) {
            self.folders[pair[0] as usize].next_sibling = pair[1];
        }
        if let Some(&last) = children.last() {
            self.folders[last as usize].next_sibling = NONE;
        }
        for &child in children {
            self.folders[child as usize].parent = id;
        }
    }

    /// Whether a record made at generation `gen` of `folder` still stands: the folder hasn't been listed again since,
    /// nor freed.
    fn current(&self, folder: u32, gen: u32) -> bool {
        self.folders.get(folder as usize).is_some_and(|f| f.gen == gen && f.status != Status::Free)
    }

    pub fn is_live(&self, id: u32) -> bool {
        self.folders.get(id as usize).is_some_and(|f| f.status != Status::Free && (f.parent != NONE || id == ROOT))
    }

    /// Whether the folder is in the tree: every folder above it up to the root is, rather than waiting in limbo.
    pub fn attached(&self, id: u32) -> bool {
        let mut at = id;
        loop {
            if at == ROOT {
                return true;
            }
            match self.folders.get(at as usize) {
                Some(folder) if folder.status != Status::Free && folder.parent != NONE => at = folder.parent,
                _ => return false,
            }
        }
    }

    /// The folder's parent, if it's in the tree.
    pub fn parent(&self, id: u32) -> Option<u32> {
        self.folders.get(id as usize).map(|f| f.parent).filter(|&p| p != NONE)
    }

    /// The folder's absolute path.
    pub fn path(&self, id: u32) -> String {
        let mut names = Vec::new();
        let mut at = id;
        while at != ROOT && at != NONE {
            names.push(self.name(at));
            at = self.folders[at as usize].parent;
        }
        let mut path = self.root.clone();
        for name in names.iter().rev() {
            if !path.ends_with('/') {
                path.push('/');
            }
            path.push_str(name);
        }
        path
    }

    /// Whether `id` is `ancestor` or inside it.
    fn within(&self, mut id: u32, ancestor: u32) -> bool {
        loop {
            if id == ancestor {
                return true;
            }
            if id == ROOT || id == NONE {
                return false;
            }
            id = self.folders[id as usize].parent;
        }
    }

    /// The deepest folder the index has on `path`, and whether it's the folder at `path` itself. None when `path` is
    /// outside the indexed folder.
    pub fn find(&self, path: &str) -> Option<(u32, bool)> {
        let rest = if self.root == "/" {
            path.strip_prefix('/')?
        } else {
            let rest = path.strip_prefix(self.root.as_str())?;
            if rest.is_empty() {
                ""
            } else {
                rest.strip_prefix('/')?
            }
        };
        let mut at = ROOT;
        for component in rest.split('/').filter(|c| !c.is_empty()) {
            match self.child_named(at, component) {
                Some(child) => at = child,
                None => return Some((at, false)),
            }
        }
        Some((at, true))
    }

    /// The child folder called `name`. APFS usually ignores case, and FSEvents can spell a path as it was opened
    /// rather than as it's stored, so a name that matches only without case still finds its folder.
    fn child_named(&self, id: u32, name: &str) -> Option<u32> {
        self.children(id).find(|&c| self.name(c) == name).or_else(|| {
            let lower = name.to_lowercase();
            self.children(id).find(|&c| self.name(c).to_lowercase() == lower)
        })
    }

    // ---- totals ---------------------------------------------------------------------------------------------------

    /// What the folder's own files hold: its totals less its subfolders'.
    fn own(&self, id: u32) -> Totals {
        let mut below = Totals::default();
        for child in self.children(id) {
            below.add(&Totals::of(&self.folders[child as usize]));
        }
        Totals::of(&self.folders[id as usize]).less(&below).0
    }

    /// Adds `plus` and takes `minus` from `from` and every folder above it.
    fn change(&mut self, from: u32, plus: &Totals, minus: &Totals) {
        if plus == minus {
            return;
        }
        let mut at = from;
        while at != NONE {
            let mut totals = Totals::of(&self.folders[at as usize]);
            totals.add(plus);
            let (totals, short) = totals.less(minus);
            if short {
                self.inconsistencies += 1;
            }
            let folder = &mut self.folders[at as usize];
            folder.size = totals.size;
            folder.clones = totals.clones;
            folder.files = u32::try_from(totals.files).unwrap_or(u32::MAX);
            folder.clone_files = u32::try_from(totals.clone_files).unwrap_or(u32::MAX);
            folder.kinds = totals.kinds.map(|blocks| u32::try_from(blocks).unwrap_or(u32::MAX));
            at = folder.parent;
        }
    }

    fn set_status(&mut self, id: u32, status: Status) {
        let folder = &mut self.folders[id as usize];
        if folder.status == Status::Listed {
            self.listed -= 1;
        }
        if status == Status::Listed {
            self.listed += 1;
        }
        folder.status = status;
    }

    // ---- listings -------------------------------------------------------------------------------------------------

    /// Applies a fresh listing of folder `id`, found at `path`. With `deep`, every subfolder is listed again too.
    /// `walking` is a walk's listing, whose new folders are new rather than possibly moved: keeping each of a whole
    /// disk's 1.2 million in `recent` would hold 66 MB for nothing.
    pub fn apply(&mut self, id: u32, path: &Path, listing: Listing, deep: bool, walking: bool) -> Applied {
        let mut applied = Applied { next: Vec::new(), changed: false, drift: 0, originals: Vec::new(), missing: false };
        if !self.attached(id) {
            return applied;
        }
        if id != ROOT && matches!(listing.outcome, Outcome::Firmlinked) {
            // The startup disk's second path to a folder counted where it's visible.
            let size = self.folders[id as usize].size;
            self.leave_parent(id);
            self.free_subtree(id);
            applied.changed = true;
            applied.drift = size;
            return applied;
        }
        if id != ROOT && matches!(listing.outcome, Outcome::Missing) {
            // Gone from its path, or the path changed because a folder above it moved: only its parent's listing can
            // tell, and that listing decides whether it stays. Nothing changes until then.
            applied.missing = true;
            return applied;
        }
        let before = self.own(id);
        let status_before = self.folders[id as usize].status;
        // Every record made at the last listing stops counting; what's still here is recorded again.
        self.folders[id as usize].gen = self.folders[id as usize].gen.wrapping_add(1);
        let gen = self.folders[id as usize].gen;
        let mut own = Totals::default();
        let mut removed = Totals::default();
        let mut moved_in = Totals::default();

        match listing.outcome {
            Outcome::Missing | Outcome::Firmlinked => {
                // The indexed folder itself is gone.
                removed = self.drop_children(id);
                self.unreadable.insert(id, libc::ENOENT);
                self.volumes.remove(&id);
                self.set_status(id, Status::Unreadable);
                self.clear_contents(id);
            }
            Outcome::Unreadable(errno) => {
                removed = self.drop_children(id);
                self.unreadable.insert(id, errno);
                self.volumes.remove(&id);
                self.set_status(id, Status::Unreadable);
                self.clear_contents(id);
            }
            Outcome::Volume { shares_disk, used, name } => {
                removed = self.drop_children(id);
                own.size = used;
                self.volumes.insert(id, Volume { name, used, shares_disk });
                self.unreadable.remove(&id);
                self.set_status(id, Status::Volume);
                self.clear_contents(id);
                // A volume left unopened keeps the inode its parent's listing gave it.
                if listing.inode != 0 {
                    self.folders[id as usize].inode = listing.inode;
                }
            }
            Outcome::Listed(entries) => {
                let folder = &self.folders[id as usize];
                if folder.inode != 0 && folder.inode != listing.inode {
                    // Another folder now has this path: what the old one held isn't in it.
                    removed.add(&self.drop_children(id));
                }
                self.folders[id as usize].inode = listing.inode;
                self.unreadable.remove(&id);
                self.volumes.remove(&id);
                self.set_status(id, Status::Listed);
                let subfolders = self.count_files(id, gen, entries, &mut own, &mut applied.originals);
                let (gone, arrived) = self.match_subfolders(id, path, subfolders, deep, walking, &mut applied.next);
                removed.add(&gone);
                moved_in.add(&arrived);
            }
        }

        let mut plus = own;
        plus.add(&moved_in);
        let mut minus = before;
        minus.add(&removed);
        self.change(id, &plus, &minus);
        applied.changed = own != before || removed != Totals::default() || moved_in != Totals::default()
            || self.folders[id as usize].status != status_before;
        applied.drift = own.size.abs_diff(before.size) + removed.size + moved_in.size;
        applied
    }

    /// Counts the files in a listing as the folder's own, records its big files, and returns its subfolders.
    fn count_files(&mut self, id: u32, gen: u32, entries: Vec<crate::walk::Entry>, own: &mut Totals, originals: &mut Vec<u64>) -> Vec<(String, u64)> {
        // The two lowest inodes of each clone group here: the only copy here that can hold the group, and the next.
        #[allow(clippy::type_complexity)]
        let mut lowest: HashMap<u64, ((u64, u64, u8), Option<(u64, u64, u8)>)> = HashMap::new();
        for entry in &entries {
            if entry.error != 0 || !entry.is_file {
                continue;
            }
            // A hard link counted at another link takes no part, as in the walk, which skips it before its clone group.
            if entry.nlink > 1 && self.links.get(&entry.inode).is_some_and(|l| l.folder != id && self.current(l.folder, l.gen)) {
                continue;
            }
            if let Some(group) = entry.clone_group() {
                let copy = (entry.inode, entry.size, kind_of(&entry.name) as u8);
                lowest
                    .entry(group)
                    .and_modify(|(low, next)| {
                        if copy.0 == low.0 {
                            // A second link to the same file.
                        } else if copy.0 < low.0 {
                            *next = Some(*low);
                            *low = copy;
                        } else if next.is_none_or(|n| copy.0 < n.0) {
                            *next = Some(copy);
                        }
                    })
                    .or_insert((copy, None));
            }
        }
        let mut held: HashMap<u64, u64> = HashMap::new();
        for (group, (low, next)) in lowest {
            let here = |c: (u64, u64, u8)| Copy { inode: c.0, size: c.1, folder: id, gen, kind: c.2 };
            let low = here(low);
            let next = next.map(here);
            let record = self.holders.get(&group).copied();
            let standing = record.map(|r| r.holder).filter(|h| self.current(h.folder, h.gen));
            let runner = record.and_then(|r| r.runner).filter(|r| self.current(r.folder, r.gen));
            let entry = match standing {
                // An older copy holds the bytes elsewhere: every copy here counts none.
                Some(holder) if holder.inode < low.inode => Holder { holder, runner: lowest_of(runner, Some(low)) },
                Some(holder) => {
                    // A copy made earlier than the one counted, or the counted copy itself, moved here from a folder
                    // not yet listed again: the group's bytes move here from the holder's folder.
                    self.give_up(&holder);
                    held.insert(group, low.inode);
                    let gave = (holder.inode != low.inode).then_some(holder);
                    Holder { holder: low, runner: lowest_of(lowest_of(runner, gave), next) }
                }
                None => {
                    // A clone ID is usually the inode of the file the clones were made from (walk.rs). It isn't for a
                    // file with hard links, whose data stream has an ID of its own: such a source isn't found, and
                    // counts in full beside this copy until its own folder is listed again, at the latest by the
                    // daily check.
                    if low.inode != group {
                        originals.push(group);
                    }
                    match runner {
                        // The holder went, and a copy found elsewhere is older than any here: it takes the bytes.
                        Some(older) if older.inode < low.inode => {
                            self.take_up(&older);
                            Holder { holder: older, runner: Some(low) }
                        }
                        _ => {
                            held.insert(group, low.inode);
                            Holder { holder: low, runner: lowest_of(runner, next) }
                        }
                    }
                }
            };
            self.holders.insert(group, entry);
        }

        let mut subfolders = Vec::new();
        let mut big = Vec::new();
        let mut cloud = Cloud::default();
        let mut errors = 0u32;
        for entry in entries {
            if entry.error != 0 {
                // One entry macOS wouldn't describe; the rest of the folder still counts.
                errors += 1;
                continue;
            }
            let dataless = entry.flags & SF_DATALESS != 0;
            if entry.is_dir {
                if dataless {
                    // Listing it would make macOS fetch its contents from the cloud.
                    cloud.folders += 1;
                } else {
                    subfolders.push((entry.name, entry.inode));
                }
                continue;
            }
            if !entry.is_file {
                continue;
            }
            if entry.nlink > 1 {
                match self.links.get(&entry.inode) {
                    // Counted at another link, or at an earlier one in this listing.
                    Some(link) if self.current(link.folder, link.gen) => continue,
                    _ => {
                        self.links.insert(entry.inode, Link { folder: id, gen });
                    }
                }
            }
            if dataless {
                cloud.files += 1;
                cloud.bytes += entry.length;
            }
            let group = entry.clone_group();
            let holds = group.is_none_or(|group| held.get(&group) == Some(&entry.inode));
            if holds {
                own.size += entry.size;
                own.kinds[kind_of(&entry.name)] += blocks(entry.size);
            } else {
                own.clones += entry.size;
                own.clone_files += 1;
            }
            own.files += 1;
            if entry.size >= self.big_file {
                big.push(BigFile { name: entry.name.into_boxed_str(), size: entry.size, inode: entry.inode, group: group.unwrap_or(0) });
            }
        }
        if big.is_empty() {
            self.big.remove(&id);
        } else {
            self.big.insert(id, big);
        }
        if cloud.is_empty() {
            self.cloud.remove(&id);
        } else {
            self.cloud.insert(id, cloud);
        }
        if errors == 0 {
            self.entry_errors.remove(&id);
        } else {
            self.entry_errors.insert(id, errors);
        }
        subfolders
    }

    /// Matches a listing's subfolders with the folder's children: the same name and inode stay, a folder that left
    /// for limbo earlier comes back by inode, and the rest are new. Returns what left and what came back.
    fn match_subfolders(&mut self, id: u32, path: &Path, subfolders: Vec<(String, u64)>, deep: bool, walking: bool, next: &mut Vec<(u32, PathBuf)>) -> (Totals, Totals) {
        let mut existing: HashMap<String, u32> = self.children(id).map(|child| (self.name(child).to_string(), child)).collect();
        let mut kept = Vec::with_capacity(subfolders.len());
        let mut gone = Totals::default();
        let mut arrived = Totals::default();
        let mut leaving = Vec::new();
        let mut new = Vec::new();
        let holds_firmlinks = self.firmlink_parents.contains(path);
        for (name, inode) in subfolders {
            let child_path = path.join(&name);
            // A firmlinked folder is known by its data volume's inode, as its own listing gives it, however its parent
            // lists it. Taken for two folders, each listing of `/` replaced /Users and the others with empty copies to
            // walk again: 820 GB on the development Mac, and at every daily check.
            let inode = if holds_firmlinks { self.firmlink_inodes.get(&child_path).copied().unwrap_or(inode) } else { inode };
            if self.firmlinks.get(&inode).is_some_and(|visible| *visible != child_path) {
                // The startup disk's second path to a folder counted where it's visible.
                continue;
            }
            match existing.remove(&name) {
                Some(child) if self.folders[child as usize].inode == inode => {
                    if deep {
                        next.push((child, child_path));
                    }
                    kept.push(child);
                }
                Some(child) => {
                    leaving.push(child);
                    new.push((name, inode, child_path));
                }
                None => new.push((name, inode, child_path)),
            }
        }
        leaving.extend(existing.into_values());
        for child in leaving {
            gone.add(&Totals::of(&self.folders[child as usize]));
            self.folders[child as usize].parent = NONE;
            self.park(child);
        }
        for (name, inode, child_path) in new {
            if let Some(back) = self.limbo.remove(&inode) {
                // A folder that moved here: its totals and everything inside it come along unchanged.
                self.rename(back.folder, &name);
                arrived.add(&Totals::of(&self.folders[back.folder as usize]));
                if deep {
                    next.push((back.folder, child_path));
                }
                kept.push(back.folder);
            } else {
                let child = self.allocate(&name, inode, id);
                if inode != 0 && !walking {
                    self.recent.insert(inode, Limbo { folder: child, since: Instant::now() });
                }
                next.push((child, child_path));
                kept.push(child);
            }
        }
        self.relink(id, &kept);
        (gone, arrived)
    }

    /// A copy stops holding its group's bytes: its folder counts them as a clone's.
    fn give_up(&mut self, copy: &Copy) {
        let mut gave = Totals { size: copy.size, ..Totals::default() };
        gave.kinds[usize::from(copy.kind)] = blocks(copy.size);
        let took = Totals { clones: copy.size, clone_files: 1, ..Totals::default() };
        self.change(copy.folder, &took, &gave);
    }

    /// A copy that counted none starts holding its group's bytes.
    fn take_up(&mut self, copy: &Copy) {
        let mut took = Totals { size: copy.size, ..Totals::default() };
        took.kinds[usize::from(copy.kind)] = blocks(copy.size);
        let gave = Totals { clones: copy.size, clone_files: 1, ..Totals::default() };
        self.change(copy.folder, &took, &gave);
    }

    /// Hands each clone group whose holder went to its runner-up, as when a folder of copies is kept and its originals
    /// deleted. Groups with neither left are forgotten until a listing finds a copy.
    pub fn repair(&mut self) {
        let lost: Vec<(u64, Holder)> = self.holders.iter().filter(|(_, r)| !self.current(r.holder.folder, r.holder.gen)).map(|(&g, &r)| (g, r)).collect();
        for (group, record) in lost {
            match record.runner.filter(|r| self.current(r.folder, r.gen)) {
                Some(runner) => {
                    self.take_up(&runner);
                    self.holders.insert(group, Holder { holder: runner, runner: None });
                }
                None => {
                    self.holders.remove(&group);
                }
            }
        }
    }

    /// Takes every subfolder out of the folder, into limbo, and returns their totals.
    fn drop_children(&mut self, id: u32) -> Totals {
        let children: Vec<u32> = self.children(id).collect();
        let mut gone = Totals::default();
        for child in children {
            gone.add(&Totals::of(&self.folders[child as usize]));
            self.folders[child as usize].parent = NONE;
            self.park(child);
        }
        self.folders[id as usize].first_child = NONE;
        gone
    }

    /// Forgets what a folder that can't be listed now held directly.
    fn clear_contents(&mut self, id: u32) {
        self.big.remove(&id);
        self.cloud.remove(&id);
        self.entry_errors.remove(&id);
    }

    /// Takes a folder out of its parent's children, and its totals out of every folder above.
    fn leave_parent(&mut self, id: u32) {
        let parent = self.folders[id as usize].parent;
        if parent == NONE {
            return;
        }
        let siblings: Vec<u32> = self.children(parent).filter(|&c| c != id).collect();
        self.relink(parent, &siblings);
        let totals = Totals::of(&self.folders[id as usize]);
        self.change(parent, &Totals::default(), &totals);
        self.folders[id as usize].parent = NONE;
    }

    fn park(&mut self, id: u32) {
        let inode = self.folders[id as usize].inode;
        if inode == 0 {
            self.free_subtree(id);
            return;
        }
        if let Some(moved) = self.recent.get(&inode).map(|r| r.folder).filter(|&f| f != id && self.attached(f)) {
            // Its new place was listed first, as a new folder: the old copy goes, and the new one is listed again.
            self.free_subtree(id);
            self.rescans.push(moved);
            return;
        }
        if let Some(earlier) = self.limbo.insert(inode, Limbo { folder: id, since: Instant::now() }) {
            if earlier.folder != id {
                self.free_subtree(earlier.folder);
            }
        }
    }

    /// Folders to list again in full: see `recent`.
    pub fn take_rescans(&mut self) -> Vec<u32> {
        std::mem::take(&mut self.rescans)
    }

    /// Frees a folder and everything beneath it. Clone holders and hard links recorded in them stop counting, since
    /// their folders' generations move on.
    fn free_subtree(&mut self, id: u32) {
        let mut stack = vec![id];
        while let Some(at) = stack.pop() {
            stack.extend(self.children(at));
            self.big.remove(&at);
            self.cloud.remove(&at);
            self.entry_errors.remove(&at);
            self.unreadable.remove(&at);
            self.volumes.remove(&at);
            self.set_status(at, Status::Free);
            let folder = &mut self.folders[at as usize];
            folder.gen = folder.gen.wrapping_add(1);
            folder.first_child = NONE;
            folder.next_sibling = NONE;
            folder.parent = NONE;
            self.garbage += usize::from(folder.name_len);
            self.quarantine.push(at);
        }
    }

    /// Frees folders that have been in limbo longer than `grace`, and makes freed slots reusable when no listing is in
    /// flight. Compacts the names once most of their bytes are unused.
    pub fn settle(&mut self, grace: Duration, idle: bool) {
        let now = Instant::now();
        let expired: Vec<u64> = self.limbo.iter().filter(|(_, l)| now.duration_since(l.since) >= grace).map(|(&inode, _)| inode).collect();
        for inode in expired {
            if let Some(limbo) = self.limbo.remove(&inode) {
                self.free_subtree(limbo.folder);
            }
        }
        self.recent.retain(|_, r| now.duration_since(r.since) < grace);
        if idle {
            self.free.append(&mut self.quarantine);
            if self.garbage > self.names.len() / 2 && self.garbage > 1 << 20 {
                self.compact_names();
            }
        }
    }

    /// Gives back the room the index's tables grew into while it was built: a walk doubles each table as it fills,
    /// which left the development Mac's folder table with nearly twice the slots it uses. Then hands memory freed by
    /// the walk's listings back to macOS.
    pub fn compact(&mut self) {
        self.purge();
        self.folders.shrink_to_fit();
        self.free.shrink_to_fit();
        self.names.shrink_to_fit();
        self.holders.shrink_to_fit();
        self.links.shrink_to_fit();
        self.big.shrink_to_fit();
        self.recent.shrink_to_fit();
        self.limbo.shrink_to_fit();
        crate::system::return_free_memory();
    }

    /// Drops clone holders and hard links whose folders have been listed again or freed since they were recorded,
    /// once each clone group whose holder went has been handed to its runner-up: dropped first, a group would count
    /// nowhere until the runner-up's folder was listed again.
    pub fn purge(&mut self) {
        self.repair();
        let folders = &self.folders;
        let current = |folder: u32, gen: u32| folders.get(folder as usize).is_some_and(|f| f.gen == gen && f.status != Status::Free);
        self.holders.retain(|_, h| current(h.holder.folder, h.holder.gen));
        for record in self.holders.values_mut() {
            record.runner = record.runner.filter(|r| current(r.folder, r.gen));
        }
        self.links.retain(|_, l| current(l.folder, l.gen));
    }

    fn compact_names(&mut self) {
        let mut names = Vec::with_capacity(self.names.len() - self.garbage);
        for folder in self.folders.iter_mut().filter(|f| f.status != Status::Free) {
            let at = folder.name_at as usize;
            let bytes = &self.names[at..at + usize::from(folder.name_len)];
            folder.name_at = names.len() as u32;
            names.extend_from_slice(bytes);
        }
        self.names = names;
        self.garbage = 0;
    }

    // ---- the map --------------------------------------------------------------------------------------------------

    /// The bytes a big file counts for: none when another copy of its clone group holds them.
    fn counted(&self, file: &BigFile) -> u64 {
        if file.group == 0 {
            return file.size;
        }
        match self.holders.get(&file.group).map(|r| r.holder) {
            Some(holder) if self.current(holder.folder, holder.gen) && holder.inode == file.inode => file.size,
            _ => 0,
        }
    }

    /// The map of the folder at `path`, as the `scan` command's result line: its tree pruned to 1/20,000 of its size,
    /// with `focus` and the folders inside it pruned to 1/20,000 of the focus's size, so the open folder shows its
    /// detail. Err when the index has no folder at `path`.
    pub fn result(&self, path: &str, focus: Option<&str>) -> Result<String, String> {
        let (id, exact) = self.find(path).ok_or_else(|| format!("{path} is outside the map of {}.", self.root))?;
        if !exact {
            return Err(format!("The map has no folder at {path}."));
        }
        let focus = focus.and_then(|f| self.find(f)).filter(|&(f, exact)| exact && f != id && self.within(f, id)).map(|(f, _)| f);
        let folder = &self.folders[id as usize];
        let prune = PruneConfig::from_total(folder.size);
        let focus = focus.map(|f| (f, PruneConfig::from_total(self.folders[f as usize].size).min_bytes));
        let mut on_path = Vec::new();
        if let Some((f, _)) = focus {
            let mut at = f;
            while at != id {
                on_path.push(at);
                at = self.folders[at as usize].parent;
            }
        }
        let shape = Shape { focus, on_path: &on_path };
        let root_path = self.path(id);
        let mut tree = self.tree(id, root_path.clone(), &shape, prune.min_bytes);
        if id == ROOT || tree.name.is_empty() {
            tree.name = Path::new(&root_path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| root_path.clone());
        }
        let top = self.top_files(id);
        let volumes = self.volume_entries(id);
        let unreadable = self.unreadable_folders(id);
        let summary = self.summary(id);
        let result = output::Result {
            kind: "result",
            version: output::RESULT_VERSION,
            root: tree,
            top_files: &top,
            volumes: &volumes,
            unreadable_folders: &unreadable,
            summary,
        };
        serde_json::to_string(&result).map_err(|e| format!("The map couldn't be written out: {e}."))
    }

    /// What the index holds at each of `paths`, the known places Pith names beside the map, such as Mail or Developer:
    /// a folder's size, the figure its map shows, or none when the map can't read it. It can't when its listing failed,
    /// when the folder waits on macOS's question about Pith (`asking`), or when a folder above it did either, so the map
    /// can't tell whether it's there. A path its listed parent doesn't have isn't there, and gives nothing; so does a
    /// path outside the index, or one found but waiting its turn to be listed.
    pub fn places(&self, paths: &[String], asking: &dyn Fn(u32) -> bool) -> Vec<Place> {
        paths
            .iter()
            .filter_map(|path| {
                let (id, exact) = self.find(path)?;
                let size = match self.folders[id as usize].status {
                    Status::Listed | Status::Volume if exact => Some(self.folders[id as usize].size),
                    Status::Unreadable => None,
                    Status::Pending if asking(id) => None,
                    _ => return None,
                };
                Some(Place { path: path.clone(), size })
            })
            .collect()
    }

    fn tree(&self, id: u32, path: String, shape: &Shape<'_>, min: u64) -> TreeNode {
        let folder = &self.folders[id as usize];
        let name = self.name(id).to_string();
        match folder.status {
            Status::Unreadable => {
                let reason = UnreadableReason::of(self.unreadable.get(&id).copied().unwrap_or(0));
                return TreeNode { reason: Some(reason), ..leaf(name, path, 0, NodeKind::Unreadable) };
            }
            Status::Volume => {
                let shares = self.volumes.get(&id).is_some_and(|v| v.shares_disk);
                return TreeNode { shares_disk: Some(shares), ..leaf(name, path, folder.size, NodeKind::Volume) };
            }
            Status::Pending | Status::Listed | Status::Free => {}
        }
        let totals = Totals::of(folder);
        let mut below = Totals::default();
        let mut children = Vec::new();
        let mut shown = Totals::default();
        let mut folded = Totals::default();
        let mut unreadable = 0;
        for child in self.children(id) {
            let c = &self.folders[child as usize];
            let child_totals = Totals::of(c);
            below.add(&child_totals);
            let child_min = match shape.focus {
                Some((focus, focus_min)) if focus == child => focus_min,
                _ => min,
            };
            let child_path = || join(&path, self.name(child));
            match c.status {
                Status::Unreadable => {
                    // Unknown size, so never folded by size: the map lists them, up to a bound.
                    if unreadable < UNREADABLE_PER_DIR {
                        unreadable += 1;
                        children.push(self.tree(child, child_path(), shape, child_min));
                    }
                }
                // Few, and each says where the map stops, so a volume stays visible even when small.
                Status::Volume => {
                    shown.add(&child_totals);
                    children.push(self.tree(child, child_path(), shape, child_min));
                }
                _ if c.size >= min || shape.on_path.contains(&child) || shape.focus.is_some_and(|(f, _)| f == child) => {
                    shown.add(&child_totals);
                    children.push(self.tree(child, child_path(), shape, child_min));
                }
                _ => folded.add(&child_totals),
            }
        }
        let (own, _) = totals.less(&below);
        // The folder's big files that count on their own.
        let mut shown_files = 0u64;
        let mut shown_file_bytes = 0u64;
        let mut shown_file_kinds = KindBytes::default();
        if let Some(files) = self.big.get(&id) {
            for file in files {
                let size = self.counted(file);
                if size >= min && size > 0 {
                    shown_files += 1;
                    shown_file_bytes += size;
                    shown_file_kinds.0[kind_of(&file.name)] += blocks(size) * BLOCK;
                    children.push(leaf(file.name.to_string(), join(&path, &file.name), size, NodeKind::File));
                }
            }
        }
        // Everything not shown on its own: the folder's other files and the folders folded into the group.
        let other = own.size.saturating_sub(shown_file_bytes) + folded.size;
        let files = totals.files.saturating_sub(shown.files).saturating_sub(shown_files);
        if other > 0 || files > 0 {
            let mut kinds = totals.kind_bytes();
            kinds.subtract(&shown.kind_bytes());
            kinds.subtract(&shown_file_kinds);
            let clones = own.clones + folded.clones;
            children.push(TreeNode {
                files: Some(files),
                kinds: Some(kinds),
                clones: some(clones),
                ..leaf("(smaller items)".to_string(), format!("{path}/__other__"), other, NodeKind::Aggregate)
            });
        }
        children.sort_unstable_by(|a, b| b.size.cmp(&a.size));
        TreeNode { children, files: Some(totals.files), clones: some(totals.clones), ..leaf(name, path, totals.size, NodeKind::Dir) }
    }

    /// The largest files at or inside folder `id` that count on their own, largest first.
    fn top_files(&self, id: u32) -> Vec<FileEntry> {
        let mut heap: BinaryHeap<std::cmp::Reverse<(u64, u32, usize)>> = BinaryHeap::new();
        for (&folder, files) in &self.big {
            if !self.is_live(folder) || !self.within(folder, id) {
                continue;
            }
            for (i, file) in files.iter().enumerate() {
                let size = self.counted(file);
                if size == 0 {
                    continue;
                }
                if heap.len() < TOP_FILES {
                    heap.push(std::cmp::Reverse((size, folder, i)));
                } else if heap.peek().is_some_and(|smallest| size > smallest.0 .0) {
                    heap.pop();
                    heap.push(std::cmp::Reverse((size, folder, i)));
                }
            }
        }
        let mut top: Vec<(u64, u32, usize)> = heap.into_iter().map(|r| r.0).collect();
        top.sort_unstable_by(|a, b| b.0.cmp(&a.0));
        top.into_iter()
            .map(|(size, folder, i)| {
                let file = &self.big[&folder][i];
                FileEntry { name: file.name.to_string(), path: join(&self.path(folder), &file.name), size, clone: None }
            })
            .collect()
    }

    fn volume_entries(&self, id: u32) -> Vec<VolumeEntry> {
        let mut volumes: Vec<VolumeEntry> = self
            .volumes
            .iter()
            .filter(|(&folder, _)| folder != id && self.is_live(folder) && self.within(folder, id))
            .map(|(&folder, v)| VolumeEntry { path: self.path(folder), name: v.name.clone(), bytes: if v.shares_disk { v.used } else { 0 }, shares_disk: v.shares_disk })
            .collect();
        volumes.sort_by(|a, b| a.path.cmp(&b.path));
        volumes
    }

    fn unreadable_folders(&self, id: u32) -> Vec<UnreadableFolder> {
        let mut folders: Vec<UnreadableFolder> = self
            .unreadable
            .iter()
            .filter(|(&folder, _)| self.is_live(folder) && self.within(folder, id))
            .map(|(&folder, &errno)| UnreadableFolder { path: self.path(folder), reason: UnreadableReason::of(errno) })
            .collect();
        folders.sort_by(|a, b| a.path.matches('/').count().cmp(&b.path.matches('/').count()).then_with(|| a.path.cmp(&b.path)));
        folders.truncate(UNREADABLE_LISTED);
        folders
    }

    fn summary(&self, id: u32) -> Summary {
        let folder = &self.folders[id as usize];
        let inside = |folder: u32| self.is_live(folder) && self.within(folder, id);
        let mut unreadable = Unreadable { protected: 0, denied: 0, other: 0 };
        for (&at, &errno) in &self.unreadable {
            if inside(at) {
                match UnreadableReason::of(errno) {
                    UnreadableReason::Protected => unreadable.protected += 1,
                    UnreadableReason::Denied => unreadable.denied += 1,
                    UnreadableReason::Other => unreadable.other += 1,
                }
            }
        }
        let mut cloud = CloudOnly { files: 0, bytes: 0, folders: 0 };
        for (&at, c) in &self.cloud {
            if inside(at) {
                cloud.files += c.files;
                cloud.bytes += c.bytes;
                cloud.folders += c.folders;
            }
        }
        let entry_errors = self.entry_errors.iter().filter(|(&at, _)| inside(at)).map(|(_, &n)| u64::from(n)).sum();
        let dirs = if id == ROOT { self.listed } else { self.count_listed(id) };
        Summary {
            dirs,
            files: u64::from(folder.files),
            bytes: folder.size,
            errors: unreadable.protected + unreadable.denied + unreadable.other,
            unreadable,
            entry_errors,
            cloud_only: cloud,
            clones: Clones { files: u64::from(folder.clone_files), bytes: folder.clones },
            elapsed_ms: u128::from(self.walk_ms),
            engine: "bulk",
        }
    }

    fn count_listed(&self, id: u32) -> u64 {
        let mut stack = vec![id];
        let mut count = 0;
        while let Some(at) = stack.pop() {
            if self.folders[at as usize].status == Status::Listed {
                count += 1;
            }
            stack.extend(self.children(at));
        }
        count
    }

    // ---- what it holds --------------------------------------------------------------------------------------------

    pub fn folder_count(&self) -> u64 {
        self.listed
    }

    pub fn totals(&self, id: u32) -> Totals {
        Totals::of(&self.folders[id as usize])
    }

    pub fn status(&self, id: u32) -> Status {
        self.folders[id as usize].status
    }

    /// The files the folder keeps by name: name, allocated bytes, inode and clone group.
    pub fn kept_files(&self, id: u32) -> Vec<(String, u64, u64, u64)> {
        self.big.get(&id).map(|files| files.iter().map(|f| (f.name.to_string(), f.size, f.inode, f.group)).collect()).unwrap_or_default()
    }

    /// The clone group's record, for tests: holder and runner-up as inode, folder and whether each still stands.
    pub fn record_of(&self, group: u64) -> String {
        let show = |c: &Copy| format!("ino {} in {} (current {})", c.inode, if self.is_live(c.folder) { self.path(c.folder) } else { format!("slot {}", c.folder) }, self.current(c.folder, c.gen));
        match self.holders.get(&group) {
            Some(r) => format!("holder {}; runner {}", show(&r.holder), r.runner.as_ref().map(show).unwrap_or_else(|| "none".into())),
            None => "no record".into(),
        }
    }

    /// Which copy holds a clone group, where, and whether that record still stands.
    pub fn holder_of(&self, group: u64) -> Option<(u64, String, bool)> {
        self.holders.get(&group).map(|r| r.holder).map(|h| (h.inode, if self.is_live(h.folder) { self.path(h.folder) } else { format!("slot {}", h.folder) }, self.current(h.folder, h.gen)))
    }

    /// The folder's subfolders.
    pub fn child_ids(&self, id: u32) -> Vec<u32> {
        self.children(id).collect()
    }

    /// The names of the folder's subfolders, in no particular order.
    pub fn child_names(&self, id: u32) -> Vec<String> {
        self.children(id).map(|child| self.name(child).to_string()).collect()
    }

    /// The paths of the `count` largest files that count on their own, with the folders holding them, for a check
    /// of files that grow while they're open, which FSEvents reports only once they're closed.
    pub fn largest_files(&self, count: usize) -> Vec<(u32, PathBuf, u64)> {
        let mut all: Vec<(u64, u32, &BigFile)> = self
            .big
            .iter()
            .filter(|(&folder, _)| self.is_live(folder))
            .flat_map(|(&folder, files)| files.iter().map(move |f| (f.size, folder, f)))
            .collect();
        let count = count.min(all.len());
        if count == 0 {
            return Vec::new();
        }
        all.select_nth_unstable_by(count - 1, |a, b| b.0.cmp(&a.0));
        all.truncate(count);
        all.into_iter().map(|(size, folder, file)| (folder, PathBuf::from(join(&self.path(folder), &file.name)), size)).collect()
    }

    /// The volumes mounted inside the map that share its disk, with the space each was found holding. Only their space
    /// counts, and only they may be read again: reading any other could make macOS ask the person about Pith.
    pub fn volume_folders(&self) -> Vec<(u32, PathBuf, u64)> {
        self.volumes.iter().filter(|(&f, v)| v.shares_disk && self.is_live(f)).map(|(&f, v)| (f, PathBuf::from(self.path(f)), v.used)).collect()
    }

    /// The folders the index couldn't read, to try again once Full Disk Access may have been granted.
    pub fn unreadable_ids(&self) -> Vec<(u32, PathBuf)> {
        self.unreadable.keys().filter(|&&f| self.is_live(f)).map(|&f| (f, PathBuf::from(self.path(f)))).collect()
    }

    pub fn stats(&self) -> Stats {
        let big_files: usize = self.big.values().map(Vec::len).sum();
        let big_bytes: usize = self.big.values().flat_map(|files| files.iter().map(|f| f.name.len() + std::mem::size_of::<BigFile>())).sum();
        // Hash tables hold about 8/7 of their entries' size plus a control byte each.
        let table = |entries: usize, size: usize| entries * (size + 1) * 8 / 7;
        let memory = self.folders.capacity() * std::mem::size_of::<Folder>()
            + self.names.capacity()
            + self.holders.memory()
            + table(self.recent.capacity(), 8 + std::mem::size_of::<Limbo>())
            + table(self.limbo.capacity(), 8 + std::mem::size_of::<Limbo>())
            + table(self.links.capacity(), 8 + std::mem::size_of::<Link>())
            + table(self.big.capacity(), 4 + std::mem::size_of::<Vec<BigFile>>())
            + big_bytes;
        Stats {
            folders: self.listed,
            slots: self.folders.len() as u64,
            names: self.names.len() as u64,
            big_files: big_files as u64,
            holders: self.holders.len() as u64,
            links: self.links.len() as u64,
            limbo: self.limbo.len() as u64,
            recent: self.recent.len() as u64,
            inconsistencies: self.inconsistencies,
            memory: memory as u64,
        }
    }

    // ---- snapshots ------------------------------------------------------------------------------------------------

    pub(crate) fn raw_parts(&self) -> (&[Folder], &Groups, &HashMap<u64, Link>) {
        (&self.folders, &self.holders, &self.links)
    }

    /// Rebuilds an index from a snapshot's folders, in an order where each parent comes before its children, with
    /// each folder's own totals: the totals beneath each are summed here.
    pub(crate) fn from_parts(root: &str, parts: Parts) -> Index {
        let mut index = Index::new(root, HashMap::new());
        index.folders = parts.folders;
        index.names = parts.names;
        index.big = parts.big;
        index.unreadable = parts.unreadable;
        index.volumes = parts.volumes;
        index.cloud = parts.cloud;
        index.entry_errors = parts.entry_errors;
        index.holders = parts.holders;
        index.links = parts.links;
        index.walk_ms = parts.walk_ms;
        index.listed = index.folders.iter().filter(|f| f.status == Status::Listed).count() as u64;
        // Children in the snapshot's order, which lists each parent before its children.
        let mut last_child = vec![NONE; index.folders.len()];
        for id in 1..index.folders.len() {
            let parent = index.folders[id].parent as usize;
            match last_child[parent] {
                NONE => index.folders[parent].first_child = id as u32,
                previous => index.folders[previous as usize].next_sibling = id as u32,
            }
            last_child[parent] = id as u32;
        }
        // Each folder's own totals go to its parent, children first: the snapshot lists parents first.
        for id in (1..index.folders.len()).rev() {
            let totals = Totals::of(&index.folders[id]);
            let parent = index.folders[id].parent as usize;
            let mut sum = Totals::of(&index.folders[parent]);
            sum.add(&totals);
            let folder = &mut index.folders[parent];
            folder.size = sum.size;
            folder.clones = sum.clones;
            folder.files = u32::try_from(sum.files).unwrap_or(u32::MAX);
            folder.clone_files = u32::try_from(sum.clone_files).unwrap_or(u32::MAX);
            folder.kinds = sum.kinds.map(|blocks| u32::try_from(blocks).unwrap_or(u32::MAX));
        }
        index
    }

    /// The folder's own totals, for a snapshot, which keeps those rather than the totals beneath each folder.
    pub(crate) fn own_totals(&self, id: u32) -> Totals {
        self.own(id)
    }
}

/// Firmlinks by visible path, with the folders holding them.
fn by_visible_path(firmlinks: &HashMap<u64, PathBuf>) -> (HashMap<PathBuf, u64>, HashSet<PathBuf>) {
    let inodes: HashMap<PathBuf, u64> = firmlinks.iter().map(|(&inode, path)| (path.clone(), inode)).collect();
    let parents = inodes.keys().filter_map(|path| path.parent().map(Path::to_path_buf)).collect();
    (inodes, parents)
}

/// What a snapshot holds, to rebuild an index from.
pub(crate) struct Parts {
    pub(crate) folders: Vec<Folder>,
    pub(crate) names: Vec<u8>,
    pub(crate) big: HashMap<u32, Vec<BigFile>>,
    pub(crate) unreadable: HashMap<u32, i32>,
    pub(crate) volumes: HashMap<u32, Volume>,
    pub(crate) cloud: HashMap<u32, Cloud>,
    pub(crate) entry_errors: HashMap<u32, u32>,
    pub(crate) holders: Groups,
    pub(crate) links: HashMap<u64, Link>,
    pub(crate) walk_ms: u64,
}

impl Folder {
    /// A folder read from a snapshot, holding its own totals until `Index::from_parts` sums them.
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn restored(parent: u32, name_at: u32, name_len: u16, status: Status, inode: u64, own: &Totals) -> Folder {
        Folder {
            parent,
            first_child: NONE,
            next_sibling: NONE,
            gen: 0,
            name_at,
            files: u32::try_from(own.files).unwrap_or(u32::MAX),
            clone_files: u32::try_from(own.clone_files).unwrap_or(u32::MAX),
            name_len,
            status,
            inode,
            size: own.size,
            clones: own.clones,
            kinds: own.kinds.map(|blocks| u32::try_from(blocks).unwrap_or(u32::MAX)),
        }
    }
}

/// A known place's folder as the index holds it (`Index::places`), for Pith's Places beside the map.
#[derive(Debug, PartialEq, Eq, serde::Serialize)]
pub struct Place {
    /// As Pith asked for it.
    pub path: String,
    /// The folder's size as its map shows it, or none when the map can't read it.
    pub size: Option<u64>,
}

/// How the map prunes: folders and files under `min` fold into a group, except on the way to the focus, and inside
/// the focus under its own `min`.
struct Shape<'a> {
    focus: Option<(u32, u64)>,
    on_path: &'a [u32],
}

#[derive(Debug, serde::Serialize)]
pub struct Stats {
    pub folders: u64,
    pub slots: u64,
    pub names: u64,
    #[serde(rename = "bigFiles")]
    pub big_files: u64,
    pub holders: u64,
    pub links: u64,
    pub limbo: u64,
    /// Folders made new lately, kept to tell a move whose new parent was listed first.
    pub recent: u64,
    pub inconsistencies: u64,
    /// What the index's own tables take, estimated from their sizes.
    pub memory: u64,
}

pub(crate) struct Children<'a> {
    index: &'a Index,
    next: u32,
}

impl Iterator for Children<'_> {
    type Item = u32;
    fn next(&mut self) -> Option<u32> {
        if self.next == NONE {
            return None;
        }
        let at = self.next;
        self.next = self.index.folders[at as usize].next_sibling;
        Some(at)
    }
}

/// Makes room in a full table for an eighth more, rather than doubling it as `Vec` would: once compacted, the
/// development Mac's folder table took 107 MB, and doubling for a few new folders would add as much again.
fn grow<T>(table: &mut Vec<T>) {
    if table.len() == table.capacity() {
        table.reserve_exact((table.len() / 8).max(4096));
    }
}

/// The copy with the lower inode.
fn lowest_of(a: Option<Copy>, b: Option<Copy>) -> Option<Copy> {
    match (a, b) {
        (Some(a), Some(b)) => Some(if b.inode < a.inode { b } else { a }),
        (a, b) => a.or(b),
    }
}

fn leaf(name: String, path: String, size: u64, kind: NodeKind) -> TreeNode {
    TreeNode { name, path, size, kind, reason: None, shares_disk: None, files: None, kinds: None, clones: None, children: Vec::new() }
}

fn some(bytes: u64) -> Option<u64> {
    (bytes > 0).then_some(bytes)
}

fn join(folder: &str, name: &str) -> String {
    if folder.ends_with('/') {
        format!("{folder}{name}")
    } else {
        format!("{folder}/{name}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_folder_stays_small() {
        // 1.19 million folders on the development Mac: every byte here is about a megabyte of the index.
        assert!(std::mem::size_of::<Folder>() <= 88, "Folder grew to {} bytes", std::mem::size_of::<Folder>());
    }

    fn folder(name: &str, inode: u64) -> crate::walk::Entry {
        crate::walk::Entry { name: name.into(), is_dir: true, is_file: false, inode, nlink: 1, size: 0, length: 0, flags: 0, error: 0, clone_id: 0, clone_refs: 0, ext_flags: 0, private: None }
    }

    fn file(name: &str, inode: u64, size: u64) -> crate::walk::Entry {
        crate::walk::Entry { is_dir: false, is_file: true, size, length: size, ..folder(name, inode) }
    }

    /// Review of the map after a launch's catch-up: listing `/` again set /Users, /Applications, /Library and /private
    /// aside as replaced, since `/` lists each by the system volume's inode, and walked them again from nothing.
    #[test]
    fn a_firmlinked_folder_stays_itself_when_its_parent_lists_it_again() {
        // "/x/Users" is firmlinked: "/x" lists it by inode 900, its own listing gives 14490.
        let mut index = Index::new("/x", HashMap::from([(14490, PathBuf::from("/x/Users"))]));
        let root = || crate::listing::Listing { inode: 2, outcome: crate::listing::Outcome::Listed(vec![folder("Users", 900), folder("bin", 901)]) };
        index.apply(ROOT, Path::new("/x"), root(), false, true);
        let (users, exact) = index.find("/x/Users").unwrap();
        assert!(exact);
        let home = crate::listing::Listing { inode: 14490, outcome: crate::listing::Outcome::Listed(vec![file("big.mov", 50, 5_000_000_000)]) };
        index.apply(users, Path::new("/x/Users"), home, false, true);
        assert_eq!(index.totals(ROOT).size, 5_000_000_000);
        // Listed again, as when something at the top changes, FSEvents asks for a rescan, or the daily check comes by.
        let applied = index.apply(ROOT, Path::new("/x"), root(), true, false);
        assert_eq!(index.find("/x/Users"), Some((users, true)));
        assert_eq!(index.totals(ROOT).size, 5_000_000_000);
        assert!(applied.next.iter().any(|(id, _)| *id == users), "a deep listing goes on to the same folder");
        assert!(index.limbo.is_empty(), "nothing was set aside");
    }

    #[test]
    fn totals_never_go_below_zero() {
        let mut index = Index::new("/x", HashMap::new());
        index.change(ROOT, &Totals::default(), &Totals { size: 5, ..Totals::default() });
        assert_eq!(index.inconsistencies, 1);
        assert_eq!(index.totals(ROOT).size, 0);
    }

    /// Lists the folder at `path`, which its parent's listing gave `inode`, as holding `entries`.
    fn list(index: &mut Index, path: &str, inode: u64, entries: Vec<crate::walk::Entry>) {
        let (id, exact) = index.find(path).unwrap();
        assert!(exact, "the index has no {path}");
        index.apply(id, Path::new(path), crate::listing::Listing { inode, outcome: crate::listing::Outcome::Listed(entries) }, false, true);
    }

    /// The folder at `path` couldn't be read: macOS kept Pith out.
    fn unreadable(index: &mut Index, path: &str) {
        let id = index.find(path).unwrap().0;
        index.apply(id, Path::new(path), crate::listing::Listing { inode: 0, outcome: crate::listing::Outcome::Unreadable(libc::EPERM) }, false, true);
    }

    /// A home folder's places in every state the map can hold them in.
    fn home() -> Index {
        let mut index = Index::new("/x", HashMap::new());
        list(&mut index, "/x", 2, vec![folder("Users", 3)]);
        list(&mut index, "/x/Users", 3, vec![folder("me", 4)]);
        list(&mut index, "/x/Users/me", 4, vec![folder("Library", 5), folder("Pictures", 6), folder("Downloads", 7)]);
        let library = vec![folder("Mail", 8), folder("Developer", 9), folder("Mobile Documents", 10), folder("Application Support", 11), folder("Messages", 12)];
        list(&mut index, "/x/Users/me/Library", 5, library);
        list(&mut index, "/x/Users/me/Pictures", 6, vec![file("Holiday.heic", 60, 3_000_000)]);
        list(&mut index, "/x/Users/me/Downloads", 7, vec![file("Installer.dmg", 61, 2_000_000_000)]);
        unreadable(&mut index, "/x/Users/me/Library/Mail");
        list(&mut index, "/x/Users/me/Library/Developer", 9, vec![file("Simulator.dmg", 62, 5_000_000_000), file("notes.txt", 63, 4096)]);
        list(&mut index, "/x/Users/me/Library/Application Support", 11, vec![folder("MobileSync", 13)]);
        unreadable(&mut index, "/x/Users/me/Library/Application Support/MobileSync");
        // Mobile Documents and Messages are found in Library's listing and not listed themselves yet.
        index
    }

    /// What the index holds at each known place's path, from the folders macOS is asking about.
    fn places_of(index: &Index, asking: &[&str]) -> HashMap<String, Option<u64>> {
        let asking: Vec<u32> = asking.iter().map(|path| index.find(path).unwrap().0).collect();
        let paths = [
            "Library/Mail", "Library/Developer", "Library/Mobile Documents", "Library/Mobile Documents/com~apple~CloudDocs", "Library/Messages",
            "Library/Messages/Archive", "Library/Application Support/MobileSync/Backup", "Pictures/Photos Library.photoslibrary", "Downloads",
        ]
        .map(|path| format!("/x/Users/me/{path}"));
        let mut places: Vec<String> = paths.to_vec();
        places.push("/elsewhere/Applications".into());
        let found = index.places(&places, &|id| asking.contains(&id));
        assert!(found.iter().all(|place| places.contains(&place.path)), "it names only the places asked about");
        found.into_iter().map(|place| (place.path.trim_start_matches("/x/Users/me/").to_string(), place.size)).collect()
    }

    #[test]
    fn a_place_has_the_size_the_map_shows_or_none_when_the_map_cant_read_it() {
        let index = home();
        let places = places_of(&index, &["/x/Users/me/Library/Mobile Documents"]);
        assert_eq!(places.get("Library/Developer"), Some(&Some(5_000_004_096)), "a folder the map has listed");
        assert_eq!(places.get("Downloads"), Some(&Some(2_000_000_000)));
        assert_eq!(places.get("Library/Mail"), Some(&None), "a folder macOS keeps Pith out of");
        assert_eq!(places.get("Library/Mobile Documents"), Some(&None), "a folder waiting on macOS's question");
        assert_eq!(places.get("Library/Mobile Documents/com~apple~CloudDocs"), Some(&None), "inside one waiting on macOS");
        assert_eq!(places.get("Library/Application Support/MobileSync/Backup"), Some(&None), "below a folder the map couldn't read");
        // Nothing is known of these yet, or they aren't there.
        assert_eq!(places.get("Library/Messages"), None, "found, and waiting its turn to be listed");
        assert_eq!(places.get("Library/Messages/Archive"), None, "below one waiting its turn");
        assert_eq!(places.get("Pictures/Photos Library.photoslibrary"), None, "a folder its parent's listing doesn't have");
        assert_eq!(places.get("/elsewhere/Applications"), None, "outside the map");
        assert_eq!(places.len(), 6);
        // Once macOS has answered, a folder that still waits only waits its turn.
        assert_eq!(places_of(&index, &[]).get("Library/Mobile Documents"), None);
    }

    #[test]
    fn a_places_size_equals_the_maps_figure_for_its_folder() {
        let index = home();
        let sized: Vec<(String, u64)> = index
            .places(&["/x/Users/me/Library/Developer".into(), "/x/Users/me/Downloads".into(), "/x/Users/me".into()], &|_| false)
            .into_iter()
            .map(|place| (place.path, place.size.unwrap()))
            .collect();
        assert_eq!(sized.len(), 3);
        fn find<'a>(node: &'a serde_json::Value, path: &str) -> Option<&'a serde_json::Value> {
            if node["path"] == path {
                return Some(node);
            }
            node["children"].as_array()?.iter().find_map(|child| find(child, path))
        }
        // In the map of the whole index, in one focused on the home folder, and in the map of the folder itself.
        for (path, size) in &sized {
            for (map, focus) in [("/x", None), ("/x", Some("/x/Users/me")), (path.as_str(), None)] {
                let result: serde_json::Value = serde_json::from_str(&index.result(map, focus).unwrap()).unwrap();
                let node = find(&result["root"], path).unwrap_or_else(|| panic!("the map of {map} has no {path}"));
                assert_eq!(node["size"].as_u64(), Some(*size), "{path} in the map of {map}, focus {focus:?}");
            }
        }
    }

    #[test]
    fn paths_join_names_under_the_root() {
        let mut index = Index::new("/", HashMap::new());
        let users = index.allocate("Users", 1, ROOT);
        let me = index.allocate("me", 2, users);
        index.relink(ROOT, &[users]);
        index.relink(users, &[me]);
        assert_eq!(index.path(me), "/Users/me");
        assert_eq!(index.find("/Users/me"), Some((me, true)));
        assert_eq!(index.find("/Users/me/new/deeper"), Some((me, false)));
        assert_eq!(index.find("/users/ME"), Some((me, true)));
        let mut sub = Index::new("/tmp/x", HashMap::new());
        let a = sub.allocate("a", 1, ROOT);
        sub.relink(ROOT, &[a]);
        assert_eq!(sub.path(a), "/tmp/x/a");
        assert_eq!(sub.find("/tmp/x"), Some((ROOT, true)));
        assert_eq!(sub.find("/tmp/xy"), None);
        assert_eq!(sub.find("/tmp/x/a/b"), Some((a, false)));
    }
}
