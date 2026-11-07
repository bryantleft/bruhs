/** Human-readable sizes and file-type → fruit-color categorization. */

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

/**
 * A storage size to three significant figures in decimal units, as Finder and Disk Utility
 * count since Mac OS X 10.6: "3.34 GB", "88.0 MB". Pith's native views use the same rule
 * (native/Sources/PithCore/ByteFormat.swift), so the Disk tab and its map agree.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1) return "0 B";
  let unit = 0;
  let value = bytes;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  // Rounding can carry into the next unit: 999.6 MB is "1.00 GB", not "1000 MB".
  if (unit > 0 && Math.round(value) >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const decimals = value >= 99.95 || unit === 0 ? 0 : value >= 9.995 ? 1 : 2;
  return `${value.toFixed(decimals)} ${UNITS[unit]}`;
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
  "log",
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
  // disk/VM images — common space hogs on dev machines
  "img",
  "raw",
  "vmdk",
  "qcow2",
  "vdi",
  "sparseimage",
  "sparsebundle",
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

/**
 * Each kind's colour, as a theme variable, by appearance. The full variable names are
 * written out so Tailwind sees them and emits them for the canvas. Eight kinds need eight hues that tell apart at a
 * glance, so the map uses the whole fruit palette, the accent's and status colours' hues
 * included (an exception recorded in packages/ui/AGENTS.md). Only Other changes with the
 * appearance: unknown files stay a quiet neutral, which on a light canvas is a light step.
 */
export const CATEGORY_TOKEN: Record<Category, { dark: string; light: string }> =
  {
    code: { dark: "--color-blueberry-500", light: "--color-blueberry-500" },
    image: {
      dark: "--color-dragonfruit-500",
      light: "--color-dragonfruit-500",
    },
    video: { dark: "--color-persimmon-500", light: "--color-persimmon-500" },
    audio: { dark: "--color-mangosteen-500", light: "--color-mangosteen-500" },
    document: { dark: "--color-pandan-500", light: "--color-pandan-500" },
    archive: { dark: "--color-durian-500", light: "--color-durian-500" },
    binary: { dark: "--color-lychee-600", light: "--color-lychee-600" },
    other: { dark: "--color-longan-600", light: "--color-longan-300" },
  };

/**
 * The CSS variable for each category's colour. Kinds that change with the appearance get a
 * `--kind-*` variable, which the stylesheets define per appearance (src/styles.css, and
 * native-web/styles.css for Pith's light mode).
 */
export const CATEGORY_VAR: Record<Category, string> = Object.fromEntries(
  Object.entries(CATEGORY_TOKEN).map(([category, { dark, light }]) => [
    category,
    dark === light ? dark : `--kind-${category}`,
  ]),
) as Record<Category, string>;

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
