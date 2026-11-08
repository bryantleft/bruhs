import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseResultEvent } from "../src/lib/protocol.ts";

const summary = {
  dirs: 1,
  files: 1,
  bytes: 10,
  errors: 1,
  unreadable: { protected: 1, denied: 0, other: 0 },
  entryErrors: 0,
  cloudOnly: { files: 0, bytes: 0, folders: 0 },
  elapsedMs: 1,
  engine: "bulk",
  clones: { files: 2, bytes: 4096 },
};

/** A result line as storage-scanner writes it (scanner/src/output.rs, RESULT_VERSION 4). */
const line: {
  root: { children: Record<string, unknown>[] } & Record<string, unknown>;
} & Record<string, unknown> = {
  type: "result",
  version: 4,
  root: {
    name: "",
    path: "/",
    size: 10,
    kind: "dir",
    files: 1,
    clones: 4096,
    children: [
      {
        name: "Preboot",
        path: "/System/Volumes/Preboot",
        size: 8,
        kind: "volume",
        sharesDisk: true,
      },
      { name: "a.bin", path: "/a.bin", size: 2, kind: "file" },
      {
        name: "locked",
        path: "/locked",
        size: 0,
        kind: "unreadable",
        reason: "protected",
      },
    ],
  },
  topFiles: [{ name: "a.bin", path: "/a.bin", size: 2 }],
  volumes: [
    {
      path: "/System/Volumes/Preboot",
      name: "Preboot",
      bytes: 8,
      sharesDisk: true,
    },
  ],
  unreadableFolders: [{ path: "/locked", reason: "protected" }],
  summary,
};

describe("parseResultEvent", () => {
  test("reads volumes and unreadable folders", () => {
    const result = parseResultEvent(line);
    assert.ok(result);
    assert.deepEqual(
      result.root.children.map((child) => child.kind),
      ["volume", "file", "unreadable"],
    );
    assert.equal(result.unreadableFolders[0]?.reason, "protected");
    assert.equal(result.volumes[0]?.sharesDisk, true);
    assert.equal(result.summary.unreadable.protected, 1);
  });

  test("keeps the clones a folder and the scan leave out", () => {
    const result = parseResultEvent(line);
    assert.ok(result);
    assert.equal(result.root.clones, 4096);
    assert.deepEqual(result.summary.clones, { files: 2, bytes: 4096 });
    const noClones = structuredClone(line);
    delete noClones.root.clones;
    assert.equal(parseResultEvent(noClones)?.root.clones, undefined);
    const badClones = structuredClone(line);
    badClones.root.clones = -1;
    assert.equal(parseResultEvent(badClones), null);
  });

  test("refuses an older scanner's result and malformed nodes", () => {
    assert.equal(parseResultEvent({ ...line, version: 3 }), null);
    const badReason = structuredClone(line);
    badReason.root.children[2] = {
      ...badReason.root.children[2],
      reason: "maybe",
    };
    assert.equal(parseResultEvent(badReason), null);
    const noFiles = structuredClone(line) as Record<string, unknown>;
    noFiles.root = { ...line.root, files: undefined };
    assert.equal(parseResultEvent(noFiles), null);
  });
});
