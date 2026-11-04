/**
 * Runtime checks for data crossing a boundary: the scanner's NDJSON lines, the cached
 * snapshot (written by whatever scanner version ran last) and `/api/trash` responses.
 * Each parser returns `null` instead of throwing, so callers decide what a bad line means.
 */

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
} from "./types";

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

function parseTreeNode(value: unknown): TreeNode | null {
  const base = parseEntry(value);
  if (!base || !isObject(value)) return null;
  switch (value.kind) {
    case "file":
      return { ...base, kind: "file" };
    case "aggregate":
      return { ...base, kind: "aggregate" };
    case "dir":
      return parseDirChildren(base, value.children);
    default:
      return null;
  }
}

function parseDirChildren(
  base: FileEntry,
  rawChildren: unknown,
): DirNode | null {
  // The scanner omits `children` for empty directories.
  if (rawChildren === undefined) return { ...base, kind: "dir", children: [] };
  if (!Array.isArray(rawChildren)) return null;
  const children: TreeNode[] = [];
  for (const raw of rawChildren) {
    const child = parseTreeNode(raw);
    if (!child) return null;
    children.push(child);
  }
  return { ...base, kind: "dir", children };
}

function parseSummary(value: unknown): ScanSummary | null {
  if (!isObject(value)) return null;
  const { dirs, files, bytes, errors, elapsedMs, engine } = value;
  if (
    !isCount(dirs) ||
    !isCount(files) ||
    !isCount(bytes) ||
    !isCount(errors) ||
    !isCount(elapsedMs) ||
    (engine !== "bulk" && engine !== "std")
  ) {
    return null;
  }
  return { dirs, files, bytes, errors, elapsedMs, engine };
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
  if (root?.kind !== "dir" || !summary || !Array.isArray(value.topFiles)) {
    return null;
  }
  const topFiles: FileEntry[] = [];
  for (const raw of value.topFiles) {
    const file = parseEntry(raw);
    if (!file) return null;
    topFiles.push(file);
  }
  return { type: "result", version: RESULT_VERSION, root, topFiles, summary };
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
