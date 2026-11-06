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
