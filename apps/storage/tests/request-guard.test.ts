import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import {
  isJsonRequest,
  isLoopbackHost,
  isSameOriginRequest,
  resolveTrashTarget,
  type TrashScope,
} from "../src/lib/request-guard.ts";

describe("isSameOriginRequest", () => {
  // Requests reach the dev server on a loopback host unless a case says otherwise.
  const check = (init: Record<string, string>) =>
    isSameOriginRequest(new Headers({ host: "localhost:3001", ...init }));

  test("refuses a DNS-rebinding page whose own requests look same-origin", () => {
    // evil.example re-resolved to 127.0.0.1: the browser sees one origin throughout.
    assert.equal(
      check({ "sec-fetch-site": "same-origin", host: "evil.example:3001" }),
      false,
    );
    assert.equal(
      check({
        origin: "http://evil.example:3001",
        host: "evil.example:3001",
      }),
      false,
    );
    // A rebound page can set X-Forwarded-Host but not Host.
    assert.equal(
      check({
        "sec-fetch-site": "same-origin",
        host: "evil.example:3001",
        "x-forwarded-host": "storage-bruhs.localhost",
      }),
      false,
    );
  });

  test("accepts the app's own pages", () => {
    assert.equal(check({ "sec-fetch-site": "same-origin" }), true);
    assert.equal(check({ "sec-fetch-site": "none" }), true);
  });

  test("refuses other sites, including sibling *.localhost apps", () => {
    assert.equal(check({ "sec-fetch-site": "cross-site" }), false);
    assert.equal(check({ "sec-fetch-site": "same-site" }), false);
    // Sec-Fetch-Site wins over a spoofable-looking Origin match.
    assert.equal(
      check({
        "sec-fetch-site": "cross-site",
        origin: "https://storage-bruhs.localhost",
        host: "storage-bruhs.localhost",
      }),
      false,
    );
  });

  test("falls back to comparing Origin with Host", () => {
    assert.equal(
      check({ origin: "http://localhost:3001", host: "localhost:3001" }),
      true,
    );
    assert.equal(
      check({
        origin: "https://storage-bruhs.localhost",
        host: "127.0.0.1:4123",
        "x-forwarded-host": "storage-bruhs.localhost",
      }),
      true,
    );
    assert.equal(
      check({ origin: "https://evil.example", host: "localhost:3001" }),
      false,
    );
    assert.equal(check({ origin: "null", host: "localhost:3001" }), false);
  });

  test("allows non-browser clients that send neither header", () => {
    assert.equal(check({}), true);
  });
});

describe("isLoopbackHost", () => {
  test("accepts loopback addresses and *.localhost names, with or without a port", () => {
    for (const host of [
      "localhost",
      "localhost:3001",
      "storage-bruhs.localhost",
      "127.0.0.1:4123",
      "[::1]:4123",
    ]) {
      assert.equal(isLoopbackHost(host), true, host);
    }
  });

  test("refuses every other name, look-alikes and a missing Host", () => {
    for (const host of [
      "evil.example",
      "localhost.evil.example",
      "127.0.0.1.evil.example",
      "192.168.1.20:3001",
      "",
    ]) {
      assert.equal(isLoopbackHost(host), false, host);
    }
    assert.equal(isLoopbackHost(null), false);
  });
});

describe("isJsonRequest", () => {
  test("requires application/json", () => {
    const check = (type?: string) =>
      isJsonRequest(new Headers(type ? { "content-type": type } : {}));
    assert.equal(check("application/json"), true);
    assert.equal(check("Application/JSON; charset=utf-8"), true);
    assert.equal(check("text/plain"), false);
    assert.equal(check("application/x-www-form-urlencoded"), false);
    assert.equal(check(), false);
  });
});

describe("resolveTrashTarget", () => {
  let tmp: string;
  let root: string;
  let outside: string;
  let scope: TrashScope;

  before(async () => {
    tmp = await realpath(await mkdtemp(path.join(os.tmpdir(), "trash-guard-")));
    root = path.join(tmp, "root");
    outside = path.join(tmp, "outside");
    await mkdir(path.join(root, "home", "me", "Downloads"), {
      recursive: true,
    });
    await mkdir(path.join(root, "projects"), { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(path.join(root, "projects", "big.bin"), "x");
    await writeFile(path.join(outside, "secret.txt"), "x");
    await symlink(outside, path.join(root, "projects", "escape"));
    scope = { scanRoot: root, home: path.join(root, "home", "me") };
  });

  after(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("allows a file inside the scanned root", async () => {
    const target = path.join(root, "projects", "big.bin");
    assert.deepEqual(await resolveTrashTarget(target, scope), {
      ok: true,
      path: target,
    });
  });

  test("allows a folder inside the home directory", async () => {
    const target = path.join(root, "home", "me", "Downloads");
    assert.deepEqual(await resolveTrashTarget(target, scope), {
      ok: true,
      path: target,
    });
  });

  test("refuses `..` that climbs out of the root", async () => {
    const target = path.join(root, "projects", "..", "..", "outside");
    assert.deepEqual(await resolveTrashTarget(target, scope), {
      ok: false,
      reason: "outside_scan_root",
    });
  });

  test("refuses paths that escape through a symlinked folder", async () => {
    const target = path.join(root, "projects", "escape", "secret.txt");
    assert.deepEqual(await resolveTrashTarget(target, scope), {
      ok: false,
      reason: "outside_scan_root",
    });
  });

  test("trashes a symlink itself, not its target", async () => {
    const target = path.join(root, "projects", "escape");
    assert.deepEqual(await resolveTrashTarget(target, scope), {
      ok: true,
      path: target,
    });
  });

  test("refuses the root, the home directory and its ancestors", async () => {
    assert.deepEqual(await resolveTrashTarget(root, scope), {
      ok: false,
      reason: "protected_path",
    });
    for (const target of [
      root,
      path.join(root, "home"),
      path.join(root, "home", "me"),
      path.join(root, "home", "me", "."),
    ]) {
      const result = await resolveTrashTarget(target, scope);
      assert.equal(result.ok, false, target);
    }
  });

  test("refuses top-level directories when the whole disk was scanned", async () => {
    const wholeDisk: TrashScope = { scanRoot: "/", home: os.homedir() };
    for (const target of ["/", "/Applications", "/Users", os.homedir()]) {
      const result = await resolveTrashTarget(target, wholeDisk);
      assert.equal(result.ok, false, target);
    }
  });

  test("refuses the scanner's aggregate nodes", async () => {
    const target = path.join(root, "projects", "__other__");
    assert.deepEqual(await resolveTrashTarget(target, scope), {
      ok: false,
      reason: "aggregate",
    });
  });

  test("refuses relative paths, non-strings and a missing scan", async () => {
    for (const input of ["projects/big.bin", "", 42, null, undefined]) {
      assert.deepEqual(await resolveTrashTarget(input, scope), {
        ok: false,
        reason: "not_absolute",
      });
    }
    assert.deepEqual(
      await resolveTrashTarget(path.join(root, "projects"), {
        ...scope,
        scanRoot: null,
      }),
      { ok: false, reason: "no_scan" },
    );
  });

  test("reports a missing parent folder as not found", async () => {
    const target = path.join(root, "nope", "file.txt");
    assert.deepEqual(await resolveTrashTarget(target, scope), {
      ok: false,
      reason: "not_found",
    });
  });
});
