import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatBytes } from "../src/lib/format.ts";

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
