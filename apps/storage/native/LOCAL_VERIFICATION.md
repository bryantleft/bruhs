# Local storage verification

Pith's scanner benchmark checks allocation correctness and records traversal, process memory and saved-index reopening on a disposable fixture. It does not read personal files, request administrator access, or touch the person's Trash.

```sh
pnpm --filter storage build:scanner
pnpm --filter storage benchmark:local --out /tmp/pith-benchmark.json
```

The report records the scanner's SHA-256, source revision and dirty state, Mac model, architecture, OS/build, filesystem and raw measurements. Keep reports from both revisions when assessing a change.

The default fixture contains 4,096 small files in 64 folders, a hard link, an untouched APFS clone when the volume supports one, a sparse file, a mode-000 directory and a symlink to a separate disposable directory. Its expected allocated bytes come from `stat` blocks, unique inodes and the known clone operation. Both bulk and standard traversals, the live index and the saved index must match. Unexpected coverage failures stop the benchmark. Unsupported clone creation and a permission check skipped when running as root are recorded explicitly.

Five measurements per engine alternate order. Adjust `--files`, `--runs` and `--timeout-ms` for a different sample. File creation warms filesystem metadata, and the harness never flushes caches: **first-fixture-scan is not a cold-cache measurement**. Wall time includes process startup, traversal, output and progress-thread shutdown. `/usr/bin/time -l` supplies peak resident bytes and process CPU time. Saved-index timing includes process launch, restoration and the first tree, with no FSEvents replay and no changes between launches.

These measurements do not establish whole-app memory, idle CPU, battery impact, native UI responsiveness, real-volume coverage or a speed advantage over DaisyDisk. Use the same hardware, files, permissions and cache conditions for any comparative claim. Validate background overhead separately with Activity Monitor or Instruments while Pith is idle and while files change.

## Architecture and OS checks

Local builds use the current process architecture; release builds default to universal. Select a different artifact explicitly:

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
PITH_ARCH=universal pnpm build:pith
PITH_ARCH=x86_64 pnpm build:pith
PITH_ARCH=arm64 pnpm build:pith
```

`build:mac` also accepts `--arch native|arm64|x86_64|universal`. The builder compiles the Rust scanner and Swift app for the same requested architectures, joins both scanner slices for a universal build, verifies every bundled executable contains the required architectures, and checks the app and scanner's Mach-O deployment targets against macOS 14 before signing. `Contents/Resources/BuildTargets.json` records the bundle's targets. Missing Rust targets fail with the installation command before a build starts.

Cross-compiling and checking a deployment target establish binary compatibility prerequisites, not runtime compatibility. CI builds on macOS 26 and now runs the packaged app, cleanup check and full smoke test on both `macos-15` (Apple Silicon) and `macos-15-intel`, with an assertion of the actual runtime architecture. These labels follow [GitHub's runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners). The new matrix has not run until these changes are pushed.

Local verification exercised both app slices' sampler probes, with Intel code running under Rosetta on Apple Silicon. Test a signed release on physical Intel hardware and on macOS 14 before advertising those configurations as verified. Check launch, live monitoring, disk mapping, Quick Look, permission recovery, cleanup, Undo and any authenticated maintenance action. macOS privacy restrictions still apply to administrator processes.

## Evidence from this checkout, 2026-11-12

The working tree also contained ongoing MCP and Activity work. Counts below cover that combined checkout; they are not counts of tests introduced by local cleanup alone.

* All 449 Swift tests passed with warnings treated as errors. Coverage includes changed or replaced Trash items, symlink and mount containment, selective deletion, partial failures, Undo invalidation, snapshot/volume changes, universal authorization-script generation, map detail and unreadable-folder comparisons.
* All Rust suites, 302 storage Node tests and both official MCP SDK integration tests passed. Native-renderer TypeScript, Biome, theme checks, generated asset/token checks, native lint, Actionlint and `git diff --check` passed.
* The packaged app's full smoke test passed all 131 checks in 495.9 seconds. The focused `--local-tools-test` passed all six checks on a disposable project and Trash. The ordinary user state and daily-check schedule remained unchanged.
* The native layout audit captured 72 actual renders, including populated cleanup, growth, snapshots and selective deletion screens, in both appearances at normal and largest text sizes. Geometry reported no window overflow. Image review identified a header that could compress its Done control; the shared header now reserves the control's width and lets the subtitle wrap. A rebuilt universal app passed another 72-capture audit, and image review confirmed Done remains visible at the largest text size.
* The universal app and scanner contain arm64 and x86_64 slices with macOS 14 deployment targets. Deep strict signature verification passed for the local ad-hoc bundle and its nested code. Both architecture probes ran; the Intel probe used Rosetta.
* The allocation benchmark passed before and after removing the progress thread's shutdown wait. Reports remain at `/tmp/pith-benchmark-local.json` and `/tmp/pith-benchmark-local-after.json`, with raw samples and their cache limitations. This is evidence for the shutdown fix, not a comparison with DaisyDisk or a whole-app battery claim.

Packaged evidence is at `/tmp/pith-local-final/Pith.app`; JSON reports are `/tmp/pith-local-smoke.json` and `/tmp/pith-local-tools-final.json`. UI captures and geometry are under `/tmp/pith-local-ui-final` and the final header recheck under `/tmp/pith-local-ui-polished`.

The local pnpm launcher could not switch to the configured version because its cached executable returned `ENOEXEC`. Checks were completed with the installed pnpm where possible and the equivalent Node, TypeScript, Swift and Cargo commands directly. The workflow YAML parses and Actionlint passes; the new remote architecture matrix has not run yet.

Real administrator execution, snapshot deletion/thinning, physical Intel hardware, macOS 14, VoiceOver speech and comparative energy/scan benchmarks remain outside this local verification. Authorization scripts were compiled without executing them, snapshot behavior was exercised with injected runners, and the startup APFS inventory was inspected read-only. No personal Trash items or backups were deleted, and no release was published.
