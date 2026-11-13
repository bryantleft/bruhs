import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import {
  assertFixtureResult,
  benchmarkFixture,
  benchmarkOptions,
  measurementSummary,
  timeUsage,
} from "../scripts/benchmark-local.mjs";

describe("local scanner benchmark", () => {
  test("records a user-chosen report and rejects misleading or malformed sample settings", () => {
    assert.throws(() => benchmarkOptions([]), /--out/);
    assert.throws(
      () => benchmarkOptions(["--out", "/tmp/report", "--runs", "1"]),
      /at least 2/,
    );
    assert.throws(
      () => benchmarkOptions(["--out", "/tmp/report", "--files", "NaN"]),
      /integer/,
    );
    assert.throws(
      () =>
        benchmarkOptions([
          "--out",
          "/tmp/report",
          "--runs",
          "2",
          "--runs",
          "3",
        ]),
      /Usage/,
    );
    assert.throws(() => benchmarkOptions(["--out", "--files"]), /Usage/);
    const options = benchmarkOptions([
      "--out",
      "/tmp/report",
      "--files",
      "32",
      "--runs",
      "3",
    ]);
    assert.equal(options.files, 32);
    assert.equal(options.runs, 3);
    assert.equal(options.out, "/tmp/report");
  });

  test("keeps the measured range and median without inventing percentile precision", () => {
    assert.deepEqual(measurementSummary([9, 1, 4, 7]), {
      minimum: 1,
      median: 5.5,
      maximum: 9,
    });
    assert.deepEqual(measurementSummary([9, 1, 4]), {
      minimum: 1,
      median: 4,
      maximum: 9,
    });
    assert.throws(() => measurementSummary([]), /nonempty/);
    assert.throws(() => measurementSummary([Number.NaN]), /finite/);
    assert.throws(() => measurementSummary([-1]), /nonnegative/);
  });

  test("reads macOS time's byte-valued peak RSS and leaves unavailable counters absent", () => {
    assert.deepEqual(
      timeUsage(
        "        0.23 real         0.04 user         0.01 sys\n             8519680  maximum resident set size\n",
      ),
      { peakResidentBytes: 8519680, userSeconds: 0.04, systemSeconds: 0.01 },
    );
    assert.deepEqual(timeUsage(""), {
      peakResidentBytes: null,
      userSeconds: null,
      systemSeconds: null,
    });
  });

  test("fails the benchmark for double-counted links, logical sparse sizes or hidden coverage failures", () => {
    const result = {
      type: "result",
      root: { size: 4096 },
      summary: {
        bytes: 4096,
        entryErrors: 0,
        unreadable: { denied: 1, protected: 0, other: 0 },
      },
    };
    assert.doesNotThrow(() =>
      assertFixtureResult(result, { allocatedBytes: 4096, denied: true }),
    );
    assert.throws(
      () => assertFixtureResult(result, { allocatedBytes: 8192, denied: true }),
      /Allocation accounting failed/,
    );
    assert.throws(
      () =>
        assertFixtureResult(
          { ...result, root: { size: 8192 } },
          { allocatedBytes: 4096 },
        ),
      /Allocation accounting failed/,
    );
    assert.throws(
      () =>
        assertFixtureResult(
          { ...result, summary: { ...result.summary, entryErrors: 1 } },
          { allocatedBytes: 4096 },
        ),
      /coverage gaps/,
    );
    assert.throws(
      () =>
        assertFixtureResult(
          {
            ...result,
            summary: { ...result.summary, unreadable: { denied: 0 } },
          },
          { allocatedBytes: 4096, denied: true },
        ),
      /permission denied/,
    );
  });

  test("owns every fixture, produces a sparse file and restores permissions before cleanup", async () => {
    const scratch = await mkdtemp(
      path.join(os.tmpdir(), "pith-benchmark-test-"),
    );
    let fixture: Awaited<ReturnType<typeof benchmarkFixture>> | undefined;
    try {
      fixture = await benchmarkFixture(scratch, 3);
      assert.equal(fixture.description.generatedFiles, 3);
      assert.equal(fixture.description.sparse, true);
      const original = await stat(path.join(fixture.root, "original.bin"));
      const linked = await stat(path.join(fixture.root, "hardlink.bin"));
      assert.equal(original.ino, linked.ino);
      assert.equal(original.nlink, 2);
      assert.equal(typeof fixture.description.clone.supported, "boolean");
      if (fixture.description.clone.supported) {
        assert.notEqual(
          (await stat(path.join(fixture.root, "clone.bin"))).ino,
          (await stat(path.join(fixture.root, "clone-source.bin"))).ino,
        );
      }
      assert.ok(
        fixture.expected.allocatedBytes < fixture.description.logicalBytes,
      );
      await fixture.restorePermissions();
      assert.deepEqual(
        await readdir(path.join(fixture.root, "permission-denied")),
        ["must-not-read.bin"],
      );
    } finally {
      await fixture?.restorePermissions();
      await rm(scratch, { recursive: true, force: true });
    }
  });
});
