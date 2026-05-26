/** Human-readable sizes and file-type → fruit-color categorization. */

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

export function formatBytes(bytes: number): string {
  if (bytes < 1) return "0 B";
  const i = Math.min(
    UNITS.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** i;
  const decimals = value >= 100 || i === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${UNITS[i]}`;
}

export type Category =
  | "code"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "archive"
  | "binary"
  | "other";

const EXT_CATEGORY: Record<string, Category> = {};
function register(cat: Category, exts: string[]) {
  for (const e of exts) EXT_CATEGORY[e] = cat;
}
register("code", [
  "js",
  "jsx",
  "ts",
  "tsx",
  "rs",
  "py",
  "go",
  "c",
  "h",
  "cpp",
  "hpp",
  "java",
  "rb",
  "php",
  "swift",
  "kt",
  "json",
  "toml",
  "yaml",
  "yml",
  "css",
  "scss",
  "html",
  "sh",
  "sql",
  "lock",
]);
register("image", [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "heic",
  "heif",
  "svg",
  "webp",
  "bmp",
  "tiff",
  "raw",
  "cr2",
  "nef",
  "psd",
  "ico",
]);
register("video", [
  "mp4",
  "mov",
  "mkv",
  "avi",
  "webm",
  "flv",
  "wmv",
  "m4v",
  "mpg",
  "mpeg",
]);
register("audio", ["mp3", "wav", "flac", "aac", "ogg", "m4a", "aiff", "wma"]);
register("document", [
  "pdf",
  "doc",
  "docx",
  "txt",
  "md",
  "rtf",
  "pages",
  "key",
  "numbers",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "csv",
  "epub",
]);
register("archive", [
  "zip",
  "tar",
  "gz",
  "bz2",
  "xz",
  "7z",
  "rar",
  "dmg",
  "pkg",
  "iso",
  "tgz",
]);
register("binary", [
  "app",
  "exe",
  "bin",
  "so",
  "dylib",
  "o",
  "a",
  "wasm",
  "node",
  "class",
]);

/** The fruit-palette CSS variable (mid step) used for each category. */
export const CATEGORY_VAR: Record<Category, string> = {
  code: "--color-blueberry-500",
  image: "--color-dragonfruit-500",
  video: "--color-persimmon-500",
  audio: "--color-mangosteen-500",
  document: "--color-guava-500",
  archive: "--color-durian-500",
  binary: "--color-lychee-600",
  other: "--color-longan-600",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  code: "Code",
  image: "Images",
  video: "Video",
  audio: "Audio",
  document: "Documents",
  archive: "Archives",
  binary: "Apps & binaries",
  other: "Other",
};

export function categoryForName(name: string): Category {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "other";
  const ext = name.slice(dot + 1).toLowerCase();
  return EXT_CATEGORY[ext] ?? "other";
}
