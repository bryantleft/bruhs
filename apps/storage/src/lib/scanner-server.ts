/// <reference types="node" />
//! Server-only helpers for locating, spawning, and caching the native scanner.
//! Never import this from client code.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseResultEvent, parseTrashResult } from "./protocol";
import type { ErrorEvent, ScanEngine, TrashResult } from "./types";

/** Resolve the scanner binary, preferring the optimized release build. */
export function scannerBin(): string {
  const base = path.resolve(process.cwd(), "scanner", "target");
  const release = path.join(base, "release", "storage-scanner");
  const debug = path.join(base, "debug", "storage-scanner");
  if (existsSync(release)) return release;
  if (existsSync(debug)) return debug;
  // Fall back to release path; spawn will surface a clear ENOENT if it's missing.
  return release;
}

const CACHE_DIR = path.join(os.homedir(), "Library", "Caches", "bruhs-storage");
const SNAPSHOT_FILE = path.join(CACHE_DIR, "snapshot.json");

/** How much of the scanner's stderr to keep for error reports. */
const STDERR_TAIL_BYTES = 4096;

async function writeSnapshot(resultJson: string): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(SNAPSHOT_FILE, resultJson, "utf8");
}

/** The cached result line of the last scan, or `null` if no scan has been cached yet. */
export async function readSnapshot(): Promise<string | null> {
  try {
    return await readFile(SNAPSHOT_FILE, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/** Root path of the last cached scan, or `null` if there is none or it's unreadable. */
export async function readSnapshotRoot(): Promise<string | null> {
  const snapshot = await readSnapshot();
  if (snapshot === null) return null;
  try {
    return parseResultEvent(JSON.parse(snapshot))?.root.path ?? null;
  } catch {
    return null; // A corrupt cache file means there's no usable scan.
  }
}

function expandTilde(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function errorLine(event: Omit<ErrorEvent, "type">): Uint8Array {
  return new TextEncoder().encode(
    `${JSON.stringify({ type: "error", ...event })}\n`,
  );
}

/**
 * Spawn `storage-scanner scan` and return its stdout as a web ReadableStream of the raw
 * NDJSON bytes. The final `result` line is captured and written to the snapshot cache.
 *
 * If the scanner can't start, exits non-zero or exits without a result, the stream ends
 * with an extra `{"type":"error",…}` line carrying the exit code and the tail of stderr.
 * Cancelling the stream kills the scanner and detaches every listener, so nothing touches
 * the controller after the consumer has gone.
 */
export function streamScan(
  root: string,
  engine: ScanEngine,
): ReadableStream<Uint8Array> {
  const child = spawn(scannerBin(), [
    "scan",
    "--root",
    expandTilde(root),
    "--engine",
    engine,
  ]);

  let finished = false;
  let tail = "";
  let resultLine = "";
  let stderr = "";

  const detach = () => {
    child.stdout.removeAllListeners("data");
    child.stderr.removeAllListeners("data");
    child.removeAllListeners("error");
    child.removeAllListeners("close");
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const finish = (failure: Omit<ErrorEvent, "type"> | null) => {
        if (finished) return;
        finished = true;
        detach();
        if (failure) controller.enqueue(errorLine(failure));
        controller.close();
      };

      child.stdout.on("data", (chunk: Buffer) => {
        controller.enqueue(chunk);
        // Track complete lines to capture the final result for caching.
        tail += chunk.toString("utf8");
        let idx = tail.indexOf("\n");
        while (idx >= 0) {
          const line = tail.slice(0, idx);
          tail = tail.slice(idx + 1);
          if (line.startsWith('{"type":"result"')) resultLine = line;
          idx = tail.indexOf("\n");
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = (stderr + chunk.toString("utf8")).slice(-STDERR_TAIL_BYTES);
      });
      child.on("error", (err) => {
        finish({
          message: `Couldn't start the scanner: ${err.message}`,
          exitCode: null,
          stderr,
        });
      });
      child.on("close", (code, signal) => {
        if (code === 0 && resultLine) {
          // Write the cache before ending the stream: `/api/trash` reads the scanned
          // root from it. Caching is best-effort; the client already has the result.
          writeSnapshot(resultLine)
            .catch((err: unknown) => {
              console.error("storage: couldn't cache the scan snapshot", err);
            })
            .finally(() => finish(null));
          return;
        }
        finish({
          message:
            code === 0
              ? "The scanner finished without a result."
              : `The scanner stopped unexpectedly (${signal ?? `exit code ${code}`}).`,
          exitCode: code,
          stderr,
        });
      });
    },
    cancel() {
      finished = true;
      detach();
      child.kill();
    },
  });
}

/** Spawn `storage-scanner trash` on an already-validated path and parse its outcome. */
export function trashPath(target: string): Promise<TrashResult> {
  return new Promise((resolve) => {
    const child = spawn(scannerBin(), ["trash", "--path", target]);
    let out = "";
    child.stdout.on("data", (c: Buffer) => {
      out += c.toString("utf8");
    });
    const fail = (): void =>
      resolve({
        type: "trash",
        ok: false,
        path: target,
        reason: "scanner_failed",
      });
    child.on("error", fail);
    child.on("close", () => {
      const last = out.trim().split("\n").pop() ?? "";
      try {
        const result = parseTrashResult(JSON.parse(last));
        if (result) {
          resolve(result);
          return;
        }
      } catch {
        // Fall through: unparseable output is a scanner failure.
      }
      fail();
    });
  });
}
