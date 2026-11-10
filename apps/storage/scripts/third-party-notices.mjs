// Pith.app's third-party notices, written from what each build bundles, so the app carries the licence of every piece
// of work by others it ships:
// - the npm packages the disk map's page, pith.js, holds, by the bundler's own list of the modules it took in, which
//   vite.native.config.ts writes beside the page (its minifier drops their legal comments from pith.js);
// - the crates the scanner is built from, by `cargo metadata`'s dependency graph for the Mac it's built for, leaving
//   out what runs only while it's built: build scripts' and procedural macros' crates, and dev-dependencies;
// - Sparkle, from its SwiftPM checkout, whose licence covers the code it bundles too.
// Heroicons and Monaspace aren't packages the build installs, so their notices are kept by hand in
// native/ThirdPartyNotices.txt, which heads the file. A dependency whose licence text can't be found fails the build.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/**
 * Licence texts for crates published without one, by the repository they come from. objc2, objc2-encode and
 * objc2-foundation are on crates.io without a licence file; their repository's LICENSE.md says they're under the MIT
 * license, and the repository holds the MIT text, copied byte for byte into scripts/licenses/objc2-LICENSE-MIT.txt, as
 * LICENSE-MIT.txt since commit ee9a7ada2131f5944b8750428e265c15632f2a19.
 */
export const VENDORED = {
  "https://github.com/madsmtm/objc2": { licence: "MIT", file: path.join(root, "scripts/licenses/objc2-LICENSE-MIT.txt") },
};

/** A file that holds a licence text: LICENSE, LICENCE, COPYING, UNLICENSE or NOTICE, with any extension or suffix. */
const LICENCE_FILE = /^(licen[cs]e|copying|unlicense|notice)([-._].*)?$/i;

/**
 * The folder of the npm package a module the bundler took in belongs to, or null for a module of Pith's own. It's the
 * deepest node_modules folder on the module's path, a scoped package's name included, as pnpm nests them
 * (node_modules/.pnpm/react@19.3.1/node_modules/react). A virtual module's leading NUL and a query are dropped first.
 */
export function packageOf(module) {
  const file = module.replace(/^\0/, "").replace(/\?.*$/, "");
  const marker = `${path.sep}node_modules${path.sep}`;
  const at = file.lastIndexOf(marker);
  if (at < 0) return null;
  const rest = file.slice(at + marker.length).split(path.sep);
  const name = rest[0]?.startsWith("@") ? rest.slice(0, 2) : rest.slice(0, 1);
  if (name.length === 0 || name.some((part) => part === "" || part === ".pnpm")) return null;
  return path.join(file.slice(0, at + marker.length), ...name);
}

/** The licence files in `folder`, by name. */
export function licenceFiles(folder) {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && LICENCE_FILE.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

/**
 * The licence files that give `expression`, an SPDX licence expression such as "MIT OR Apache-2.0", from `files`. Where
 * the expression offers the MIT licence and a file is named for it, that one, since anyone may take a package offered
 * under several licences under any one of them; otherwise every licence file it has. Empty when it has none.
 */
export function chooseLicence(expression, files) {
  const offers = (expression ?? "").split(/\s+OR\s+/i).map((choice) => choice.replace(/[()]/g, "").trim());
  const mit = files.filter((file) => /mit/i.test(file));
  if (offers.includes("MIT") && mit.length > 0 && !/\bAND\b/i.test(expression ?? "")) return [mit[0]];
  return files;
}

/**
 * The crates a binary built from `metadata` (`cargo metadata --format-version 1 --filter-platform <target>`) is made
 * of: every package its root depends on as a normal dependency, then theirs, but for procedural macros, which run only
 * while it's built, and what they alone depend on. Build-dependencies and dev-dependencies don't ship either. The
 * root, Pith's own scanner, is left out.
 */
export function shippedCrates(metadata) {
  const packages = new Map(metadata.packages.map((item) => [item.id, item]));
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const rootID = metadata.resolve.root;
  const isMacro = (item) => item.targets.some((target) => target.kind.includes("proc-macro"));
  const shipped = new Set();
  const waiting = [rootID];
  while (waiting.length > 0) {
    const id = waiting.pop();
    for (const dependency of nodes.get(id)?.deps ?? []) {
      if (!dependency.dep_kinds.some((kind) => kind.kind === null)) continue;
      const item = packages.get(dependency.pkg);
      if (!item || isMacro(item) || shipped.has(item.id)) continue;
      shipped.add(item.id);
      waiting.push(item.id);
    }
  }
  return [...shipped].map((id) => packages.get(id)).sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

/**
 * A package's notice: its name and version, where it comes from, and its licence text, from its own files, or from
 * `vendored` for a package published without one. Throws when there's none, which stops the build.
 * @param {{ name: string, version: string, home?: string, folder: string, licence?: string, vendored?: string }} item
 */
export function noticeOf({ name, version, home, folder, licence, vendored }) {
  const chosen = chooseLicence(licence, licenceFiles(folder));
  const texts = chosen.map((file) => readFileSync(path.join(folder, file), "utf8").trim());
  if (texts.length === 0 && vendored) texts.push(readFileSync(vendored, "utf8").trim());
  if (texts.length === 0) {
    throw new Error(`${name} ${version} ships no licence file in ${folder}, so Pith's third-party notices can't carry its licence (${licence ?? "none declared"}). ` +
      "Add its licence text to scripts/licenses and to VENDORED in scripts/third-party-notices.mjs.");
  }
  return [`${name} ${version}`, home, "", texts.join("\n\n")].filter((line) => line !== undefined && line !== null).join("\n");
}

/** Where a package says it comes from, as a plain address. */
function homeOf(repository, homepage) {
  const address = typeof repository === "string" ? repository : repository?.url;
  const plain = (address ?? homepage ?? "").replace(/^git\+/, "").replace(/\.git$/, "").replace(/^git:\/\//, "https://");
  return plain || undefined;
}

/** The npm packages pith.js holds, from the bundler's list of the modules it took in, each once. */
export function pagePackages(modules) {
  const folders = [...new Set(modules.map(packageOf).filter((folder) => folder !== null))];
  return folders
    .map((folder) => {
      const manifest = JSON.parse(readFileSync(path.join(folder, "package.json"), "utf8"));
      return { name: manifest.name, version: manifest.version, home: homeOf(manifest.repository, manifest.homepage), folder, licence: manifest.license };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The scanner's crates, from `cargo metadata` for the Mac building it. */
function scannerCrates(manifest) {
  const host = spawnSync("rustc", ["-vV"], { encoding: "utf8" }).stdout?.match(/^host: (.+)$/m)?.[1];
  if (!host) throw new Error("rustc didn't say which target it builds for, so the scanner's crates can't be listed.");
  const result = spawnSync("cargo", ["metadata", "--format-version", "1", "--locked", "--filter-platform", host, "--manifest-path", manifest],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`cargo metadata failed: ${result.stderr}`);
  return shippedCrates(JSON.parse(result.stdout)).map((item) => ({
    name: item.name,
    version: item.version,
    home: item.repository ?? item.homepage ?? undefined,
    folder: path.dirname(item.manifest_path),
    licence: item.license,
    vendored: VENDORED[(item.repository ?? "").replace(/\.git$/, "")]?.file,
  }));
}

/** Sparkle as Pith pins it, from its SwiftPM checkout. */
function sparkle(native) {
  const pins = JSON.parse(readFileSync(path.join(native, "Package.resolved"), "utf8")).pins ?? [];
  const pin = pins.find((item) => item.identity === "sparkle");
  if (!pin) throw new Error("native/Package.resolved pins no Sparkle, so its notice can't be written.");
  const folder = [path.join(native, ".build/checkouts/Sparkle"), path.join(native, ".build/artifacts/sparkle/Sparkle")].find((place) => licenceFiles(place).length > 0);
  if (!folder) throw new Error("Sparkle's SwiftPM checkout has no LICENSE. Build the Swift package first, so SwiftPM checks Sparkle out.");
  return { name: "Sparkle", version: pin.state.version, home: "https://sparkle-project.org", folder, licence: "MIT" };
}

/**
 * The notices for a build whose page took in `modules`: the hand-kept notices, then the page's packages, the scanner's
 * crates and Sparkle, each with its licence text.
 */
export function notices({ modules, native = path.join(root, "native"), scanner = path.join(root, "scanner/Cargo.toml") }) {
  const kept = readFileSync(path.join(native, "ThirdPartyNotices.txt"), "utf8").trimEnd();
  const page = pagePackages(modules);
  if (page.length === 0) throw new Error("The bundler's list of modules names no npm package, though pith.js is built with React.");
  const groups = [
    ["The disk map's page", "pith.js, the page Pith draws the disk map in, holds these packages from npm.", page],
    ["The disk scanner", "storage-scanner, which maps the disk, is built from these Rust crates.", scannerCrates(scanner)],
    ["Sparkle", "Pith updates itself with Sparkle. Its licence also covers the code by others that Sparkle bundles.", [sparkle(native)]],
  ];
  const written = groups.map(([title, about, items]) => [title, "", about, "", items.map(noticeOf).join("\n\n\n")].join("\n"));
  return `${[kept, ...written].join("\n\n\n")}\n`;
}

/** Writes the notices for a build whose page's modules are listed in `modulesFile` to `out`. */
export function writeNotices({ modulesFile, out }) {
  const modules = JSON.parse(readFileSync(modulesFile, "utf8"));
  writeFileSync(out, notices({ modules }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const option = (name) => process.argv[process.argv.indexOf(name) + 1];
  if (!process.argv.includes("--modules") || !process.argv.includes("--out")) {
    throw new Error("Usage: node scripts/third-party-notices.mjs --modules native/.build/web-modules.json --out <file>");
  }
  writeNotices({ modulesFile: option("--modules"), out: option("--out") });
}
