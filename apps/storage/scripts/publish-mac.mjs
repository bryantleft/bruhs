#!/usr/bin/env node
/**
 * Publishes the notarized Pith that `release:mac` built: a GitHub release with the download, then that version on top
 * of the Sparkle feed installed copies check. Run it after `release:mac`, from the pushed commit the build came from.
 * With --dry-run it checks everything and writes the signed feed locally, uploading nothing.
 *
 * Signing uses the `pith` EdDSA key in the login keychain, and macOS asks once to let Sparkle's sign_update use it.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  archiveName, archiveURL, compareVersions, currentRelease, FEED_TAG, FEED_URL, feed, feedItem, feedItems, KEY_ACCOUNT, PUBLIC_KEY,
  REPOSITORY, releasePage, releaseTag,
} from "./pith-release.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const dryRun = process.argv.includes("--dry-run");
const tools = path.join(root, "native/.build/artifacts/sparkle/Sparkle/bin");

function run(command, args) {
  const result = attempt(command, args);
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status}):\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
function attempt(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (result.error) throw result.error;
  return result;
}
const plist = (app, key) => run("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, path.join(app, "Contents/Info.plist")]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const { version, notes } = currentRelease(path.join(root, "native/CHANGELOG.md"));
const archive = path.join(root, "native/.build", archiveName(version));
const work = mkdtempSync(path.join(tmpdir(), "pith-publish-"));

// The download: this version, built from a commit GitHub has, notarized, and trusting the key that signs the feed.
if (!existsSync(archive)) throw new Error(`${archive} is missing. Build it first: pnpm --filter storage release:mac`);
run("ditto", ["-x", "-k", archive, work]);
const app = path.join(work, "Pith.app");
if (plist(app, "CFBundleVersion") !== version) {
  throw new Error(`${archiveName(version)} holds Pith ${plist(app, "CFBundleVersion")}, but the changelog's newest is ${version}. Build it again.`);
}
const commit = plist(app, "PithCommit");
if (commit.endsWith("-dirty")) throw new Error(`${archiveName(version)} was built with uncommitted changes. Commit, push and build it again.`);
attempt("git", ["fetch", "--quiet", "origin", "main"]);
if (attempt("git", ["merge-base", "--is-ancestor", commit, "origin/main"]).status !== 0) {
  throw new Error(`${archiveName(version)} was built from ${commit.slice(0, 7)}, which isn't on origin/main. Push it first.`);
}
if (plist(app, "SUPublicEDKey") !== PUBLIC_KEY) throw new Error(`${archiveName(version)} trusts a different update key than PUBLIC_KEY. Build it again.`);
const assessment = attempt("spctl", ["--assess", "--type", "execute", "--verbose=4", app]);
if (assessment.status !== 0 || !assessment.stderr.includes("source=Notarized Developer ID")) {
  throw new Error(`Gatekeeper doesn't accept ${archiveName(version)} as notarized:\n${assessment.stderr}`);
}
run("xcrun", ["stapler", "validate", app]);

// The keychain's key must be the one every installed copy checks updates against.
const keychainKey = run(path.join(tools, "generate_keys"), ["--account", KEY_ACCOUNT, "-p"]);
if (keychainKey !== PUBLIC_KEY) {
  throw new Error(`The keychain's "${KEY_ACCOUNT}" update key isn't the one Pith trusts (PUBLIC_KEY), so installed copies would refuse this update.`);
}

// The feed as published, still signed by that key, so the new version goes on top of what installed copies trust.
const published = attempt("gh", ["release", "view", FEED_TAG, "--repo", REPOSITORY, "--json", "tagName"]).status === 0;
let items = [];
if (published) {
  const folder = path.join(work, "published");
  mkdirSync(folder);
  run("gh", ["release", "download", FEED_TAG, "--repo", REPOSITORY, "--pattern", "appcast.xml", "--dir", folder]);
  const live = path.join(folder, "appcast.xml");
  run(path.join(tools, "sign_update"), ["--account", KEY_ACCOUNT, "--verify", live]);
  items = feedItems(readFileSync(live, "utf8"));
}
if (items.some((entry) => entry.version === version)) throw new Error(`Pith ${version} is published already: ${releasePage(version)}`);
if (items[0] && compareVersions(version, items[0].version) < 0) {
  throw new Error(`The feed already offers ${items[0].version}, newer than ${version}. Add a newer version to native/CHANGELOG.md.`);
}
const length = statSync(archive).size;
// A release the feed doesn't name yet is a publish that stopped between its two uploads; it resumes at the feed, as long
// as the release holds this very download.
const existing = attempt("gh", ["release", "view", releaseTag(version), "--repo", REPOSITORY, "--json", "assets"]);
const released = existing.status === 0;
if (released) {
  const asset = JSON.parse(existing.stdout).assets.find((entry) => entry.name === archiveName(version));
  if (asset?.size !== length) {
    throw new Error(`The release ${releaseTag(version)} exists with a different download than ${archiveName(version)}. Delete it or publish a newer version.`);
  }
  console.log(`${releaseTag(version)} is already on GitHub with this download, so publishing resumes at the feed.`);
}

// Sign the download, then the feed with it on top, and check both signatures before anything leaves this Mac.
const signature = run(path.join(tools, "sign_update"), ["--account", KEY_ACCOUNT, "-p", archive]);
run(path.join(tools, "sign_update"), ["--account", KEY_ACCOUNT, "--verify", archive, signature]);
const feedFile = path.join(work, "appcast.xml");
const item = feedItem({ version, notes, date: new Date(), url: archiveURL(version), length, signature });
writeFileSync(feedFile, feed([item, ...items.map((entry) => entry.xml)]));
run(path.join(tools, "sign_update"), ["--account", KEY_ACCOUNT, feedFile]);
run(path.join(tools, "sign_update"), ["--account", KEY_ACCOUNT, "--verify", feedFile]);
const notesFile = path.join(work, "notes.md");
writeFileSync(notesFile, [...notes, `Pith ${version} needs macOS 14 or later on a Mac with Apple silicon. Download ${archiveName(version)}, ` +
  "open it, and move Pith to the Applications folder. From then on, Pith updates itself."].join("\n\n"));

if (dryRun) {
  console.log(`Dry run: Pith ${version} from ${commit.slice(0, 7)} is ready to publish, and nothing was uploaded.\n` +
    `The signed feed is ${feedFile}, the release notes ${notesFile}.`);
  process.exit(0);
}

// The download goes up before the feed names it, so no installed copy is ever offered a missing file.
if (!released) {
  run("gh", ["release", "create", releaseTag(version), archive, "--repo", REPOSITORY, "--target", commit, "--title", `Pith ${version}`,
    "--notes-file", notesFile, "--latest"]);
}
if (published) {
  run("gh", ["release", "upload", FEED_TAG, feedFile, "--repo", REPOSITORY, "--clobber"]);
} else {
  // A pre-release, so it never becomes the repository's latest release, which is the version people download.
  run("gh", ["release", "create", FEED_TAG, feedFile, "--repo", REPOSITORY, "--target", commit, "--title", "Pith update feed",
    "--notes", "Installed copies of Pith check appcast.xml here for new versions. To download Pith, open the newest Pith release.",
    "--prerelease", "--latest=false"]);
}

// What installed copies will see: the feed as signed here, and the download at the length the feed gives.
const expected = readFileSync(feedFile, "utf8");
for (let tries = 0; ; tries++) {
  const live = attempt("curl", ["-fsSL", FEED_URL]);
  if (live.status === 0 && live.stdout === expected) break;
  if (tries === 12) throw new Error(`${FEED_URL} doesn't serve the feed just uploaded, a minute on. Check the ${FEED_TAG} release.`);
  await sleep(5000);
}
const download = run("curl", ["-fsSL", "-o", "/dev/null", "-w", "%{size_download}", archiveURL(version)]);
if (Number(download) !== length) throw new Error(`${archiveURL(version)} served ${download} bytes, not ${length}.`);
console.log(`Published Pith ${version}: ${releasePage(version)}\nInstalled copies find it at their next check, through ${FEED_URL}.`);
