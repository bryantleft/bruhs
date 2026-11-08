/**
 * Runtime checks for data crossing a boundary: the scanner's NDJSON lines, the cached
 * snapshot (written by whatever scanner version ran last) and `/api/trash` responses.
 * Each parser returns `null` instead of throwing, so callers decide what a bad line means.
 */

import { CATEGORY_VAR, type Category } from "./format.ts";
import {
  type DirNode,
  type FileEntry,
  type ProgressEvent,
  RESULT_VERSION,
  type ResultEvent,
  type ScanEvent,
  type ScanSummary,
  type TrashResult,
  type TreeNode,
  type UnreadableFolder,
  type UnreadableReason,
  type VolumeEntry,
} from "./types.ts";

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** The `name`/`path`/`size` fields every node and file entry share. */
function parseEntry(value: unknown): FileEntry | null {
  if (!isObject(value)) return null;
  const { name, path, size } = value;
  if (typeof name !== "string" || typeof path !== "string" || !isCount(size)) {
    return null;
  }
  return { name, path, size };
}

function isReason(value: unknown): value is UnreadableReason {
  return value === "protected" || value === "denied" || value === "other";
}

/** A group's bytes by kind: known kinds only, each a count. */
function parseKinds(value: unknown): Partial<Record<Category, number>> | null {
  if (!isObject(value)) return null;
  const kinds: Partial<Record<Category, number>> = {};
  for (const [name, bytes] of Object.entries(value)) {
    if (!(name in CATEGORY_VAR) || !isCount(bytes)) return null;
    kinds[name as Category] = bytes;
  }
  return kinds;
}

/** A folder's or group's left-out clones: absent when it has none, a count otherwise, `false` when malformed. */
function parseClones(value: unknown): { clones?: number } | false {
  if (value === undefined) return {};
  return isCount(value) ? { clones: value } : false;
}

function parseTreeNode(value: unknown): TreeNode | null {
  const base = parseEntry(value);
  if (!base || !isObject(value)) return null;
  switch (value.kind) {
    case "file":
      return { ...base, kind: "file" };
    case "aggregate": {
      const clones = parseClones(value.clones);
      if (!isCount(value.files) || !clones) return null;
      if (value.kinds === undefined) {
        return { ...base, kind: "aggregate", files: value.files, ...clones };
      }
      const kinds = parseKinds(value.kinds);
      return kinds
        ? { ...base, kind: "aggregate", files: value.files, kinds, ...clones }
        : null;
    }
    case "unreadable":
      return isReason(value.reason)
        ? { ...base, kind: "unreadable", reason: value.reason }
        : null;
    case "volume":
      return typeof value.sharesDisk === "boolean"
        ? { ...base, kind: "volume", sharesDisk: value.sharesDisk }
        : null;
    case "dir": {
      const clones = parseClones(value.clones);
      if (!isCount(value.files) || !clones) return null;
      const dir = parseDirChildren(base, value.files, value.children);
      return dir ? { ...dir, ...clones } : null;
    }
    default:
      return null;
  }
}

function parseDirChildren(
  base: FileEntry,
  files: number,
  rawChildren: unknown,
): DirNode | null {
  // The scanner omits `children` for empty directories.
  if (rawChildren === undefined) {
    return { ...base, kind: "dir", files, children: [] };
  }
  if (!Array.isArray(rawChildren)) return null;
  const children: TreeNode[] = [];
  for (const raw of rawChildren) {
    const child = parseTreeNode(raw);
    if (!child) return null;
    children.push(child);
  }
  return { ...base, kind: "dir", files, children };
}

function parseSummary(value: unknown): ScanSummary | null {
  if (!isObject(value)) return null;
  const {
    dirs,
    files,
    bytes,
    errors,
    unreadable,
    entryErrors,
    cloudOnly,
    elapsedMs,
    engine,
    clones,
  } = value;
  if (
    !isCount(dirs) ||
    !isCount(files) ||
    !isCount(bytes) ||
    !isCount(errors) ||
    !isCount(entryErrors) ||
    !isCount(elapsedMs) ||
    (engine !== "bulk" && engine !== "std") ||
    !isObject(unreadable) ||
    !isCount(unreadable.protected) ||
    !isCount(unreadable.denied) ||
    !isCount(unreadable.other) ||
    !isObject(cloudOnly) ||
    !isCount(cloudOnly.files) ||
    !isCount(cloudOnly.bytes) ||
    !isCount(cloudOnly.folders) ||
    !isObject(clones) ||
    !isCount(clones.files) ||
    !isCount(clones.bytes)
  ) {
    return null;
  }
  return {
    dirs,
    files,
    bytes,
    errors,
    unreadable: {
      protected: unreadable.protected,
      denied: unreadable.denied,
      other: unreadable.other,
    },
    entryErrors,
    cloudOnly: {
      files: cloudOnly.files,
      bytes: cloudOnly.bytes,
      folders: cloudOnly.folders,
    },
    elapsedMs,
    engine,
    clones: { files: clones.files, bytes: clones.bytes },
  };
}

function parseVolume(value: unknown): VolumeEntry | null {
  if (!isObject(value)) return null;
  const { path, name, bytes, sharesDisk } = value;
  if (
    typeof path !== "string" ||
    typeof name !== "string" ||
    !isCount(bytes) ||
    typeof sharesDisk !== "boolean"
  ) {
    return null;
  }
  return { path, name, bytes, sharesDisk };
}

function parseUnreadable(value: unknown): UnreadableFolder | null {
  if (!isObject(value) || typeof value.path !== "string") return null;
  return isReason(value.reason)
    ? { path: value.path, reason: value.reason }
    : null;
}

/** Every element parsed, or null if any isn't valid. */
function parseList<T>(
  value: unknown,
  parse: (item: unknown) => T | null,
): T[] | null {
  if (!Array.isArray(value)) return null;
  const out: T[] = [];
  for (const raw of value) {
    const item = parse(raw);
    if (item === null) return null;
    out.push(item);
  }
  return out;
}

function parseProgress(value: Json): ProgressEvent | null {
  const { dirs, files, bytes, errors } = value;
  if (
    !isCount(dirs) ||
    !isCount(files) ||
    !isCount(bytes) ||
    !isCount(errors)
  ) {
    return null;
  }
  return { type: "progress", dirs, files, bytes, errors };
}

/** A complete `result` event of the current version, or `null` (wrong version or shape). */
export function parseResultEvent(value: unknown): ResultEvent | null {
  if (
    !isObject(value) ||
    value.type !== "result" ||
    value.version !== RESULT_VERSION
  ) {
    return null;
  }
  const root = parseTreeNode(value.root);
  const summary = parseSummary(value.summary);
  const topFiles = parseList<FileEntry>(value.topFiles, parseEntry);
  const volumes = parseList(value.volumes, parseVolume);
  const unreadableFolders = parseList(value.unreadableFolders, parseUnreadable);
  if (
    root?.kind !== "dir" ||
    !summary ||
    !topFiles ||
    !volumes ||
    !unreadableFolders
  ) {
    return null;
  }
  return {
    type: "result",
    version: RESULT_VERSION,
    root,
    topFiles,
    volumes,
    unreadableFolders,
    summary,
  };
}

/** Parse one NDJSON line from `/api/scan`. Returns `null` for anything unrecognised. */
export function parseScanEvent(line: string): ScanEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isObject(value)) return null;
  switch (value.type) {
    case "progress":
      return parseProgress(value);
    case "result":
      return parseResultEvent(value);
    case "fatal":
      return {
        type: "fatal",
        reason: typeof value.reason === "string" ? value.reason : "unknown",
      };
    case "error":
      return {
        type: "error",
        message:
          typeof value.message === "string" ? value.message : "Scan failed",
        exitCode: typeof value.exitCode === "number" ? value.exitCode : null,
        stderr: typeof value.stderr === "string" ? value.stderr : "",
      };
    default:
      return null;
  }
}

/** Parse a trash outcome (the scanner's output line or the API's response body). */
export function parseTrashResult(value: unknown): TrashResult | null {
  if (!isObject(value) || value.type !== "trash") return null;
  const path = typeof value.path === "string" ? value.path : undefined;
  if (value.ok === true && path !== undefined) {
    return { type: "trash", ok: true, path };
  }
  if (value.ok === false && typeof value.reason === "string") {
    return { type: "trash", ok: false, path, reason: value.reason };
  }
  return null;
}
