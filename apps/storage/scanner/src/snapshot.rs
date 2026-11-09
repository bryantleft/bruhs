//! The index kept on disk, so the next launch opens on it and lists again only what FSEvents saw change since.
//!
//! One file: a header, then every folder parents first with its own totals, then the side tables, all as
//! variable-length integers, compressed with LZFSE in 4 MiB frames and closed by a hash of everything before it.
//! A file that's cut short, damaged or from another format is refused whole, and the map is walked again.

use std::collections::HashMap;
use std::fs::File;
use std::io::{self, BufReader, BufWriter, Read, Write};
use std::path::Path;

use crate::index::{BigFile, Cloud, Copy, Folder, Groups, Holder, Index, Link, Parts, Status, Totals, Volume, NONE, ROOT};
use crate::kinds::KIND_COUNT;

const MAGIC: &[u8; 8] = b"PITHIDX\0";
/// Bump whenever what's written changes.
const FORMAT: u32 = 1;
/// Bytes compressed at a time: big enough for LZFSE to find repeats across many folders' names, small enough that a
/// save doesn't hold a second copy of the index.
const FRAME: usize = 4 << 20;
const COMPRESSION_LZFSE: u32 = 0x801;

#[link(name = "compression")]
extern "C" {
    fn compression_encode_scratch_buffer_size(algorithm: u32) -> usize;
    fn compression_encode_buffer(dst: *mut u8, dst_size: usize, src: *const u8, src_size: usize, scratch: *mut libc::c_void, algorithm: u32) -> usize;
    fn compression_decode_scratch_buffer_size(algorithm: u32) -> usize;
    fn compression_decode_buffer(dst: *mut u8, dst_size: usize, src: *const u8, src_size: usize, scratch: *mut libc::c_void, algorithm: u32) -> usize;
}

/// What a snapshot says about itself.
#[derive(Debug, Clone)]
pub struct Meta {
    /// Every FSEvents event up to this ID is in the index.
    pub through: u64,
    /// When it was saved, in seconds since 1970.
    pub saved_at: u64,
    /// The volume's FSEvents UUID: event IDs only mean the same thing while it stays the same.
    pub volume: String,
    pub folders: u64,
}

/// Writes the index to `path`, through a file beside it that replaces it only once complete. Returns its size.
pub fn write(path: &Path, index: &Index, through: u64, volume: &str, saved_at: u64) -> io::Result<u64> {
    let partial = path.with_extension("partial");
    let file = File::create(&partial)?;
    let mut out = BufWriter::with_capacity(1 << 16, Frames::new(file));
    encode(&mut out, index, through, volume, saved_at)?;
    let frames = out.into_inner().map_err(|e| e.into_error())?;
    let file = frames.finish()?;
    let size = file.metadata()?.len();
    drop(file);
    std::fs::rename(&partial, path)?;
    Ok(size)
}

/// Reads a snapshot of `root`, refusing one of another folder, another format, or, when `volume` is given, a volume
/// whose FSEvents history is another one's.
pub fn read(path: &Path, root: &str, volume: Option<&str>) -> Result<(Index, Meta), String> {
    let file = File::open(path).map_err(|e| format!("couldn't open it: {e}"))?;
    let mut input = BufReader::with_capacity(1 << 16, Unframes::new(file));
    let decoded = decode(&mut input, root, volume)?;
    // The hash covers everything, so a decoded index counts only once the rest of the file checks out.
    let mut rest = Vec::new();
    input.read_to_end(&mut rest).map_err(|e| format!("it's damaged: {e}"))?;
    if !rest.is_empty() {
        return Err("it has data past its end".into());
    }
    if !input.get_ref().verified {
        return Err("its hash doesn't match".into());
    }
    Ok(decoded)
}

// ---- encoding -----------------------------------------------------------------------------------------------------

fn encode(out: &mut impl Write, index: &Index, through: u64, volume: &str, saved_at: u64) -> io::Result<()> {
    let (folders, holders, links) = index.raw_parts();
    // Parents first: the folders as a walk from the root meets them. Folders outside the tree, in limbo, aren't kept.
    let mut order = Vec::with_capacity(index.folder_count() as usize + 1);
    let mut number = vec![NONE; folders.len()];
    let mut stack = vec![ROOT];
    while let Some(at) = stack.pop() {
        number[at as usize] = order.len() as u32;
        order.push(at);
        let children: Vec<u32> = index.children(at).collect();
        stack.extend(children.into_iter().rev());
    }

    let kept = |id: &u32| number.get(*id as usize).is_some_and(|&n| n != NONE);
    let current = |folder: u32, gen: u32| kept(&folder) && folders[folder as usize].gen == gen && folders[folder as usize].status != Status::Free;
    // A group whose holder is in a folder that just left the tree, which a snapshot doesn't keep, is saved with its
    // runner-up holding the bytes: saved without a holder, it would count nowhere when reopened.
    let mut promoted: HashMap<u32, Totals> = HashMap::new();
    let mut records: Vec<(u64, Copy, Option<Copy>)> = Vec::new();
    for (&group, record) in holders.iter() {
        let runner = record.runner.filter(|r| current(r.folder, r.gen));
        if current(record.holder.folder, record.holder.gen) {
            records.push((group, record.holder, runner));
        } else if let Some(runner) = runner {
            let gain = promoted.entry(runner.folder).or_default();
            gain.size += runner.size;
            gain.kinds[usize::from(runner.kind)] += runner.size.div_ceil(4096);
            gain.clones += runner.size;
            gain.clone_files += 1;
            records.push((group, runner, None));
        }
    }

    out.write_all(MAGIC)?;
    out.write_all(&FORMAT.to_le_bytes())?;
    put_bytes(out, index.root().as_bytes())?;
    put_bytes(out, volume.as_bytes())?;
    put(out, through)?;
    put(out, saved_at)?;
    put(out, index.walk_ms)?;
    put(out, order.len() as u64)?;
    for (n, &id) in order.iter().enumerate() {
        let folder = &folders[id as usize];
        let parent = if id == ROOT { 0 } else { n as u64 - u64::from(number[folder.parent as usize]) };
        put(out, parent)?;
        put_bytes(out, index.name(id).as_bytes())?;
        put(out, folder.inode)?;
        out.write_all(&[folder.status as u8])?;
        let mut own = index.own_totals(id);
        if let Some(gain) = promoted.get(&id) {
            // The runner-up's bytes count here now, and no longer as a clone's.
            own.size += gain.size;
            for (kind, blocks) in own.kinds.iter_mut().zip(gain.kinds) {
                *kind += blocks;
            }
            own.clones = own.clones.saturating_sub(gain.clones);
            own.clone_files = own.clone_files.saturating_sub(gain.clone_files);
        }
        put(out, own.size)?;
        put(out, own.clones)?;
        put(out, own.files)?;
        put(out, own.clone_files)?;
        for blocks in own.kinds {
            put(out, blocks)?;
        }
    }

    let mut unreadable: Vec<(&u32, &i32)> = index.unreadable.iter().filter(|(id, _)| kept(id)).collect();
    unreadable.sort();
    put(out, unreadable.len() as u64)?;
    for (&id, &errno) in unreadable {
        put(out, u64::from(number[id as usize]))?;
        put(out, u64::from(errno as u32))?;
    }
    let volumes: Vec<(&u32, &Volume)> = index.volumes.iter().filter(|(id, _)| kept(id)).collect();
    put(out, volumes.len() as u64)?;
    for (&id, volume) in volumes {
        put(out, u64::from(number[id as usize]))?;
        out.write_all(&[u8::from(volume.shares_disk)])?;
        put(out, volume.used)?;
        put_bytes(out, volume.name.as_bytes())?;
    }
    let cloud: Vec<(&u32, &Cloud)> = index.cloud.iter().filter(|(id, _)| kept(id)).collect();
    put(out, cloud.len() as u64)?;
    for (&id, c) in cloud {
        put(out, u64::from(number[id as usize]))?;
        put(out, c.files)?;
        put(out, c.bytes)?;
        put(out, c.folders)?;
    }
    let errors: Vec<(&u32, &u32)> = index.entry_errors.iter().filter(|(id, _)| kept(id)).collect();
    put(out, errors.len() as u64)?;
    for (&id, &count) in errors {
        put(out, u64::from(number[id as usize]))?;
        put(out, u64::from(count))?;
    }
    let big: Vec<(&u32, &Vec<BigFile>)> = index.big.iter().filter(|(id, _)| kept(id)).collect();
    put(out, big.len() as u64)?;
    for (&id, files) in big {
        put(out, u64::from(number[id as usize]))?;
        put(out, files.len() as u64)?;
        for file in files {
            put_bytes(out, file.name.as_bytes())?;
            put(out, file.size)?;
            put(out, file.inode)?;
            put(out, file.group)?;
        }
    }
    let number = &number;
    put(out, records.len() as u64)?;
    let put_copy = |out: &mut dyn Write, copy: &Copy| -> io::Result<()> {
        put(out, copy.inode)?;
        put(out, copy.size)?;
        put(out, u64::from(number[copy.folder as usize]))?;
        out.write_all(&[copy.kind])
    };
    for (group, holder, runner) in &records {
        put(out, *group)?;
        put_copy(out, holder)?;
        match runner {
            Some(runner) => {
                out.write_all(&[1])?;
                put_copy(out, runner)?;
            }
            None => out.write_all(&[0])?,
        }
    }
    let links: Vec<(&u64, &Link)> = links.iter().filter(|(_, l)| current(l.folder, l.gen)).collect();
    put(out, links.len() as u64)?;
    for (&inode, link) in links {
        put(out, inode)?;
        put(out, u64::from(number[link.folder as usize]))?;
    }
    Ok(())
}

fn decode(input: &mut impl Read, root: &str, volume: Option<&str>) -> Result<(Index, Meta), String> {
    let damaged = |e: io::Error| format!("it's damaged: {e}");
    let mut magic = [0u8; 8];
    input.read_exact(&mut magic).map_err(damaged)?;
    if &magic != MAGIC {
        return Err("it isn't a map Pith saved".into());
    }
    let mut format = [0u8; 4];
    input.read_exact(&mut format).map_err(damaged)?;
    if u32::from_le_bytes(format) != FORMAT {
        return Err("it's from another version of Pith".into());
    }
    let saved_root = take_string(input).map_err(damaged)?;
    if saved_root != root {
        return Err(format!("it's a map of {saved_root}, not {root}"));
    }
    let saved_volume = take_string(input).map_err(damaged)?;
    if volume.is_some_and(|v| v != saved_volume) {
        return Err("the disk's history of changes was reset since it was saved".into());
    }
    let through = take(input).map_err(damaged)?;
    let saved_at = take(input).map_err(damaged)?;
    let walk_ms = take(input).map_err(damaged)?;
    let count = take(input).map_err(damaged)? as usize;
    // A folder takes at least a dozen bytes; anything claiming more folders than a disk could hold is damage.
    if count == 0 || count > u32::MAX as usize / 2 {
        return Err(format!("it claims {count} folders"));
    }
    let mut folders: Vec<Folder> = Vec::with_capacity(count);
    let mut names = Vec::new();
    for n in 0..count {
        let back = take(input).map_err(damaged)?;
        let parent = if n == 0 {
            NONE
        } else {
            if back == 0 || back > n as u64 {
                return Err("a folder's parent comes after it".into());
            }
            (n as u64 - back) as u32
        };
        let name = take_vec(input).map_err(damaged)?;
        let name_at = names.len() as u32;
        let name_len = u16::try_from(name.len()).map_err(|_| "a name is too long".to_string())?;
        names.extend_from_slice(&name);
        let inode = take(input).map_err(damaged)?;
        let mut status = [0u8; 1];
        input.read_exact(&mut status).map_err(damaged)?;
        let status = Status::from_u8(status[0]).filter(|s| *s != Status::Free).ok_or("a folder has an unknown state")?;
        let mut own = Totals { size: take(input).map_err(damaged)?, clones: take(input).map_err(damaged)?, ..Totals::default() };
        own.files = take(input).map_err(damaged)?;
        own.clone_files = take(input).map_err(damaged)?;
        for kind in 0..KIND_COUNT {
            own.kinds[kind] = take(input).map_err(damaged)?;
        }
        folders.push(Folder::restored(parent, name_at, name_len, status, inode, &own));
    }
    let id = |n: u64| -> Result<u32, String> { if (n as usize) < count { Ok(n as u32) } else { Err("a table names a folder that isn't there".into()) } };

    let mut unreadable = HashMap::new();
    for _ in 0..take(input).map_err(damaged)? {
        let folder = id(take(input).map_err(damaged)?)?;
        unreadable.insert(folder, take(input).map_err(damaged)? as u32 as i32);
    }
    let mut volumes = HashMap::new();
    for _ in 0..take(input).map_err(damaged)? {
        let folder = id(take(input).map_err(damaged)?)?;
        let mut shares = [0u8; 1];
        input.read_exact(&mut shares).map_err(damaged)?;
        let used = take(input).map_err(damaged)?;
        let name = take_string(input).map_err(damaged)?;
        volumes.insert(folder, Volume { name, used, shares_disk: shares[0] != 0 });
    }
    let mut cloud = HashMap::new();
    for _ in 0..take(input).map_err(damaged)? {
        let folder = id(take(input).map_err(damaged)?)?;
        let c = Cloud { files: take(input).map_err(damaged)?, bytes: take(input).map_err(damaged)?, folders: take(input).map_err(damaged)? };
        cloud.insert(folder, c);
    }
    let mut entry_errors = HashMap::new();
    for _ in 0..take(input).map_err(damaged)? {
        let folder = id(take(input).map_err(damaged)?)?;
        entry_errors.insert(folder, take(input).map_err(damaged)? as u32);
    }
    let mut big = HashMap::new();
    for _ in 0..take(input).map_err(damaged)? {
        let folder = id(take(input).map_err(damaged)?)?;
        let n = take(input).map_err(damaged)?;
        let mut files = Vec::with_capacity(n.min(1 << 16) as usize);
        for _ in 0..n {
            let name = take_string(input).map_err(damaged)?.into_boxed_str();
            files.push(BigFile { name, size: take(input).map_err(damaged)?, inode: take(input).map_err(damaged)?, group: take(input).map_err(damaged)? });
        }
        big.insert(folder, files);
    }
    let mut holders = Groups::default();
    let take_copy = |input: &mut dyn Read| -> Result<Copy, String> {
        let inode = take(input).map_err(damaged)?;
        let size = take(input).map_err(damaged)?;
        let folder = id(take(input).map_err(damaged)?)?;
        let mut kind = [0u8; 1];
        input.read_exact(&mut kind).map_err(damaged)?;
        if usize::from(kind[0]) >= KIND_COUNT {
            return Err("a clone group has an unknown kind".into());
        }
        Ok(Copy { inode, size, folder, gen: 0, kind: kind[0] })
    };
    for _ in 0..take(input).map_err(damaged)? {
        let group = take(input).map_err(damaged)?;
        let holder = take_copy(input)?;
        let mut has_runner = [0u8; 1];
        input.read_exact(&mut has_runner).map_err(damaged)?;
        let runner = if has_runner[0] == 1 { Some(take_copy(input)?) } else { None };
        holders.insert(group, Holder { holder, runner });
    }
    let mut links = HashMap::new();
    for _ in 0..take(input).map_err(damaged)? {
        let inode = take(input).map_err(damaged)?;
        let folder = id(take(input).map_err(damaged)?)?;
        links.insert(inode, Link { folder, gen: 0 });
    }
    let parts = Parts { folders, names, big, unreadable, volumes, cloud, entry_errors, holders, links, walk_ms };
    let index = Index::from_parts(root, parts);
    let meta = Meta { through, saved_at, volume: saved_volume, folders: index.folder_count() };
    Ok((index, meta))
}

fn put<W: Write + ?Sized>(out: &mut W, mut value: u64) -> io::Result<()> {
    let mut bytes = [0u8; 10];
    let mut n = 0;
    loop {
        let byte = (value & 0x7f) as u8;
        value >>= 7;
        if value == 0 {
            bytes[n] = byte;
            n += 1;
            break;
        }
        bytes[n] = byte | 0x80;
        n += 1;
    }
    out.write_all(&bytes[..n])
}

fn put_bytes<W: Write + ?Sized>(out: &mut W, bytes: &[u8]) -> io::Result<()> {
    put(out, bytes.len() as u64)?;
    out.write_all(bytes)
}

fn take<R: Read + ?Sized>(input: &mut R) -> io::Result<u64> {
    let mut value = 0u64;
    for shift in (0..64).step_by(7) {
        let mut byte = [0u8; 1];
        input.read_exact(&mut byte)?;
        value |= u64::from(byte[0] & 0x7f) << shift;
        if byte[0] & 0x80 == 0 {
            return Ok(value);
        }
    }
    Err(io::Error::new(io::ErrorKind::InvalidData, "a number runs past 64 bits"))
}

fn take_vec<R: Read + ?Sized>(input: &mut R) -> io::Result<Vec<u8>> {
    let length = take(input)?;
    if length > 1 << 20 {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "a string is impossibly long"));
    }
    let mut bytes = vec![0u8; length as usize];
    input.read_exact(&mut bytes)?;
    Ok(bytes)
}

fn take_string<R: Read + ?Sized>(input: &mut R) -> io::Result<String> {
    String::from_utf8(take_vec(input)?).map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "a name isn't UTF-8"))
}

// ---- frames ---------------------------------------------------------------------------------------------------------

/// FNV-1a, enough to tell a damaged file from a whole one.
struct Hash(u64);

impl Hash {
    fn new() -> Self {
        Hash(0xcbf2_9ce4_8422_2325)
    }
    fn update(&mut self, bytes: &[u8]) {
        for &byte in bytes {
            self.0 ^= u64::from(byte);
            self.0 = self.0.wrapping_mul(0x0100_0000_01b3);
        }
    }
}

/// Compresses what's written in frames: each its raw length, stored length and method, then its bytes. A frame of
/// raw length 0 ends the stream, followed by the hash of every raw byte.
struct Frames {
    file: File,
    raw: Vec<u8>,
    packed: Vec<u8>,
    scratch: Vec<u8>,
    hash: Hash,
}

impl Frames {
    fn new(file: File) -> Self {
        let scratch = vec![0u8; unsafe { compression_encode_scratch_buffer_size(COMPRESSION_LZFSE) }];
        Frames { file, raw: Vec::with_capacity(FRAME), packed: vec![0u8; FRAME + FRAME / 16 + 64], scratch, hash: Hash::new() }
    }

    fn flush_frame(&mut self) -> io::Result<()> {
        if self.raw.is_empty() {
            return Ok(());
        }
        self.hash.update(&self.raw);
        let packed = unsafe {
            compression_encode_buffer(self.packed.as_mut_ptr(), self.packed.len(), self.raw.as_ptr(), self.raw.len(), self.scratch.as_mut_ptr().cast(), COMPRESSION_LZFSE)
        };
        // 0 means it didn't fit: such a frame is kept as it is.
        let (method, bytes): (u8, &[u8]) = if packed == 0 { (0, &self.raw) } else { (1, &self.packed[..packed]) };
        self.file.write_all(&(self.raw.len() as u32).to_le_bytes())?;
        self.file.write_all(&(bytes.len() as u32).to_le_bytes())?;
        self.file.write_all(&[method])?;
        self.file.write_all(bytes)?;
        self.raw.clear();
        Ok(())
    }

    fn finish(mut self) -> io::Result<File> {
        self.flush_frame()?;
        self.file.write_all(&0u32.to_le_bytes())?;
        self.file.write_all(&0u32.to_le_bytes())?;
        self.file.write_all(&[0])?;
        self.file.write_all(&self.hash.0.to_le_bytes())?;
        self.file.flush()?;
        Ok(self.file)
    }
}

impl Write for Frames {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        let room = FRAME - self.raw.len();
        let n = bytes.len().min(room);
        self.raw.extend_from_slice(&bytes[..n]);
        if self.raw.len() == FRAME {
            self.flush_frame()?;
        }
        Ok(n)
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

/// Reads what `Frames` wrote, and whether the hash at its end matched.
struct Unframes {
    file: File,
    raw: Vec<u8>,
    at: usize,
    packed: Vec<u8>,
    scratch: Vec<u8>,
    hash: Hash,
    ended: bool,
    verified: bool,
}

impl Unframes {
    fn new(file: File) -> Self {
        let scratch = vec![0u8; unsafe { compression_decode_scratch_buffer_size(COMPRESSION_LZFSE) }];
        Unframes { file, raw: Vec::new(), at: 0, packed: Vec::new(), scratch, hash: Hash::new(), ended: false, verified: false }
    }

    fn next_frame(&mut self) -> io::Result<()> {
        let mut header = [0u8; 9];
        self.file.read_exact(&mut header)?;
        let raw = u32::from_le_bytes(header[0..4].try_into().unwrap()) as usize;
        let stored = u32::from_le_bytes(header[4..8].try_into().unwrap()) as usize;
        let invalid = |what: &str| io::Error::new(io::ErrorKind::InvalidData, what.to_string());
        if raw == 0 {
            let mut hash = [0u8; 8];
            self.file.read_exact(&mut hash)?;
            self.ended = true;
            self.verified = u64::from_le_bytes(hash) == self.hash.0;
            self.raw.clear();
            self.at = 0;
            return Ok(());
        }
        if raw > FRAME || stored > FRAME + FRAME / 16 + 64 {
            return Err(invalid("a frame is larger than any Pith writes"));
        }
        self.packed.resize(stored, 0);
        self.file.read_exact(&mut self.packed)?;
        self.raw.resize(raw, 0);
        match header[8] {
            0 if stored == raw => self.raw.copy_from_slice(&self.packed),
            1 => {
                let n = unsafe {
                    compression_decode_buffer(self.raw.as_mut_ptr(), raw, self.packed.as_ptr(), stored, self.scratch.as_mut_ptr().cast(), COMPRESSION_LZFSE)
                };
                if n != raw {
                    return Err(invalid("a frame doesn't decompress to its length"));
                }
            }
            _ => return Err(invalid("a frame has an unknown method")),
        }
        self.hash.update(&self.raw);
        self.at = 0;
        Ok(())
    }
}

impl Read for Unframes {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if self.at == self.raw.len() {
            if self.ended {
                return Ok(0);
            }
            self.next_frame()?;
            if self.ended {
                return Ok(0);
            }
        }
        let n = buf.len().min(self.raw.len() - self.at);
        buf[..n].copy_from_slice(&self.raw[self.at..self.at + n]);
        self.at += n;
        Ok(n)
    }
}
