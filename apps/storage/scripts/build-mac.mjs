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
  for (const target of [path.join(macos, "storage-scanner"), app]) {
    run("codesign", ["--force", "--sign", "-", "--options", "runtime", "--timestamp=none", target]);
  }
  const output = path.join(build, "Pith.app");
  rmSync(output, { recursive: true, force: true });
  renameSync(app, output);
  console.log(`Built ${output}\nLocally ad-hoc signed. Developer ID signing and notarization are required before distribution.`);
} finally { rmSync(staging, { recursive: true, force: true }); }
