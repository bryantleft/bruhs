import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
function run(command, args, capture = false) {
  const result = spawnSync(command, args, { cwd: root, stdio: capture ? "pipe" : "inherit", encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr ?? "see output above"}`);
  return result.stdout?.trim();
}

if (process.platform !== "darwin") throw new Error("The Pith app requires macOS and Xcode command-line tools.");
// A release is signed with a Developer ID, notarized and stapled, so it opens on any Mac. Other builds are signed ad hoc,
// which needs no keychain access and runs only where it was built.
const release = process.argv.includes("--release");
const identity = release ? developerID() : "-";
run("cargo", ["build", "--release", "--manifest-path", "scanner/Cargo.toml"]);
run("pnpm", ["exec", "bruhs-theme-fonts"]);
run("pnpm", ["exec", "vite", "build", "--config", "vite.native.config.ts"]);
const build = path.join(root, "native/.build");
// App Intents: the compiler records the values of types conforming to these protocols, which Xcode's
// appintentsmetadataprocessor turns into the bundle's Metadata.appintents. Xcode does both itself; SwiftPM needs asking.
const intentProtocols = path.join(build, "appintents-protocols.json");
mkdirSync(build, { recursive: true });
writeFileSync(intentProtocols, JSON.stringify(["AppIntent", "EntityQuery", "AppEntity", "TransientEntity", "AppEnum", "AppShortcutProviding",
  "AppShortcutsProvider", "AnyResolverProviding", "AppIntentsPackage", "DynamicOptionsProvider"]));
const constValues = ["-Xswiftc", "-emit-const-values", "-Xswiftc", "-Xfrontend", "-Xswiftc", "-const-gather-protocols-file", "-Xswiftc", "-Xfrontend", "-Xswiftc", intentProtocols];
run("swift", ["build", "-c", "release", "--package-path", "native", "-Xswiftc", "-warnings-as-errors", ...constValues]);
const bin = run("swift", ["build", "-c", "release", "--package-path", "native", "--show-bin-path"], true);

/** Every Swift file of the Pith target, which the metadata processor reads alongside the compiler's values. */
function swiftSources(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(folder, entry.name);
    return entry.isDirectory() ? swiftSources(full) : entry.name.endsWith(".swift") ? [full] : [];
  });
}
const staging = mkdtempSync(path.join(build, "bundle-"));
const app = path.join(staging, "Pith.app");
const macos = path.join(app, "Contents/MacOS");
const resources = path.join(app, "Contents/Resources");
mkdirSync(macos, { recursive: true }); mkdirSync(resources, { recursive: true });
try {
  cpSync(path.join(bin, "Pith"), path.join(macos, "Pith"));
  cpSync(path.join(root, "scanner/target/release/storage-scanner"), path.join(macos, "storage-scanner"));
  cpSync(path.join(build, "web"), path.join(resources, "web"), { recursive: true });
  cpSync(path.join(root, "native-web/index.html"), path.join(resources, "web/index.html"));
  cpSync(path.join(root, "public/fonts"), path.join(resources, "web/fonts"), { recursive: true });
  // The app icon is an Icon Composer package, which only Xcode 26's actool understands.
  const actool = run("xcrun", ["actool", "--version"], true);
  const major = Number(actool.match(/<key>short-bundle-version<\/key>\s*<string>(\d+)/)?.[1]);
  if (!(major >= 26)) throw new Error(`Pith's icon needs actool from Xcode 26 or later (found ${major || "none"}). Select it with \`sudo xcode-select -s /Applications/Xcode.app\`.`);
  run("xcrun", ["actool", path.join(root, "native/Brand/AppIcon.icon"), "--compile", resources, "--platform", "macosx", "--minimum-deployment-target", "14.0", "--app-icon", "AppIcon", "--output-partial-info-plist", path.join(staging, "icon.plist"), "--errors", "--warnings"], true);
  for (const compiled of ["Assets.car", "AppIcon.icns"]) {
    if (!existsSync(path.join(resources, compiled))) throw new Error(`actool did not produce ${compiled} from native/Brand/AppIcon.icon.`);
  }
  cpSync(path.join(root, "native/Brand/StatusGlyph.svg"), path.join(resources, "StatusGlyph.svg"));
  writeFileSync(path.join(app, "Contents/Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>Pith</string>
<key>CFBundleIdentifier</key><string>app.bruhs.pith</string>
<key>CFBundleName</key><string>Pith</string>
<key>CFBundleDisplayName</key><string>Pith</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>CFBundleIconName</key><string>AppIcon</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>LSUIElement</key><true/>
<key>LSApplicationCategoryType</key><string>public.app-category.utilities</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>\n`);
  // Shortcuts and Siri find Pith's actions through Metadata.appintents, then its phrases through the training data.
  const constValueFile = path.join(bin, "Pith.build/Pith.swiftconstvalues");
  if (!existsSync(constValueFile)) throw new Error(`The compiler didn't write ${constValueFile}, which App Intents metadata needs.`);
  writeFileSync(path.join(staging, "sources.txt"), `${swiftSources(path.join(root, "native/Sources/Pith")).join("\n")}\n`);
  writeFileSync(path.join(staging, "constvalues.txt"), `${constValueFile}\n`);
  const toolchain = path.dirname(path.dirname(path.dirname(run("xcrun", ["--find", "swiftc"], true))));
  const xcodeBuild = run("xcodebuild", ["-version"], true).match(/Build version (\S+)/)?.[1];
  if (!xcodeBuild) throw new Error("xcodebuild -version didn't name a build, which App Intents metadata records.");
  const arch = run("uname", ["-m"], true);
  run("xcrun", ["appintentsmetadataprocessor", "--output", resources, "--toolchain-dir", toolchain, "--module-name", "Pith",
    "--sdk-root", run("xcrun", ["--show-sdk-path"], true), "--xcode-version", xcodeBuild, "--platform-family", "macOS",
    "--deployment-target", "14.0", "--target-triple", `${arch}-apple-macos14.0`,
    "--source-file-list", path.join(staging, "sources.txt"), "--swift-const-vals-list", path.join(staging, "constvalues.txt")], true);
  const metadata = path.join(resources, "Metadata.appintents");
  mkdirSync(path.join(staging, "phrases"));
  run("xcrun", ["appintentsnltrainingprocessor", "--extracted-metadata-path", metadata, "--infoplist-path", path.join(app, "Contents/Info.plist"),
    "--temp-dir-path", path.join(staging, "phrases"), "--bundle-id", "app.bruhs.pith", "--product-path", resources], true);
  // A tripwire: an action missing here is one Shortcuts never shows.
  const actions = Object.keys(JSON.parse(readFileSync(path.join(metadata, "extract.actionsdata"), "utf8")).actions ?? {});
  for (const action of ["GetBusiestAppsIntent", "GetMemoryPressureIntent", "ShowActivityIntent", "ScanFolderIntent"]) {
    if (!actions.includes(action)) throw new Error(`Metadata.appintents is missing ${action} (found ${actions.join(", ") || "none"}).`);
  }
  // Notarization requires the hardened runtime and Apple's secure timestamp on every executable.
  for (const target of [path.join(macos, "storage-scanner"), app]) {
    run("codesign", ["--force", "--sign", identity, "--options", "runtime", release ? "--timestamp" : "--timestamp=none", target]);
  }
  const output = path.join(build, "Pith.app");
  rmSync(output, { recursive: true, force: true });
  renameSync(app, output);
  if (release) {
    const download = notarize(output);
    console.log(`Built ${output}\nSigned with ${identity}, notarized and stapled. The download is ${download}.`);
  } else {
    console.log(`Built ${output}\nSigned ad hoc for this Mac. Run with --release to sign with Developer ID and notarize.`);
  }
} finally { rmSync(staging, { recursive: true, force: true }); }

/** The Developer ID Application identity a release is signed with: PITH_SIGN_IDENTITY, or the keychain's only one. */
function developerID() {
  if (process.env.PITH_SIGN_IDENTITY) return process.env.PITH_SIGN_IDENTITY;
  const identities = run("security", ["find-identity", "-v", "-p", "codesigning"], true)
    .split("\n")
    .map((line) => /"(Developer ID Application: [^"]+)"/.exec(line)?.[1])
    .filter(Boolean);
  if (identities.length !== 1) {
    throw new Error(`A release is signed with a Developer ID Application certificate, and the keychain has ${identities.length}. ` +
      "Create one in Xcode > Settings > Accounts > Manage Certificates, or set PITH_SIGN_IDENTITY to choose one.");
  }
  return identities[0];
}

/**
 * Sends the signed app to Apple's notary service, staples the ticket so it opens offline too, checks Gatekeeper accepts
 * it, and zips it for download. The credentials are a notarytool keychain profile, `pith-notary` unless
 * PITH_NOTARY_PROFILE names another.
 */
function notarize(app) {
  const profile = process.env.PITH_NOTARY_PROFILE ?? "pith-notary";
  const archive = path.join(build, "Pith.zip");
  rmSync(archive, { force: true });
  run("ditto", ["-c", "-k", "--keepParent", app, archive]);
  const submit = spawnSync("xcrun", ["notarytool", "submit", archive, "--keychain-profile", profile, "--wait", "--output-format", "json"],
    { cwd: root, encoding: "utf8" });
  let result;
  try {
    result = JSON.parse(submit.stdout);
  } catch {
    throw new Error(`notarytool couldn't submit (${submit.status}): ${submit.stderr || submit.stdout}\nWithout the "${profile}" profile, ` +
      `store it once: xcrun notarytool store-credentials ${profile} --key <AuthKey.p8> --key-id <key ID> --issuer <issuer ID>`);
  }
  if (result.status !== "Accepted") {
    const log = spawnSync("xcrun", ["notarytool", "log", result.id, "--keychain-profile", profile], { encoding: "utf8" });
    throw new Error(`Apple's notary service answered ${result.status} for submission ${result.id}:\n${log.stdout || log.stderr}`);
  }
  run("xcrun", ["stapler", "staple", app]);
  const verdict = spawnSync("spctl", ["--assess", "--type", "execute", "--verbose=4", app], { encoding: "utf8" });
  if (verdict.status !== 0 || !verdict.stderr.includes("source=Notarized Developer ID")) {
    throw new Error(`Gatekeeper didn't accept the notarized app: ${verdict.stderr}`);
  }
  // Zipped again after stapling, so the ticket travels with the download.
  rmSync(archive);
  run("ditto", ["-c", "-k", "--keepParent", app, archive]);
  return archive;
}
