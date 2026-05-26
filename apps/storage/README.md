# Storage

A local-first disk-usage profiler for macOS. Scans your disk fast (via the
`getattrlistbulk` syscall + parallel traversal — in the spirit of the "Everything" tool),
renders an interactive treemap of what's eating space, and lets you move space-hogs to the
Trash (reversible, with Put-Back).

## Architecture

Two units with a clean process boundary:

- **`scanner/`** — a Rust binary (`storage-scanner`) that does all filesystem work. It uses
  `getattrlistbulk` (128 KB buffer, batched readdir+stat) and `rayon` for parallel traversal,
  dedups hardlinks by inode, and never follows symlinks. It streams NDJSON: repeated
  `progress` events, then one `result` event with a pruned treemap tree, the largest files,
  and a summary. It also handles `trash` (move to Trash).
- **`src/`** — a TanStack Start + React app. API routes spawn the scanner and stream its
  output to the browser; the UI renders a canvas treemap (`d3-hierarchy` squarified layout,
  cushion shading, fruit-palette colors), a type breakdown, and a largest-files list.

## Develop

```bash
# from the repo root
pnpm dev:storage        # dev server on http://localhost:3001
pnpm check:storage      # biome lint + format check
```

The scanner is built automatically by `pnpm build`. To build it on its own:

```bash
cargo build --release --manifest-path scanner/Cargo.toml
cargo test --manifest-path scanner/Cargo.toml
```

The app prefers the release binary and falls back to the debug build.

## Whole-disk scans & Full Disk Access

Scanning `/` reads files your terminal can't see by default. macOS will silently skip those
(the app shows how many were skipped). To scan everything, grant **Full Disk Access** to your
terminal in *System Settings → Privacy & Security → Full Disk Access*, then rescan.

## Caching

The last scan result is cached to `~/Library/Caches/bruhs-storage/snapshot.json` so reopening
the app is instant. Hit **Scan** to refresh. (Live FSEvents incremental updates are a planned
Phase 2 — see `docs/superpowers/specs/2026-05-26-storage-profiler-design.md`.)
