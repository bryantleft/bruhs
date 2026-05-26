/// <reference types="node" />
//! Server-only helpers for locating, spawning, and caching the native scanner.
//! Never import this from client code.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

export async function writeSnapshot(resultJson: string): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(SNAPSHOT_FILE, resultJson, "utf8");
}

export async function readSnapshot(): Promise<string | null> {
  try {
    return await readFile(SNAPSHOT_FILE, "utf8");
  } catch {
    return null;
  }
}

/**
 * Spawn `storage-scanner scan` and return its stdout as a web ReadableStream of the raw
 * NDJSON bytes. The final `result` line is captured and written to the snapshot cache.
 */
function expandTilde(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function streamScan(
  root: string,
  engine: "bulk" | "std",
): ReadableStream<Uint8Array> {
  const bin = scannerBin();
  const child = spawn(bin, [
    "scan",
    "--root",
    expandTilde(root),
    "--engine",
    engine,
  ]);

  let tail = "";
  let resultLine = "";

  return new ReadableStream<Uint8Array>({
    start(controller) {
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
      child.stderr.on("data", () => {
        // Scanner diagnostics; ignored for the client stream.
      });
      child.on("error", (err) => controller.error(err));
      child.on("close", async () => {
        if (resultLine) {
          try {
            await writeSnapshot(resultLine);
          } catch {
            // Caching is best-effort.
          }
        }
        controller.close();
      });
    },
    cancel() {
      child.kill();
    },
  });
}

/** Spawn `storage-scanner trash` and resolve with its single JSON output line. */
export function trashPath(target: string): Promise<string> {
  const bin = scannerBin();
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["trash", "--path", target]);
    let out = "";
    child.stdout.on("data", (c: Buffer) => {
      out += c.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", () => resolve(out.trim().split("\n").pop() ?? ""));
  });
}
