//! File kinds by extension, for the per-kind totals of grouped small items. The table must match the disk map's
//! (`register` calls in src/lib/format.ts); tests/kinds.test.ts fails when they drift apart.

use serde::Serialize;

/// The disk map's kinds, in CATEGORY_VAR's order.
pub const KIND_NAMES: [&str; 8] = ["code", "image", "video", "audio", "document", "archive", "binary", "other"];
pub const KIND_COUNT: usize = KIND_NAMES.len();
const OTHER: usize = 7;

const CODE: &[&str] = &["js", "jsx", "ts", "tsx", "rs", "py", "go", "c", "h", "cpp", "hpp", "java", "rb", "php", "swift", "kt", "json", "toml", "yaml", "yml", "css", "scss", "html", "sh", "sql", "lock"];
const IMAGE: &[&str] = &["jpg", "jpeg", "png", "gif", "heic", "heif", "svg", "webp", "bmp", "tiff", "raw", "cr2", "nef", "psd", "ico"];
const VIDEO: &[&str] = &["mp4", "mov", "mkv", "avi", "webm", "flv", "wmv", "m4v", "mpg", "mpeg"];
const AUDIO: &[&str] = &["mp3", "wav", "flac", "aac", "ogg", "m4a", "aiff", "wma"];
const DOCUMENT: &[&str] = &["pdf", "doc", "docx", "txt", "md", "rtf", "pages", "key", "numbers", "xls", "xlsx", "ppt", "pptx", "csv", "epub", "log"];
const ARCHIVE: &[&str] = &["zip", "tar", "gz", "bz2", "xz", "7z", "rar", "dmg", "pkg", "iso", "tgz", "img", "raw", "vmdk", "qcow2", "vdi", "sparseimage", "sparsebundle"];
const BINARY: &[&str] = &["app", "exe", "bin", "so", "dylib", "o", "a", "wasm", "node", "class"];

/// Each kind's extensions, in KIND_NAMES order (Other has none: it's everything else).
const TABLE: [&[&str]; 7] = [CODE, IMAGE, VIDEO, AUDIO, DOCUMENT, ARCHIVE, BINARY];

/// The kind a file name's extension says, as the disk map works it out: the last dot's extension, case-insensitive;
/// a name that starts with its only dot (".zshrc") has none.
pub fn kind_of(name: &str) -> usize {
    let Some(dot) = name.rfind('.') else { return OTHER };
    if dot == 0 {
        return OTHER;
    }
    let ext = name[dot + 1..].to_ascii_lowercase();
    // The last kind that lists it wins, as format.ts's later `register` calls overwrite earlier ones: "raw" is listed
    // for images and archives, and the map calls it an archive.
    TABLE.iter().rposition(|exts| exts.contains(&ext.as_str())).unwrap_or(OTHER)
}

/// Bytes by kind, serialized with the kinds' names and only the kinds that hold any.
#[derive(Clone, Copy, Default, Debug, PartialEq, Eq)]
pub struct KindBytes(pub [u64; KIND_COUNT]);

impl KindBytes {
    pub fn add(&mut self, other: &KindBytes) {
        for (mine, theirs) in self.0.iter_mut().zip(other.0) {
            *mine += theirs;
        }
    }
    pub fn subtract(&mut self, other: &KindBytes) {
        for (mine, theirs) in self.0.iter_mut().zip(other.0) {
            *mine = mine.saturating_sub(theirs);
        }
    }
    pub fn is_empty(&self) -> bool {
        self.0.iter().all(|&bytes| bytes == 0)
    }
}

impl Serialize for KindBytes {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        let mut map = serializer.serialize_map(None)?;
        for (name, &bytes) in KIND_NAMES.iter().zip(&self.0) {
            if bytes > 0 {
                map.serialize_entry(name, &bytes)?;
            }
        }
        map.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_map_to_kinds_as_the_map_does() {
        assert_eq!(KIND_NAMES[kind_of("main.RS")], "code");
        assert_eq!(KIND_NAMES[kind_of("photo.heic")], "image");
        assert_eq!(KIND_NAMES[kind_of("disk.raw")], "archive");
        assert_eq!(KIND_NAMES[kind_of(".zshrc")], "other");
        assert_eq!(KIND_NAMES[kind_of("README")], "other");
    }
}
