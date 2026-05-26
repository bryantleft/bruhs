/** Shapes mirroring the `storage-scanner` NDJSON protocol. */

export interface TreeNode {
  name: string;
  path: string;
  size: number;
  isDir: boolean;
  children?: TreeNode[];
}

export interface FileEntry {
  name: string;
  path: string;
  size: number;
}

export interface ScanSummary {
  dirs: number;
  files: number;
  bytes: number;
  errors: number;
  elapsedMs: number;
  engine: "bulk" | "std";
}

/** Periodic progress event streamed during a scan. */
export interface ProgressEvent {
  type: "progress";
  dirs: number;
  files: number;
  bytes: number;
  errors: number;
}

/** Final event of a scan stream. */
export interface ResultEvent {
  type: "result";
  root: TreeNode;
  topFiles: FileEntry[];
  summary: ScanSummary;
}

export type ScanEvent = ProgressEvent | ResultEvent;

export interface TrashResult {
  type: "trash";
  ok: boolean;
  path: string;
  reason?: string;
}
