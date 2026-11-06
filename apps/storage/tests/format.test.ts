import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatBytes } from "../src/lib/format.ts";

/**
 * Pith's native views format sizes with the same rule (native/Sources/PithCore/ByteFormat.swift,
 * ByteFormatTests.swift checks the same cases), so the Disk tab and Activity agree.
 */
describe("formatBytes", () => {
  test("keeps three significant figures", () => {
    assert.equal(formatBytes(0), "0 B");
    assert.equal(formatBytes(512), "512 B");
    assert.equal(formatBytes(1024), "1.00 KB");
    assert.equal(formatBytes(16_384), "16.0 KB");
    assert.equal(formatBytes(471_859_200), "450 MB");
    assert.equal(formatBytes(3_339_000_000), "3.11 GB");
    assert.equal(formatBytes(3_328_599_654), "3.10 GB");
    assert.equal(formatBytes(103_508_000_000), "96.4 GB");
    assert.equal(formatBytes(994_662_584_320), "926 GB");
  });
});
