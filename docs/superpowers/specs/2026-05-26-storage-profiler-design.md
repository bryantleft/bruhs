# Storage — local-first disk profiler

**Date:** 2026-05-26
**Status:** Approved (architecture decisions confirmed by user)

## Goal

A macOS app to profile the entire computer's disk usage with strong visualizations,
plus safe (reversible) management of what it finds. Must feel fast — in the spirit of
the Windows "Everything" tool.

## Key decisions

- **Scope:** Analyze + safe delete (move to Trash, with confirmation). No move/compress/dedup in v1.
- **Primary visualization:** Interactive treemap.
- **Scan target:** Whole disk (`/`) by default; folder picker for arbitrary roots.
- **Scan engine:** Rust sidecar binary (`getattrlistbulk` + rayon). Not pure Node.
- **Index:** Fast cold scan + cached snapshot in v1. Live FSEvents incremental updates = Phase 2.

## How "fast" is achieved (research summary)

Windows "Everything" reads the NTFS Master File Table directly and watches the USN journal —
no public macOS equivalent. The proven macOS fast path for disk-usage scanners is the
`getattrlistbulk(2)` syscall, which batches `readdir` + `stat` into one kernel call
(128KB buffer → hundreds of entries per call), combined with parallel traversal across
cores. Reference implementations (`dumac`, `macdirstat`) hit ~6x over `du`
(0.52s vs 3.33s for ~410k files). "Instant on repeat" = cached snapshot + FSEvents (Phase 2).

## Architecture

Two units with a clean process boundary:

```
apps/storage (TanStack Start + React 19)        scanner (Rust binary)
  server fns: scan / trash / loadSnapshot   ──spawn──▶  apps/storage/scanner/
  canvas treemap UI                         ◀─NDJSON──  getattrlistbulk + rayon
  snapshot cache (app cache dir)              stream    inode hardlink dedup
                                                        trash (rust `trash` crate / `trash` CLI)
```

The Rust scanner owns **all** filesystem operations (scan + trash). The web app never
touches `fs` for scanning — it spawns the binary, streams NDJSON, and renders.

### Scanner (`apps/storage/scanner/`, Rust)

- **Interface:** `scanner scan --root <path> [--ndjson]` and `scanner trash --path <path>`.
- **Output (NDJSON, one JSON object per line):**
  - `{"type":"progress","dirs":N,"files":N,"bytes":N}` emitted periodically.
  - `{"type":"error","path":"...","reason":"permission_denied"}` for skipped entries (counted).
  - `{"type":"tree", ...}` final aggregated tree (single line) on completion.
- **Modules:** `walk` (getattrlistbulk FFI + rayon traversal), `model` (FileNode tree),
  `output` (NDJSON serialization), `trash` (delete to Trash), `cli` (arg parsing), `main`.
- **Behaviors:** don't follow symlinks (cycle-safe); skip+count permission-denied; dedup
  hardlinks by inode; sum sizes bottom-up.
- **Fallback:** if `getattrlistbulk` FFI is unavailable, fall back to `std::fs` walk so the
  binary still works (slower). FFI is the fast path.

### Web app (`apps/storage/`, TanStack Start, mirrors `apps/domains`)

- **Server functions:**
  - `scan(root)` — spawns scanner, streams progress + tree to the client.
  - `trashPath(path)` — spawns `scanner trash`.
  - `loadSnapshot()` / `saveSnapshot()` — read/write cached scan from app cache dir.
  - `pickFolder()` / scope detection — default whole-disk.
- **UI components:**
  - `TreemapCanvas` — canvas-rendered squarified treemap (`d3-hierarchy` layout). Renders
    only nodes above a pixel threshold; click to zoom into a folder, breadcrumb to zoom out.
  - `Sidebar` — collapsible folder tree + "largest files" list.
  - `TypeBreakdown` — size-by-file-type bars, colored with the fruit palette.
  - `ScanControls` — folder picker, whole-disk default, live progress bar, rescan.
  - `DeleteDialog` — confirmation modal → trash → in-place tree update.
  - Full-Disk-Access detection: if `/` scan returns mostly permission errors, show a guide
    to System Settings → Privacy & Security → Full Disk Access.
- **Color mapping:** file type → fruit color (media=persimmon, code=blueberry, caches=lychee,
  documents=guava, archives=durian, etc.) via `@bruhs/theme`.

## Data flow

1. UI calls `scan(root)` → server fn spawns `scanner scan --root <root> --ndjson`.
2. Scanner walks with getattrlistbulk + rayon, dedups by inode, emits progress then the tree.
3. Server fn streams NDJSON lines to the client (ReadableStream); UI updates progress bar,
   then renders the treemap from the final tree and writes the snapshot cache.
4. Reopening loads the cached snapshot instantly; "Rescan" repeats step 1.
5. Delete: select node → confirm → `trashPath(path)` → remove node from tree, re-layout.

## Error handling

Permission-denied (skip + count, surface via Full-Disk-Access guide), symlink cycles
(don't follow), hardlinks (inode dedup), scan cancellation, empty/huge trees, binary
missing (build-on-first-run or clear error).

## Testing

- **Rust:** traversal + size aggregation + inode dedup on fixture trees; NDJSON round-trip;
  symlink not followed.
- **TS:** `scan` server fn against a temp dir; deterministic treemap layout for a fixed tree.

## Out of scope (v1, YAGNI)

Duplicate-file finder, compression, move operations, multi-volume/network drives,
Windows/Linux scanners, FSEvents live updates (Phase 2).
