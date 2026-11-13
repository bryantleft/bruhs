// Metadata-only measurements of Pith's scanner on a disposable, reproducible file tree.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { chmod, copyFile, link, lstat, mkdir, mkdtemp, open, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const storage = fileURLToPath(new URL("..", import.meta.url));

export function benchmarkOptions(args) {
  const values = new Map();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i], value = args[i + 1];
    if (!["--out", "--scanner", "--files", "--runs", "--timeout-ms"].includes(key) || value === undefined || value.startsWith("--") || values.has(key)) {
      throw new Error("Usage: node scripts/benchmark-local.mjs --out <report.json> [--scanner <binary>] [--files <count>] [--runs <count>] [--timeout-ms <deadline>]");
    }
    values.set(key, value);
  }
  if (!values.get("--out")) throw new Error("--out <report.json> is required; the benchmark writes no report into the checkout by default.");
  const integer = (key, fallback, minimum) => {
    const value = Number(values.get(key) ?? fallback);
    if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${key} must be an integer of at least ${minimum}.`);
    return value;
  };
  return {
    out: path.resolve(values.get("--out")), scanner: path.resolve(values.get("--scanner") ?? path.join(storage, "scanner/target/release/storage-scanner")),
    // Sample dimensions, rather than production limits: 4,096 files expose traversal overhead without a large disk write.
    files: integer("--files", 4096, 1), runs: integer("--runs", 5, 2),
    // A harness watchdog for one command, configurable for slow test volumes. It is never a scanner timeout.
    timeoutMs: integer("--timeout-ms", 60_000, 1),
  };
}

export function measurementSummary(runs) {
  if (!runs.length || runs.some((run) => !Number.isFinite(run) || run < 0)) throw new Error("Measurements must be a nonempty list of finite nonnegative milliseconds.");
  const ordered = runs.toSorted((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return { minimum: ordered[0], median: ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2, maximum: ordered.at(-1) };
}

export function timeUsage(stderr) {
  const peak = stderr.match(/(\d+)\s+maximum resident set size/);
  const cpu = stderr.match(/([\d.]+)\s+real\s+([\d.]+)\s+user\s+([\d.]+)\s+sys/);
  return { peakResidentBytes: peak ? Number(peak[1]) : null, userSeconds: cpu ? Number(cpu[2]) : null, systemSeconds: cpu ? Number(cpu[3]) : null };
}

export function assertFixtureResult(result, expected) {
  if (result?.type !== "result" || !result.summary || !result.root) throw new Error("The scanner returned no complete result.");
  if (result.summary.bytes !== expected.allocatedBytes || result.root.size !== expected.allocatedBytes) {
    throw new Error(`Allocation accounting failed: scan=${result.summary.bytes}, map=${result.root.size}, expected=${expected.allocatedBytes} bytes. Hard links, clones and sparse allocation must be counted correctly.`);
  }
  if (expected.denied && result.summary.unreadable.denied < 1) throw new Error("The unreadable fixture folder was not reported as permission denied.");
  if (result.summary.entryErrors || result.summary.unreadable.other || result.summary.unreadable.protected) throw new Error("The fixture scan has unexpected coverage gaps.");
}

/** Builds only under `scratch`, including the symlink's destination, and returns independent stat-based allocation. */
export async function benchmarkFixture(scratch, fileCount) {
  const root = path.join(scratch, "fixture");
  await mkdir(root);
  const files = [];
  const groupCount = Math.min(64, fileCount);
  for (let group = 0; group < groupCount; group++) await mkdir(path.join(root, `group-${group}`));
  const payload = Buffer.alloc(1024, 0x5a);
  for (let i = 0; i < fileCount; i++) {
    const file = path.join(root, `group-${i % groupCount}`, `file-${i}.bin`);
    await writeFile(file, payload);
    files.push(file);
  }
  const original = path.join(root, "original.bin"), hardlink = path.join(root, "hardlink.bin");
  await writeFile(original, Buffer.alloc(2 * 1024 * 1024, 0x6b));
  await link(original, hardlink);
  files.push(original, hardlink);
  const sparse = path.join(root, "sparse.bin");
  const handle = await open(sparse, "w");
  try {
    await handle.truncate(1024 * 1024 * 1024);
    await handle.write(Buffer.alloc(4096, 0x7c), 0, 4096, 1024 * 1024 * 1024 - 4096);
  } finally { await handle.close(); }
  files.push(sparse);
  const cloneSource = path.join(root, "clone-source.bin"), clone = path.join(root, "clone.bin");
  await writeFile(cloneSource, Buffer.alloc(2 * 1024 * 1024, 0x38));
  files.push(cloneSource);
  let cloneStatus;
  try {
    if (process.platform === "darwin") {
      // libuv's COPYFILE_FICLONE_FORCE returns ENOSYS on this Mac even on APFS. Apple's cp -c calls clonefile(2).
      const copied = spawnSync("/bin/cp", ["-c", cloneSource, clone], { encoding: "utf8", env: { ...process.env, LC_ALL: "C" } });
      if (copied.error) throw copied.error;
      if (copied.status !== 0) {
        const error = new Error(copied.stderr.trim());
        if (/not supported|cross-device|not implemented/i.test(error.message)) error.code = "ENOTSUP";
        throw error;
      }
    } else await copyFile(cloneSource, clone, constants.COPYFILE_FICLONE_FORCE);
    cloneStatus = { supported: true, reason: "A forced filesystem clone succeeded; the untouched copy shares its source's blocks." };
  } catch (error) {
    if (!["ENOTSUP", "EOPNOTSUPP", "EXDEV", "EINVAL", "ENOSYS"].includes(error.code)) throw error;
    cloneStatus = { supported: false, reason: `${error.code}: this test volume cannot make a clone.` };
    await rm(clone, { force: true });
  }
  const outside = path.join(scratch, "outside");
  await mkdir(outside);
  await writeFile(path.join(outside, "must-not-count.bin"), Buffer.alloc(32 * 1024));
  await symlink(outside, path.join(root, "outside-link"));
  const denied = path.join(root, "permission-denied");
  await mkdir(denied);
  const deniedFile = path.join(denied, "must-not-read.bin");
  await writeFile(deniedFile, Buffer.alloc(16 * 1024));
  const checkDenied = process.getuid() !== 0;
  if (checkDenied) await chmod(denied, 0);
  else files.push(deniedFile);
  let allocatedBytes = 0, logicalBytes = 0;
  const inodes = new Set();
  for (const file of files) {
    const info = await lstat(file);
    const identity = `${info.dev}:${info.ino}`;
    if (inodes.has(identity)) continue;
    inodes.add(identity);
    allocatedBytes += info.blocks * 512;
    logicalBytes += info.size;
  }
  return {
    root, expected: { allocatedBytes, denied: checkDenied },
    description: { generatedFiles: fileCount, groups: groupCount, logicalBytes, allocatedBytes, clone: cloneStatus,
      hardlink: true, sparse: (await stat(sparse)).blocks * 512 < (await stat(sparse)).size,
      unreadable: checkDenied ? "A mode-000 folder must be reported and excluded." : "Skipped: uid 0 can read mode-000 folders.",
      symlink: "Points to a separate fixture directory whose bytes must be excluded." },
    restorePermissions: async () => chmod(denied, 0o700),
  };
}

async function runScan(scanner, root, engine, timeoutMs) {
  const start = performance.now();
  const child = spawn("/usr/bin/time", ["-l", scanner, "scan", "--root", root, "--engine", engine], { stdio: ["ignore", "pipe", "pipe"] });
  const lines = createInterface({ input: child.stdout });
  let result, stderr = "", failure;
  lines.on("line", (line) => {
    try {
      const value = JSON.parse(line);
      if (value.type === "result") result = value;
      if (value.type === "fatal") failure = new Error(value.reason);
    } catch (error) { failure = error; child.kill(); }
  });
  child.stderr.setEncoding("utf8").on("data", (data) => { stderr += data; });
  const watchdog = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
  try {
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
    if (code !== 0 || failure || !result) throw failure ?? new Error(`Scanner ${engine} exited ${code}. ${stderr.trim()} Increase --timeout-ms if this volume needs longer.`);
    return { result, metrics: { wallMs: performance.now() - start, scannerElapsedMs: result.summary.elapsedMs, ...timeUsage(stderr) } };
  } finally { clearTimeout(watchdog); lines.close(); }
}

/** Scoped stdin/stdout protocol client. A failed or timed-out request kills its own disposable scanner. */
function liveClient(scanner, timeoutMs) {
  const start = performance.now();
  const child = spawn(scanner, ["serve"], { stdio: ["pipe", "pipe", "pipe"] });
  const lines = createInterface({ input: child.stdout });
  const buffered = [], waiting = new Set();
  let failure, stderr = "";
  function fail(error) {
    failure = error;
    for (const entry of waiting) entry.reject(error);
    waiting.clear();
    child.kill("SIGKILL");
  }
  lines.on("line", (line) => {
    let value;
    try { value = JSON.parse(line); } catch (error) { fail(error); return; }
    if (value.type === "error" || value.type === "fatal") { fail(new Error(value.reason ?? JSON.stringify(value))); return; }
    const entry = [...waiting].find((entry) => entry.accepts(value));
    if (entry) { waiting.delete(entry); entry.resolve(value); } else buffered.push(value);
  });
  child.stderr.setEncoding("utf8").on("data", (data) => { stderr += data; });
  child.once("error", fail);
  child.stdin.on("error", fail);
  child.once("exit", (code) => { if (waiting.size) fail(new Error(`Live scanner exited ${code}: ${stderr}`)); });
  const closed = new Promise((resolve) => child.once("close", resolve));
  async function wait(accepts) {
    if (failure) throw failure;
    const index = buffered.findIndex(accepts);
    if (index >= 0) return buffered.splice(index, 1)[0];
    let entry, watchdog;
    try {
      return await new Promise((resolve, reject) => {
        entry = { accepts, resolve, reject };
        waiting.add(entry);
        watchdog = setTimeout(() => fail(new Error(`Live scanner exceeded ${timeoutMs} ms. Increase --timeout-ms for a slower volume. ${stderr}`)), timeoutMs);
      });
    } finally { clearTimeout(watchdog); waiting.delete(entry); }
  }
  return { start, wait, send: (command) => child.stdin.write(`${JSON.stringify(command)}\n`), close: async () => { child.stdin.end(); await closed; lines.close(); }, kill: () => child.kill("SIGKILL") };
}

async function benchmarkLive(scanner, fixture, scratch, timeoutMs) {
  const snapshot = path.join(scratch, "map.index");
  let client = liveClient(scanner, timeoutMs);
  try {
    client.send({ cmd: "open", root: fixture.root, snapshot, volume: "pith-benchmark-fixture" });
    const opened = await client.wait((line) => line.type === "opened");
    if (opened.restored) throw new Error("A disposable fixture unexpectedly restored an existing index.");
    client.send({ cmd: "walk", since: 0 });
    const walked = await client.wait((line) => line.type === "walked");
    if (walked.bytes !== fixture.expected.allocatedBytes) throw new Error(`Live walk counted ${walked.bytes}, expected ${fixture.expected.allocatedBytes}.`);
    client.send({ cmd: "tree", path: fixture.root, request: 1 });
    const firstTree = await client.wait((line) => line.type === "tree" && line.request === 1);
    assertFixtureResult(firstTree.result, fixture.expected);
    const initialStartupToTreeMs = performance.now() - client.start;
    client.send({ cmd: "save" });
    const saved = await client.wait((line) => line.type === "saved");
    await client.close();
    client = liveClient(scanner, timeoutMs);
    client.send({ cmd: "open", root: fixture.root, snapshot, volume: "pith-benchmark-fixture" });
    const reopened = await client.wait((line) => line.type === "opened");
    if (!reopened.restored) throw new Error(`The saved live index wasn't restored: ${reopened.reason}`);
    client.send({ cmd: "tree", path: fixture.root, request: 2 });
    const tree = await client.wait((line) => line.type === "tree" && line.request === 2);
    assertFixtureResult(tree.result, fixture.expected);
    const restoredStartupToTreeMs = performance.now() - client.start;
    client.send({ cmd: "stats" });
    const stats = await client.wait((line) => line.type === "stats");
    return { initialStartupToTreeMs, restoredStartupToTreeMs, initialWalkMs: walked.ms, savedBytes: saved.bytes, saveMs: saved.ms,
      restoredWithoutWalk: reopened.restored, restoredStats: stats,
      scope: "Measures process launch, saved-index load and first tree. No FSEvents replay or native app launch is included; fixture stays unchanged." };
  } finally { await client.close(); }
}

function commandOutput(command, args, input) {
  const result = spawnSync(command, args, { encoding: "utf8", input });
  if (result.error || result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.error?.message ?? result.stderr}`);
  return result.stdout.trim();
}

function fileSystemOf(folder) {
  const device = commandOutput("df", ["-P", folder]).split("\n").at(-1).trim().split(/\s+/)[0];
  const info = JSON.parse(commandOutput("plutil", ["-convert", "json", "-o", "-", "--", "-"], commandOutput("diskutil", ["info", "-plist", device])));
  return { type: info.FilesystemType, personality: info.FileSystemPersonality, solidState: info.SolidState, deviceBlockBytes: info.DeviceBlockSize };
}

export async function benchmark(options) {
  if (process.platform !== "darwin") throw new Error("This benchmark requires macOS because allocation, clone and live-index behavior are platform-specific.");
  await stat(options.scanner);
  const scratch = await mkdtemp(path.join(os.tmpdir(), "pith-benchmark-"));
  let fixture;
  try {
    fixture = await benchmarkFixture(scratch, options.files);
    const scans = [];
    // Interleave engines to avoid giving one engine all early runs. The first fixture scan is explicitly marked.
    for (let repetition = 0; repetition < options.runs; repetition++) {
      for (const engine of repetition % 2 ? ["std", "bulk"] : ["bulk", "std"]) {
        const { result, metrics } = await runScan(options.scanner, fixture.root, engine, options.timeoutMs);
        assertFixtureResult(result, fixture.expected);
        scans.push({ engine, repetition, cacheState: scans.length ? "repeated-fixture-scan" : "first-fixture-scan", ...metrics });
      }
    }
    const live = await benchmarkLive(options.scanner, fixture, scratch, options.timeoutMs);
    const summary = Object.fromEntries(["bulk", "std"].map((engine) => [engine, measurementSummary(scans.filter((run) => run.engine === engine).map((run) => run.wallMs))]));
    const revision = commandOutput("git", ["-C", storage, "rev-parse", "HEAD"]);
    return {
      schemaVersion: 1, measuredAt: new Date().toISOString(), revision, dirty: Boolean(commandOutput("git", ["-C", storage, "status", "--porcelain", "--", "."])),
      machine: { architecture: os.arch(), cpu: os.cpus()[0]?.model, logicalCPUs: os.cpus().length, totalMemory: os.totalmem(),
        osVersion: commandOutput("sw_vers", ["-productVersion"]), osBuild: commandOutput("sw_vers", ["-buildVersion"]), node: process.version,
        rust: commandOutput("rustc", ["-V"]), fileSystem: fileSystemOf(fixture.root) },
      scanner: { path: options.scanner, sha256: createHash("sha256").update(await readFile(options.scanner)).digest("hex"),
        architectures: commandOutput("xcrun", ["lipo", "-archs", options.scanner]).split(/\s+/) },
      methodology: { runsPerEngine: options.runs, cache: "Filesystem caches are not flushed. Fixture creation warms metadata; first-fixture-scan is not a cold-cache result.",
        timing: "wallMs includes process launch, traversal, progress-thread shutdown and serialization. scannerElapsedMs is the scanner's narrower internal timer.",
        memory: "Peak resident bytes and CPU seconds come from /usr/bin/time -l for each scan process.",
        privacy: "Only generated fixture metadata is scanned. Nothing is downloaded, sent, trashed, or deleted outside the disposable fixture.",
        limitations: "This is a scanner/index harness, not whole-app battery, idle monitoring, native UI latency, real-volume coverage or a DaisyDisk benchmark." },
      fixture: fixture.description, correctness: { passed: true, checks: ["allocated blocks", "hard links counted once", "clone counted once when supported", "sparse allocation", "symlinks excluded", "permission gaps explicit", "both traversal engines", "live index", "saved-index restore"] },
      scans, wallMs: summary, live,
    };
  } finally {
    await fixture?.restorePermissions();
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = benchmarkOptions(process.argv.slice(2));
    const report = await benchmark(options);
    await mkdir(path.dirname(options.out), { recursive: true });
    await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Verified local allocation and saved-index restoration. Report: ${options.out}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
