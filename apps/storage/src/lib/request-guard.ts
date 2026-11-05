/// <reference types="node" />
//! Server-only guards for the API routes. The app runs locally with access to the whole
//! disk, so any web page the user visits could otherwise ask it to scan or trash files.
//! This module imports only Node built-ins so `node --test` can load it directly.

import { realpath } from "node:fs/promises";
import path from "node:path";

/**
 * `Host` names only this machine: loopback, or a `*.localhost` name, which browsers
 * resolve to loopback themselves. Any other name could be a DNS-rebinding page: a
 * site whose domain re-resolves to 127.0.0.1, so its requests look same-origin.
 * Page scripts can't set `Host`, unlike `X-Forwarded-Host`, so only `Host` counts.
 */
export function isLoopbackHost(host: string | null): boolean {
  if (host === null) return false;
  let hostname: string;
  try {
    hostname = new URL(`http://${host}`).hostname;
  } catch {
    return false;
  }
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

/**
 * Refuse requests that a browser made on behalf of another site.
 *
 * The request must be addressed to a loopback host (see `isLoopbackHost`). Then browsers
 * send `Sec-Fetch-Site` on every request; only our own pages produce `same-origin`.
 * (`none` means the user typed the URL or opened a bookmark.) Older browsers without it
 * still send `Origin` on cross-origin requests, which must then match the host the
 * request was addressed to. A request with neither header comes from a non-browser
 * client such as curl, which a web page can't drive.
 */
export function isSameOriginRequest(headers: Headers): boolean {
  if (!isLoopbackHost(headers.get("host"))) return false;

  const site = headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin" || site === "none";

  const origin = headers.get("origin");
  if (origin === null) return true;
  const hosts = [headers.get("host"), headers.get("x-forwarded-host")];
  try {
    const originHost = new URL(origin).host;
    return hosts.some((host) => host !== null && host === originHost);
  } catch {
    return false;
  }
}

/**
 * Require `Content-Type: application/json`. A cross-site page can't send that without a
 * CORS preflight, which this server never approves, so a plain form post or `no-cors`
 * fetch can't reach the handler.
 */
export function isJsonRequest(headers: Headers): boolean {
  const type = headers.get("content-type");
  if (type === null) return false;
  return type.split(";")[0]?.trim().toLowerCase() === "application/json";
}

/** Path segment the scanner uses for its synthetic "(smaller items)" nodes. */
const AGGREGATE_SEGMENT = "__other__";

export type TrashTargetRejection =
  | "not_absolute"
  | "no_scan"
  | "aggregate"
  | "not_found"
  | "outside_scan_root"
  | "protected_path";

export type TrashTarget =
  | { ok: true; path: string }
  | { ok: false; reason: TrashTargetRejection };

export interface TrashScope {
  /** Root of the last completed scan, or `null` if there hasn't been one. */
  scanRoot: string | null;
  /** The user's home directory; it and its ancestors are never trashable. */
  home: string;
}

/** `child` is strictly below `parent` (both already absolute and normalised). */
function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

async function realpathOrNull(p: string): Promise<string | null> {
  try {
    return await realpath(p);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return null;
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

/**
 * Decide whether `input` may be moved to the Trash, and return the real path to trash.
 *
 * `..` is collapsed and symlinks in the parent directories are resolved before the
 * check, so neither can escape the scanned root. The final component isn't resolved: a
 * symlink inside the root is trashed as a link, never its target.
 *
 * Refused: anything outside the scanned root, the root itself, top-level directories
 * (`/Users`, `/Applications`, …), the home directory and its ancestors, and the
 * scanner's synthetic aggregate nodes.
 */
export async function resolveTrashTarget(
  input: unknown,
  scope: TrashScope,
): Promise<TrashTarget> {
  if (typeof input !== "string" || !path.isAbsolute(input)) {
    return { ok: false, reason: "not_absolute" };
  }
  if (scope.scanRoot === null) return { ok: false, reason: "no_scan" };

  const normalised = path.resolve(input);
  if (normalised.split(path.sep).includes(AGGREGATE_SEGMENT)) {
    return { ok: false, reason: "aggregate" };
  }

  const parent = await realpathOrNull(path.dirname(normalised));
  if (parent === null) return { ok: false, reason: "not_found" };
  const target = path.join(parent, path.basename(normalised));

  const root = (await realpathOrNull(scope.scanRoot)) ?? scope.scanRoot;
  if (target === root) return { ok: false, reason: "protected_path" };
  if (!isInside(root, target)) {
    return { ok: false, reason: "outside_scan_root" };
  }

  const home = (await realpathOrNull(scope.home)) ?? scope.home;
  const isTopLevel = path.dirname(target) === path.parse(target).root;
  if (isTopLevel || target === home || isInside(target, home)) {
    return { ok: false, reason: "protected_path" };
  }
  return { ok: true, path: target };
}
