import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatBytes, isPackageName } from "../src/lib/format.ts";
import packages from "../src/lib/packages.json" with { type: "json" };

/**
 * Pith's native views format sizes with the same rule (native/Sources/PithCore/ByteFormat.swift,
 * ByteFormatTests.swift checks the same cases), so the Disk tab and Activity agree.
 */
describe("formatBytes", () => {
  test("counts storage in decimal units to three significant figures", () => {
    assert.equal(formatBytes(0), "0 B");
    assert.equal(formatBytes(512), "512 B");
    assert.equal(formatBytes(1000), "1.00 KB");
    assert.equal(formatBytes(16_384), "16.4 KB");
    assert.equal(formatBytes(471_859_200), "472 MB");
    assert.equal(formatBytes(3_339_000_000), "3.34 GB");
    assert.equal(formatBytes(3_300_000_000), "3.30 GB");
    assert.equal(formatBytes(91_100_000_000), "91.1 GB");
    // The development Mac's 994.7 GB startup disk, which Finder calls 995 GB.
    assert.equal(formatBytes(994_662_584_320), "995 GB");
  });

  test("carries rounding into the next unit", () => {
    assert.equal(formatBytes(999_600_000), "1.00 GB");
    assert.equal(formatBytes(9_996_000), "10.0 MB");
    assert.equal(formatBytes(99_960_000), "100 MB");
  });
});

/**
 * The package list is src/lib/packages.json, which PackageExtensionsTests.swift also reads: it checks that macOS
 * declares each extension as a package type, so the list can't name a folder Finder opens as a folder.
 */
describe("isPackageName", () => {
  test("knows a folder macOS shows as one item by its extension", () => {
    for (const name of [
      "Xcode.app",
      "Photos Library.photoslibrary",
      "Pith 9-11-2026, 10.12.xcarchive",
      "Resources.bundle",
      "Backup.sparsebundle",
      "Music Library.musiclibrary",
    ]) {
      assert.equal(isPackageName(name), true, name);
    }
  });

  test("reads the extension in any case, as macOS does", () => {
    for (const name of [
      "SAFARI.APP",
      "Pith.app.dSYM",
      "pith.dsym",
      "Network.prefPane",
    ]) {
      assert.equal(isPackageName(name), true, name);
    }
  });

  test("leaves other folders as folders", () => {
    for (const name of [
      "src",
      "node_modules",
      // A name that is all extension has none, as a hidden folder's.
      ".app",
      "v1.2",
      "Xcode.app.backup",
      // macOS shows a framework as a folder: it's a bundle, not a package.
      "Sparkle.framework",
    ]) {
      assert.equal(isPackageName(name), false, name);
    }
  });

  test("takes every extension the list names, and each only once", () => {
    const listed = packages.extensions.map((extension) =>
      extension.toLowerCase(),
    );
    assert.ok(listed.length >= 4);
    assert.equal(new Set(listed).size, listed.length);
    for (const extension of packages.extensions) {
      assert.equal(isPackageName(`Item.${extension}`), true, extension);
    }
  });
});
