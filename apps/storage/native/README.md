# Pith for Mac

Pith is the native menu bar version of Storage. It combines current activity, ten minutes of session history, and the existing Rust disk scanner and React treemap. The name is provisional.

## Build and open

From the repository root on a Mac with Xcode 26 or later, Rust, Node and pnpm installed. The command-line tools alone aren't enough: the app icon is an Icon Composer package, which only Xcode 26's `actool` compiles.

```sh
pnpm build:pith
pnpm open:pith
```

The app is at `apps/storage/native/.build/Pith.app`. You can drag it to Applications. It is built for the current Mac's architecture, targets macOS 14+, and has been run locally on Apple Silicon/macOS 26.3. Older macOS versions and Intel need their own verification before release.

The local build is ad-hoc signed, including the bundled scanner, with hardened runtime enabled. It is **not Developer ID signed or notarized**. Public distribution needs a stable signing identity, notarization and independent compatibility testing. Rebuilding the ad-hoc app can invalidate existing privacy grants; grant Full Disk Access to the final installed app when a partial scan requires it.

## Use

- The menu bar shows the bruh-slice glyph and system CPU. While memory pressure is elevated or critical, its symbol appears in its status colour, also in icon-only mode.
- Click the item for the panel: CPU and memory pressure over the last ten minutes, the busiest apps, and free space on the startup disk. Click an app to open it in Activity, or the disk row to open Disk. Settings and Quit are under the ⋯ button.
- Activity and Disk are tabs of one window (⌘1 and ⌘2). Activity lists apps with live CPU, memory and disk writes; search with ⌘F and include apps that quit in the last ten minutes from the filter menu. Drag across the CPU chart to rank apps by that time instead of now, and press Escape or Back to Live to return. The inspector (⌥⌘I) shows the selected app's history, processes, path, and Reveal in Finder and Quit.
- Disk scans the startup disk or a folder you choose. Larger blocks occupy more space and their colour shows the kind of file. Select a block or largest-file entry, double-click a folder to explore, or use the accessible item list with the keyboard.
- Move to Trash is a native, confirmed action on an entry from the current scan. Protected paths and paths escaping the scan root are rejected. Finder's Put Back restores trashed files. A successful move refreshes the scan.
- Closing the window keeps monitoring. Quit ends monitoring and clears session history. Login startup and icon-only mode are opt-in in Settings. Reopen the app from Finder to recover Activity if macOS hides the menu bar item.
- Pith follows the system appearance: light, dark and Increase Contrast.

## Logo

Pith's mark is the bruh mascot as a lemon slice. `scripts/brand.mjs` generates everything in `Brand/` from the bruhs colour tokens and the shared mascot geometry (`packages/ui/src/lib/logo.ts`):

- `AppIcon.icon`: the Icon Composer app icon, with the slice and the face as separate layers so macOS can render its light, dark, clear and tinted styles.
- `StatusGlyph.svg`: the menu bar template image.
- `pith-mark.svg` and `pith-wordmark.svg`: the mark and the wordmark (the mark plus "pith" in Monaspace Krypton, outlined).

After changing a token or the mascot, run `node scripts/brand.mjs` in `apps/storage` and commit the result. `pnpm check:pith` fails while `Brand/` is out of date. You can open `AppIcon.icon` in Icon Composer to preview it, but edits made there are overwritten the next time the generator runs.

## Data and architecture

SwiftUI/AppKit owns the menu bar, Activity window, sampler, history, folder picker and file actions, including Move to Trash and its Undo. Rust runs only during a requested scan. The disk renderer reuses the existing React components in a WKWebView created when Disk first opens, kept while the window is open so the map keeps its place across tabs, and released on close. It ships as static local assets with no Node server, listening socket, remote page, telemetry or network dependency.

The scanner stays on the scanned folder's file system and counts the startup disk's firmlinked folders (`/Users`, `/Applications` and the rest of `/usr/share/firmlinks`) once, at their visible paths, rather than again under `/System/Volumes/Data`. Volumes mounted inside a scan are shown as blocks sized from their own used space when they share the scanned disk (Preboot, VM) and are otherwise left out. It turns off iCloud downloads for its own process before reading anything, counts files that aren't downloaded without opening them, and keeps every folder it can't read in the result with its reason. Move to Trash refuses the system's top-level folders, the home folder and its vital folders by file identity, so no path can reach them.

APFS clones count once. Files that share every block (`EF_SHARES_ALL_BLOCKS`) and the same clone ID form a group, and its bytes count at the copy made first, the lowest inode, whichever order the parallel walk reaches them in. Folders report the bytes of their other copies as clones. Clones changed since they were made share only some blocks and still count at every copy. Selecting an item asks the scanner what deleting it frees now: each file's private size (`ATTR_CMNEXT_PRIVATESIZE`), plus clone groups and hard-linked files whose every copy is inside it. Reading private sizes costs about half again a listing, so a scan never does.

After a scan, Pith follows the scanned folder with FSEvents from the event ID the scan began at, and marks the folders that changed; Refresh scans only those again, or the whole folder when FSEvents lost track or more than 24 changed. A folder scanned again is scanned `--within` the map, so clone groups whose original lies elsewhere on it stay counted there. With Remember scans on, the last map is kept in `~/Library/Application Support/Pith/Scans` with that event ID and the volume's FSEvents UUID. At the next launch Pith opens on it and replays what changed since; a different volume UUID marks the whole map out of date. Pith's own moves to the Trash don't count as changes.

System CPU uses deltas of host CPU ticks, also split by core tier (`hw.perflevelN`). Process CPU uses libproc time counters converted from Mach units with `mach_timebase_info`, then divided by measured elapsed time and active core count; the undivided rate marks a process holding a whole core. Power is the change in each process's `ri_energy_nj` (rusage v6), labelled an estimate. Memory composition and swap come from `host_statistics64` and `vm.swapusage`, network throughput from `NET_RT_IFLIST2`, GPU use from IOAccelerator statistics, and keep-awake reasons from `IOPMCopyAssertionsByProcess`. A live regression test compares this result to `getrusage` process CPU time. Memory is the sum of member processes' physical footprints, **not unique RAM**; shared pages can be counted more than once. The undocumented memory-pressure sysctl is capability checked, with unknown values shown as unavailable. Protected processes are explicitly counted as unavailable rather than assigned zero usage.

Helpers are grouped only when their executable bundle and process ancestry establish the same owner. Process identities include their start times, which Quit and Force Quit check again just before signalling, since macOS reuses PIDs. App history retains sample-time membership, CPU, footprints, power and read/write counter rates. Individual process counters are a live drill-down. The live history is in memory, lasts ten minutes and expires against continuous monotonic time across sleep. With Keep a week of history turned on in Settings, Pith also keeps 30-second buckets for six hours and 5-minute buckets for seven days, each with its busiest apps, in `~/Library/Application Support/Pith/history.json`. Sampling pauses during sleep and restarts with a fresh baseline. Missing counters and gaps remain visible.

The two-second cadence follows measured warm native sampling: a median of 5.5 ms per sample on 2026-11-07, with memory, tiers, power, network, GPU, battery and sleep assertions included, across roughly 790 processes on the development Mac. This is a sampling-cost measurement, not a whole-app CPU or energy guarantee.

Temperature sensors, privileged process control, fan control and automatic cleanup are outside this build: they need a root helper or a private interface that breaks across releases.

## Verification

```sh
pnpm --filter storage build:scanner
pnpm check:pith
pnpm check:storage
cargo test --manifest-path apps/storage/scanner/Cargo.toml
```

Swift tests cover rate resets, positive live footprints, CPU units, PID reuse, exited-app retention, Unicode protocol chunks, wrong protocol versions, bridge origin/frame checks, Trash containment and final-component symlinks, real Rust scan decoding, subprocess cancellation/reuse, and stderr diagnostics. The CI Mac job also packages and verifies the local app signature.

For a desktop smoke test, provide a disposable folder containing at least one file:

```sh
apps/storage/native/.build/Pith.app/Contents/MacOS/Pith \
  --smoke-test /absolute/path/to/fixture /tmp/pith-verification.json
```

This opens real native windows and runs the bundled Rust scanner and WKWebView. It verifies metrics, the panel's size and fit, pause/resume, toolbar bridging, range ranking and Escape, tab switching, rendering, fonts, selection, remote-navigation rejection, and web-view and window release, then quits. It does not trash files or change login/privacy settings. `--activity` opens Activity; `--scan /absolute/path` opens Disk and scans that path; `--probe` prints sampler timings and its own footprint without creating a UI.
