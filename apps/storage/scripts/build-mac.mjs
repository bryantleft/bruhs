import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
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
run("swift", ["build", "-c", "release", "--package-path", "native", "-Xswiftc", "-warnings-as-errors"]);
const bin = run("swift", ["build", "-c", "release", "--package-path", "native", "--show-bin-path"], true);
const build = path.join(root, "native/.build");
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
  for (const target of [path.join(macos, "storage-scanner"), app]) {
    run("codesign", ["--force", "--sign", "-", "--options", "runtime", "--timestamp=none", target]);
  }
  const output = path.join(build, "Pith.app");
  rmSync(output, { recursive: true, force: true });
  renameSync(app, output);
  console.log(`Built ${output}\nLocally ad-hoc signed. Developer ID signing and notarization are required before distribution.`);
} finally { rmSync(staging, { recursive: true, force: true }); }
