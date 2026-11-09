#!/usr/bin/env node
/**
 * Proves an installed Pith updates itself. It builds a throwaway 0.0.1 and 0.0.2 under a bundle id of their own, signed
 * with the Developer ID but a test EdDSA key, and serves 0.0.2 in a signed feed from this Mac, at 127.0.0.1 (Sparkle
 * downloads only over HTTP or HTTPS). It opens 0.0.1 with automatic updates on, waits for Sparkle to download, verify
 * and unpack 0.0.2, quits 0.0.1, and checks that Sparkle replaced it with a valid 0.0.2. The real app, its settings and
 * data, and the keychain's update key are left alone.
 *
 * It takes a few minutes, and a second Pith shows in the menu bar while it runs. Run it after changing how Pith is
 * built or signed, or when Sparkle changes version.
 */
import { spawn, spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { copyFileSync, createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { feed, feedItem } from "./pith-release.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const work = path.join(root, "native/.build/update-test");
const bundleID = "app.bruhs.pith.updatetest";
const signUpdate = path.join(root, "native/.build/artifacts/sparkle/Sparkle/bin/sign_update");
const [from, to] = ["0.0.1", "0.0.2"];

function run(command, args, { env, capture = true } = {}) {
  const result = spawnSync(command, args, { cwd: root, env: { ...process.env, ...env }, encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status}):\n${result.stderr || result.stdout}`);
  return result.stdout?.trim() ?? "";
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(what, seconds, check) {
  for (const deadline = Date.now() + seconds * 1000; Date.now() < deadline; await sleep(500)) if (check()) return;
  throw new Error(`Gave up after ${seconds} s waiting for ${what}.`);
}
const versionOf = (app) => run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleVersion", path.join(app, "Contents/Info.plist")]);
const installers = () => spawnSync("pgrep", ["-x", "Autoupdate"], { encoding: "utf8" }).stdout.trim();

function cleanUp() {
  spawnSync("pkill", ["-f", path.join(work, "installed/Pith.app")]);
  spawnSync("defaults", ["delete", bundleID]);
  for (const folder of ["Library/Caches", "Library/HTTPStorages", "Library/WebKit", "Library/Saved Application State"]) {
    rmSync(path.join(homedir(), folder, folder.endsWith("State") ? `${bundleID}.savedState` : bundleID), { recursive: true, force: true });
  }
  const lsregister = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
  for (const app of [`${from}/Pith.app`, `${to}/Pith.app`, "installed/Pith.app"]) spawnSync(lsregister, ["-u", path.join(work, app)]);
}

rmSync(work, { recursive: true, force: true });
const served = path.join(work, "feed");
mkdirSync(served, { recursive: true });
cleanUp();

// The feed and download, served from this Mac only.
const server = createServer((request, response) => {
  const file = path.join(served, path.basename(new URL(request.url, "http://127.0.0.1").pathname));
  if (!existsSync(file)) return response.writeHead(404).end();
  response.writeHead(200, { "Content-Length": statSync(file).size, "Content-Type": "application/octet-stream" });
  createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

// A throwaway Ed25519 key. sign_update reads the private seed as base64 from a file; Sparkle wants the public key in base64.
const key = generateKeyPairSync("ed25519").privateKey.export({ format: "jwk" });
const keyFile = path.join(work, "test-key");
writeFileSync(keyFile, Buffer.from(key.d, "base64url").toString("base64"), { mode: 0o600 });
const publicKey = Buffer.from(key.x, "base64url").toString("base64");
const feedFile = path.join(served, "appcast.xml");

for (const version of [from, to]) {
  console.log(`Building the test Pith ${version}…`);
  run("node", ["scripts/build-mac.mjs", "--release"], {
    env: { PITH_BUNDLE_ID: bundleID, PITH_VERSION: version, PITH_PUBLIC_KEY: publicKey, PITH_FEED_URL: `${base}/appcast.xml`,
      PITH_NOTARIZE: "0", PITH_OUT: path.join(work, version) },
  });
}

// The feed offers 0.0.2, signed as publishing signs the real one, but with the test key.
const archive = path.join(served, `Pith-${to}.zip`);
copyFileSync(path.join(work, to, `Pith-${to}.zip`), archive);
const signature = run(signUpdate, ["--ed-key-file", keyFile, "-p", archive]);
writeFileSync(feedFile, feed([feedItem({ version: to, notes: ["A test update."], date: new Date(), url: `${base}/Pith-${to}.zip`,
  length: statSync(archive).size, signature, page: "https://example.com/pith" })]));
run(signUpdate, ["--ed-key-file", keyFile, feedFile]);
run(signUpdate, ["--ed-key-file", keyFile, "--verify", feedFile]);

// The installed copy is 0.0.1 in a folder of its own. Its settings: automatic checks and installs already allowed, last
// checked a day ago so Sparkle checks at once, the welcome seen, and no remembered scans, so it never reads the real ones.
const installed = path.join(work, "installed/Pith.app");
run("ditto", [path.join(work, from, "Pith.app"), installed]);
const dayAgo = new Date(Date.now() - 86_460_000).toISOString().replace("T", " ").replace(/\.\d+Z$/, " +0000");
for (const [name, type, value] of [["SUEnableAutomaticChecks", "-bool", "YES"], ["SUAutomaticallyUpdate", "-bool", "YES"],
  ["SUHasLaunchedBefore", "-bool", "YES"], ["SULastCheckTime", "-date", dayAgo], ["welcomeSeen", "-bool", "YES"], ["remembersScans", "-bool", "NO"]]) {
  run("defaults", ["write", bundleID, name, type, value]);
}

let output = "";
try {
  if (installers()) throw new Error("Another Sparkle installer (Autoupdate) is running, so this test couldn't tell which is Pith's. Try again after it ends.");
  console.log(`Opening the test Pith ${from}, which should find ${to} in the feed…`);
  const pith = spawn(path.join(installed, "Contents/MacOS/Pith"), [], { stdio: ["ignore", "pipe", "pipe"] });
  pith.stdout.on("data", (data) => { output += data; });
  pith.stderr.on("data", (data) => { output += data; });
  const exited = new Promise((resolve) => pith.on("exit", resolve));
  // Sparkle starts its installer once the update is downloaded, verified and unpacked; it then waits for Pith to quit.
  await until("Sparkle's installer to start", 120, () => installers() !== "");
  console.log("Sparkle prepared the update. Quitting the test Pith so it installs…");
  pith.kill("SIGTERM");
  await exited;
  await until(`the installed copy to become ${to}`, 90, () => versionOf(installed) === to && installers() === "");
  run("codesign", ["--verify", "--deep", "--strict", installed]);
  const quarantined = spawnSync("xattr", ["-p", "com.apple.quarantine", installed]).status === 0;
  if (quarantined) throw new Error("The installed update is quarantined, so Gatekeeper would stop it at the next launch.");
  console.log(`Passed: Sparkle replaced Pith ${from} with ${to}, which verifies.`);
} catch (error) {
  console.error(`Failed: ${error.message}`);
  console.error(`Installed copy is ${versionOf(installed)}. The test Pith printed:\n${output.slice(-4000)}`);
  const log = spawnSync("log", ["show", "--last", "5m", "--style", "compact", "--predicate", 'subsystem BEGINSWITH "org.sparkle-project"'], { encoding: "utf8" });
  console.error(`Sparkle logged:\n${(log.stdout || log.stderr).slice(-6000)}`);
  process.exitCode = 1;
} finally {
  cleanUp();
  server.close();
  console.log(`The builds and feed are in ${work}.`);
}
