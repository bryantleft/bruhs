/** Shapes mirroring the `storage-scanner` NDJSON protocol. */

import type { Category } from "./format.ts";

/** Version of the `result` shape this client understands (`RESULT_VERSION` in Rust). */
export const RESULT_VERSION = 4;

interface NodeBase {
  name: string;
  path: string;
  size: number;
}

export interface DirNode extends NodeBase {
  kind: "dir";
  /** Files inside it, counted once each. */
  files: number;
  /** Its APFS clones that `size` leaves out, because another copy holds their blocks. */
  clones?: number;
  children: readonly TreeNode[];
}

export interface FileNode extends NodeBase {
  kind: "file";
}

/** Synthetic "(smaller items)" node. It has no real path on disk and can't be trashed. */
export interface AggregateNode extends NodeBase {
  kind: "aggregate";
  files: number;
  /** Its bytes by file kind, so the legend counts grouped items as what they are. */
  kinds?: Readonly<Partial<Record<Category, number>>>;
  /** Its APFS clones that `size` leaves out, because another copy holds their blocks. */
  clones?: number;
}

/** Why the scanner couldn't read a folder. */
export type UnreadableReason = "protected" | "denied" | "other";

/** A folder the scan couldn't read: its size is unknown, so it's 0. */
export interface UnreadableNode extends NodeBase {
  kind: "unreadable";
  reason: UnreadableReason;
}

/**
 * Another volume mounted here, which the scan didn't enter. Its size is its used space
 * when it shares the scanned disk (the startup disk's Preboot and VM), and 0 otherwise.
 */
export interface VolumeNode extends NodeBase {
  kind: "volume";
  sharesDisk: boolean;
}

export type TreeNode =
  | DirNode
  | FileNode
  | AggregateNode
  | UnreadableNode
  | VolumeNode;

export interface FileEntry {
  name: string;
  path: string;
  size: number;
}

export type ScanEngine = "bulk" | "std";

export interface ScanSummary {
  dirs: number;
  files: number;
  bytes: number;
  /** Folders the scan couldn't read, split by reason in `unreadable`. */
  errors: number;
  unreadable: Readonly<Record<UnreadableReason, number>>;
  entryErrors: number;
  /** iCloud items counted without downloading them. */
  cloudOnly: { files: number; bytes: number; folders: number };
  /** Full clones counted once, at another copy of their group; `bytes` leaves their sizes out. */
  clones: { files: number; bytes: number };
  elapsedMs: number;
  engine: ScanEngine;
}

export interface VolumeEntry {
  path: string;
  name: string;
  bytes: number;
  sharesDisk: boolean;
}

export interface UnreadableFolder {
  path: string;
  reason: UnreadableReason;
}

/** Periodic progress event streamed during a scan. */
export interface ProgressEvent {
  type: "progress";
  dirs: number;
  files: number;
  bytes: number;
  errors: number;
}

/** Final event of a successful scan stream. */
export interface ResultEvent {
  type: "result";
  version: typeof RESULT_VERSION;
  root: DirNode;
  topFiles: readonly FileEntry[];
  /** Volumes mounted inside the scan, which it didn't enter. */
  volumes: readonly VolumeEntry[];
  /** Folders it couldn't read, shallowest first and capped; `summary.unreadable` counts them all. */
  unreadableFolders: readonly UnreadableFolder[];
  summary: ScanSummary;
}

/** The scanner itself gave up (for example, the result couldn't be serialized). */
export interface FatalEvent {
  type: "fatal";
  reason: string;
}

/** Added by the server when the scanner can't start, crashes or exits without a result. */
export interface ErrorEvent {
  type: "error";
  message: string;
  exitCode: number | null;
  stderr: string;
}

export type ScanEvent = ProgressEvent | ResultEvent | FatalEvent | ErrorEvent;

/** Why the server refused or failed to move a path to the Trash. */
export type TrashFailure =
  | "cross_origin"
  | "unsupported_media_type"
  | "invalid_body"
  | "not_absolute"
  | "no_scan"
  | "aggregate"
  | "outside_scan_root"
  | "protected_path"
  | "volume"
  | "not_found"
  | "scanner_failed"
  // The scanner passes through the OS error text for any other failure.
  | (string & {});

export type TrashResult =
  | { type: "trash"; ok: true; path: string }
  | { type: "trash"; ok: false; path?: string; reason: TrashFailure };
