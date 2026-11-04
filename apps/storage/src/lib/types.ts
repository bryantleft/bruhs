/** Shapes mirroring the `storage-scanner` NDJSON protocol. */

/** Version of the `result` shape this client understands (`RESULT_VERSION` in Rust). */
export const RESULT_VERSION = 2;

interface NodeBase {
  name: string;
  path: string;
  size: number;
}

export interface DirNode extends NodeBase {
  kind: "dir";
  children: readonly TreeNode[];
}

export interface FileNode extends NodeBase {
  kind: "file";
}

/** Synthetic "(smaller items)" node. It has no real path on disk and can't be trashed. */
export interface AggregateNode extends NodeBase {
  kind: "aggregate";
}

export type TreeNode = DirNode | FileNode | AggregateNode;

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
  errors: number;
  elapsedMs: number;
  engine: ScanEngine;
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
  | "not_found"
  | "scanner_failed"
  // The scanner passes through the OS error text for any other failure.
  | (string & {});

export type TrashResult =
  | { type: "trash"; ok: true; path: string }
  | { type: "trash"; ok: false; path?: string; reason: TrashFailure };
