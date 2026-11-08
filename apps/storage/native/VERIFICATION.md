# Local verification: Pith 0.1.0

Verified on 2026-11-05 on Apple Silicon, macOS 26.3, with Xcode 26.6 / Swift 6.3.3.

## Passed

- **Native:** 16 Swift tests, including real CPU-time comparison against `getrusage`, positive live footprints, Mach host-port reference stability, history retention/PID reuse, protocol validation, Trash scope and symlink checks, real Rust scan decoding, cancellation/reuse and stderr diagnostics.
- **Existing web app:** 18 request-guard tests, Biome, theme lint, native-renderer TypeScript checks and the full TanStack/Vite build.
- **Rust:** all 4 scanner integration tests.
- **Packaging:** release app build and strict code-signature verification of the app and bundled scanner. No new third-party dependencies.
- **Packaged UI:** all 12 smoke checks passed in the actual native app and WKWebView: native metrics, own-process counters, pause, scan, treemap, bundled fonts, accessible map, selection bridge, rejected remote navigation, menu opening, web-view release and continued monitoring after closing Disk. The diagnostic exited successfully.
- **Manual native UI:** search filtered to Pith, selection opened individual process counters, live CPU and nonzero memory readings appeared, and Command-Q exited the app. The native table avoids the reentrant-update warning encountered with SwiftUI Table.

## Resource sample

A fresh packaged instance with all windows closed was observed for 15.05 seconds after initialization: **53.38 MiB physical footprint** and **1.831% of one CPU core**. This is a short local observation, not a steady-state energy budget or a result for full ten-minute history. The app was left running in the menu bar.

## Before public release

- Developer ID signing and notarization; the local bundle is ad-hoc signed.
- Older macOS/Intel compatibility, sustained history and process-churn profiling, and validated energy/wakeup measurements.
- Physical sleep/wake testing and manual verification of login registration and Full Disk Access grants. Automated tests do not change these settings.
- Individual process drill-down is live; app-level history is retained for the running session. Name clearance and persistent history remain future work.

The macOS CI job is configured to test, package and verify signatures, but these changes have not been pushed and no remote CI result is claimed.

## 2026-11-06: UI redesign

Verified on the same Mac (macOS 26.3, Xcode 26.6, Swift 6.3.3) after the redesign: system chrome with Bruhs content, one window with Activity and Disk tabs, range ranking, the inspector, the bruh-slice icon, and colours generated from the theme for light, dark and Increase Contrast.

- **Native:** all 72 Swift tests pass with warnings as errors.
- **Web and theme:** 71 node tests, Biome, TypeScript, both theme lints, the Swift token and brand drift checks, `lint-native.mjs`, and `verify-tokens.mjs` (102 colours inside Display P3, 17 roles meeting their contrast in all four appearances).
- **Packaged UI:** all 23 smoke checks pass. The new ones cover bundled fonts and the SVG menu bar glyph, toolbar bridging, process identity, range ranking, Escape back to live, tab switching, window release and the panel fitting its content. The pause check now waits longer than a sampling interval, and the font check requires the map's Monaspace Neon face to load.
- **Move to Trash:** a 1 MB scratch file selected and trashed through the packaged app's own Disk tab left its folder through Finder, with no permission prompt, and the scan refreshed to empty.
- **Appearance:** dark was checked in the running app, and light and dark in offscreen renders of the real Activity views and in a headless browser for the Disk map. Increased contrast is checked by the contrast tests, not by eye.

**Resource sample:** after 45 seconds of warm-up with all windows closed, a fresh packaged instance used **1.27% of one CPU core** over 60 seconds, with a **68 MB physical footprint** (81 MB peak). Caching process identities and bundle paths between samples, and asking for free disk space only while the panel is open, brought this down from 2.80% for the same build without them. This is a short local observation, not a steady-state energy budget.

## 2026-11-06: menu panel cutoff

The menu panel now has a stable, scrollable viewport sized for the status item's own display. Hosting-controller automatic resizing is disabled so incoming app rows cannot grow the popover above the screen. Smaller displays reduce the viewport height rather than cutting off the content.

All 19 native tests pass, including normal, short and secondary-display layout cases. All 14 packaged-app smoke checks pass. The real popover kept the same height before and after live data populated, and its full window frame remained inside its display bounds. The updated local bundle was rebuilt and its signature verified.

## 2026-11-07: audit fixes

Verified on the same Mac after working through the feature-gap and UX audit (`reports/Pith feature gaps and UX audit.md`, kept out of git).

- **Scanner:** 15 Rust tests. A scan of `/` now reports 870.6 GB in 41.5 s on a disk whose APFS container uses 904.0 GB, against 1,794 GB in 85.9 s before. The rest is Recovery (unmounted), 488 folders macOS wouldn't let it read with Full Disk Access off, and snapshots, which the Disk tab's Where the space is breakdown accounts for. Preboot, Update and VM are measured from their own used space (10.07 GB, 19 MB and 24 KB, matching `diskutil apfs list`).
- **Native:** all Swift tests pass with warnings as errors, including real-scanner decoding, file-identity Trash protection at the home folder's `/System/Volumes/Data` path, scan editing for Trash and Undo, memory, tiers, power, history buckets, search filters, signer and free-now reads.
- **Web and theme:** 77 node tests, Biome, TypeScript, both theme lints, the Swift token and brand drift checks, `lint-native.mjs` (now also PithCore and escaped dashes) and `verify-tokens.mjs` (21 roles; tertiary text now meets 4.5:1).
- **Appearance:** the new Disk, panel, Settings, welcome and Activity views were checked in offscreen renders of the real views, light and dark.

**Packaged UI:** all 27 smoke checks pass, three of them new live checks from the audit. Command-X in Activity's search field cut through the Edit menu, but Command-Z left the field empty: SwiftUI's search field keeps its own undo manager and resets the field from Activity's search after an undo, so Activity now keeps the search's undo steps itself. Selecting a block shrank the map by 41 px, because the selection bar appeared under it, so the second click of a double-click could land elsewhere; the bar is now always there and describes the open folder until something is selected. The panel already followed the system's appearance. The inspector's resize cursor now pops exactly what it pushes; that one needs a real pointer to see, so it wasn't observed.

## 2026-11-07: clones, frees now and changes since a scan

- **Cost of reading clones:** a single-threaded probe of pnpm's 1-million-file store read the clone ID, sharing flags and group size in bulk for almost nothing, but the 10-thread scanner paid more: on a folder of pnpm projects (892,000 files, nearly all clones) the flags and the group size each added about 40% kernel time. Scans read the clone ID and flags only; the group size and private size are read just for a selection. A scan of `/` went from 873.3 GB in 41.9 to 43.9 s to 828.1 GB in 48.2 to 49.1 s, with 2,172,636 clone files (45.3 GB) counted once.
- **Frees now:** `bruhs/node_modules` shows 1.18 GB on its own but frees 6.4 MB, because its files are clones of pnpm's store; that measure took 0.8 s for 88,188 files.
- **Tests:** 20 Rust tests (clones counted once by either engine, a changed clone counted in full, a folder scanned again within its map, frees with clones and hard links inside and outside), now run by `check:pith`. 120 Swift tests, including a real FSEvents watch of a change by another process, refresh targets, saved-scan round trips and the version gate on remembered sizes. 78 node tests.
- **Packaged UI:** all 30 smoke checks pass, three new: the bundled scanner measures the selection, FSEvents notices a file another process adds, and Refresh catches the map up. The smoke test no longer saves its fixture as the last scan.
- **Appearance:** offscreen renders of the selection bar at 820, 900 and 1,100 points, light and dark. With every figure showing, the buttons were cut to "Quick…"; now the figures give way, Files first, then Clones, and a long path truncates in its middle.
- **Folders scanned again:** a scan of one folder can't see the rest of the map, so `node_modules` scanned alone counted its clones again (1.18 GB). Pith now passes the map's root with `--within`, and the scanner looks up each group's original by its clone ID, which is the original's inode (`fsgetpath`, 6.3 µs a lookup): an original elsewhere on the map keeps the bytes. `node_modules` scanned again within `/` shows 0.01 GB, as the full scan does, in 1.1 s instead of 0.5 s.


## 2026-11-07: who wrote, launches, network by app, Shortcuts

- **Network by app:** NetworkStatistics loads without privileges. Its first count for a connection is everything it ever moved, so the first two seconds read 17,137,026 KB grown against 21 KB across every interface. Connections already open now start from their first report: 13 KB against 20 KB, the rest being headers and traffic outside sockets. Counts were also a sample late, so each sample asks for fresh ones and waits: 5.1 ms median and 7.6 ms at most over 40 reads, against a 250 ms limit. A live test moves 4 MiB over loopback inside the test process and reads back exactly 8,388,608 bytes, both ends counted.
- **Activity width:** offscreen renders at 1,180, 1,100 and 820 points, light and dark. At 1,100 with the inspector open the seventh column was cut off with no way to reach it, as the last column already was in narrower windows. The table now scrolls sideways when its figures don't fit, and a new window opens at 1,180, wide enough for every column beside the inspector.
- **Saved maps:** reopening a kept map in a second model, as the next launch does, brought back a folder Refresh had just caught up, because the map was saved with the event ID its scan began at. A save now records the last change delivered and the folders still to catch up, and Pith opens on the newest saved map, so the `lastScanRoot` default is gone. FSEvents' marker that a replay is done carried the starting ID in four runs and a later one in another, so it doesn't move the position. The smoke test also kept its fixture's folder sizes in the user's Scans folder, since only saving the map was off; everything it keeps now goes in a temporary folder.
- **Shortcuts:** the built bundle's `Metadata.appintents` lists the four actions and five phrases, and `build-mac.mjs` fails when one is missing. They haven't been run from Shortcuts or Siri here.
- **Writers and launches:** Disk's growth note with the apps that wrote the most, rendered in a headless browser, light and dark. Launch markers rendered on the CPU chart at T3 Code's launch and the start of League of Legends' spike.
- **Tests:** 20 Rust tests. 129 Swift tests, new ones covering the loopback count, network in the listing, ranges and CSV, saved changes and older saved maps, the newest saved map, the watcher's event IDs, and writes and launches in history. 78 node tests.
- **Packaged UI:** all 34 smoke checks pass, four new: Bigger Text zooms the map, and the saved map reopens, stays caught up after Refresh and follows a change after. `map_keeps_size_on_select` failed once the text-size check ran between its two readings, since the second was taken zoomed; it now reads the map first.

## 2026-11-07: Developer ID release

- **Signing:** `release:mac` signed the app and its scanner with the Developer ID Application certificate, the hardened runtime and Apple's timestamp, with no keychain prompt. `codesign --verify --deep --strict` passes.
- **Notarization:** all three submissions were accepted, and the stapled ticket validates.
- **Gatekeeper:** `spctl` accepts the app as Notarized Developer ID, and accepts a copy unpacked from `Pith.zip` (5.2 MB) with the quarantine flag a browser download adds.
- **Packaged UI:** all 35 smoke checks pass on the notarized build. The new one confirms network by app works under the hardened runtime. On the first launch of the newly signed build the map's height read 0, measured before it was laid out, so the check now waits for the height to settle.
- **Not checked:** Intel Macs, macOS before 26.3, and Finder's first-launch dialog for a downloaded copy.

## 2026-11-07: live figures, history cost and a duplication audit

- **Live figures:** Pith samples every second while Activity is on screen or the panel is open, and every two seconds otherwise. In the notarized build the smoke checks measured samples 1.16 s apart with Activity open and 2.10 s once it closed; the extra tenth is the sample itself.
- **History cost:** appending a sample tested every reading of every app for expiry. With ten minutes of history for 300 apps that took 5.7 ms at a sample every two seconds and 11.1 ms at one a second, against 0.4 ms while young. Counting the expired readings from the front takes 0.8 and 1.1 ms. Side by side over the same minutes, menu bar only, the old and new builds used 530 and 540 ms of CPU in the first minute, and 1,010 and 720 ms in the twelfth.
- **Closed panel:** it kept its SwiftUI tree after closing and redrew with every sample; closing now releases it.
- **Audit:** offscreen renders of every native screen, light and dark, and the disk map in headless Chrome with a fresh scan of this repository. Removed the range's times from the window subtitle, "Ranked by average CPU", "Last elevated" under Activity's chart (VoiceOver still hears it), the System card's figures and busiest list, a second "protected" count, the one-row process list of a single-process app (its PID moved to the facts), the paused panel's extra "Paused" labels, and Scan Startup Disk above the list of disks before a first scan. The search prompt no longer cuts off at the default width.
- **Signer:** code Pith couldn't read, such as an executable deleted since it started, read "Not signed"; it now has no Signed by row.
- **Tests:** 131 Swift tests, new ones for the expiry boundary and unreadable code. 20 Rust tests and 78 node tests. All 37 smoke checks pass on the notarized build, two of them new for the cadence.

## 2026-11-08: motion that answers at once

- **Rules:** ease-out for anything entering or leaving, UI motion under 300 ms, strong custom curves, faster spinners, and no animation on keyboard actions.
- **Changed:** the inspector slides on a strong ease-out both ways, in 150 ms as before; the standard curve's slow start read as a delay. Escape closes it at once. The menu panel opens and closes without a fade, as a menu does, by click or shortcut. macOS's spinner turns at a speed Pith can't set, so the scan shows the bruhs spinner instead: a ring turning every 0.75 s, 1.5 s with Reduce Motion, run by Core Animation (checked offscreen: `transform.rotation.z`, 0.75 s, repeating), rendered light and dark.
- **Already right:** the disk map's hover colours (80 to 150 ms), live charts and the table, which jump to new figures rather than animate, and folder navigation, which is instant. Nothing in Pith uses an ease-in curve now.
- **Packaged UI:** all 37 smoke checks pass on the notarized build; 131 Swift tests.

## 2026-11-08: live figures that roll

- **Change:** Pith's live figures roll to each new reading as a live price does: only the digits that change move, up as the number rises and down as it falls, on a strong ease-out that settles within 250 ms. The panel's CPU readout, its averages, tiers, memory, busiest apps and free space roll, as do Activity's Now, Avg and Peak, the inspector's figures and its process list, and the System card's facts. Reduce Motion crossfades instead. The menu bar figure and Activity's table stay still: a table of a hundred figures rolling every second reads as noise, and constant motion in the menu bar draws the eye all day.
- **Packaged UI:** all 37 smoke checks pass on the notarized build, three runs out of three. Earlier runs failed the panel and search checks while someone typed in another app: macOS 14 won't let a background-launched app become active then, so a transient panel closes and the search field can't take a key. The same build with the roll turned off passed three of three under the same conditions as the build with it.

## 2026-11-08: figures that spin, at no cost

- **Cost:** with the panel open and a reading every second, SwiftUI's numericText roll used 25.9 s of CPU a minute against 2.0 s for still figures; animating only the headline cost as much (26.9 s), as did digit wheels drawn by SwiftUI, in the panel's tree (44.9 s, then 28.1 s animating only their offsets) or in hosts of their own (28.6 s). A profile showed why: each frame AppKit laid the window out again and SwiftUI updated the panel's whole graph. The roll came out, then the wheels moved to Core Animation: 1,675 ms against 1,678 ms for still figures, side by side over the same minute.
- **Fidelity:** at rest the figures sit where SwiftUI's text did, light and dark, at the same colour and mean brightness (within 0.1 of 255 at small sizes once drawn with font smoothing); what differs is antialiasing between the two rasterizers. Hosted AppKit views align by their bottom edge in SwiftUI, so the view gives its baselines; rounding its width up stood right-aligned rows a point to the left, so it lays out at the exact width.
- **Motion:** checked by the animations the view adds, not by eye: 10% to 13% spins the ones three steps up on a spring settling in 0.65 s, and an unchanged place doesn't move. Earlier SwiftUI captures of the same design showed the shape: 9.9% to 10% spins the ones from 9 to 0 while the point and tenths go, and the tens rise in a beat later.
- **Tests:** 135 Swift tests, four new for how a figure splits by place and which way each wheel turns. All 37 smoke checks pass on the notarized build.
