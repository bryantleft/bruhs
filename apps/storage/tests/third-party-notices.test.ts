import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import {
  chooseLicence,
  licenceFiles,
  noticeOf,
  packageOf,
  pagePackages,
  shippedCrates,
  VENDORED,
} from "../scripts/third-party-notices.mjs";

describe("the npm packages pith.js holds", () => {
  test("are found from the modules the bundler took in, as pnpm nests them", () => {
    assert.equal(
      packageOf(
        "/repo/node_modules/.pnpm/react-dom@19.3.1_react@19.3.1/node_modules/react-dom/cjs/react-dom.production.js",
      ),
      "/repo/node_modules/.pnpm/react-dom@19.3.1_react@19.3.1/node_modules/react-dom",
    );
    assert.equal(
      packageOf(
        "/repo/node_modules/@scope/name/dist/index.js?commonjs-es-import",
      ),
      "/repo/node_modules/@scope/name",
      "a scoped package, its query dropped",
    );
    assert.equal(
      packageOf("\0/repo/node_modules/scheduler/index.js"),
      "/repo/node_modules/scheduler",
      "a virtual module",
    );
    assert.equal(
      packageOf("/repo/apps/storage/native-web/main.tsx"),
      null,
      "Pith's own",
    );
    assert.equal(packageOf("/repo/node_modules/.pnpm/x"), null);
  });

  test("each come once, with the licence they declare and their own text", () => {
    const folder = mkdtempSync(path.join(tmpdir(), "pith-notices-"));
    try {
      const react = path.join(folder, "node_modules/react");
      mkdirSync(path.join(react, "cjs"), { recursive: true });
      writeFileSync(
        path.join(react, "package.json"),
        JSON.stringify({
          name: "react",
          version: "19.3.1",
          license: "MIT",
          repository: { url: "git+https://github.com/facebook/react.git" },
        }),
      );
      writeFileSync(path.join(react, "LICENSE"), "MIT License\n");
      const found = pagePackages([
        path.join(react, "index.js"),
        path.join(react, "cjs/react.production.js"),
        path.join(folder, "native-web/main.tsx"),
      ]);
      assert.deepEqual(found, [
        {
          name: "react",
          version: "19.3.1",
          home: "https://github.com/facebook/react",
          folder: react,
          licence: "MIT",
        },
      ]);
      assert.deepEqual(licenceFiles(react), ["LICENSE"]);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe("the licence a package's notice carries", () => {
  test("is its MIT text where it offers MIT among others, and every licence file otherwise", () => {
    assert.deepEqual(
      chooseLicence("MIT OR Apache-2.0", ["LICENSE-APACHE", "LICENSE-MIT"]),
      ["LICENSE-MIT"],
    );
    assert.deepEqual(
      chooseLicence("Unlicense OR MIT", [
        "COPYING",
        "LICENSE-MIT",
        "UNLICENSE",
      ]),
      ["LICENSE-MIT"],
    );
    assert.deepEqual(chooseLicence("MIT", ["LICENSE.txt"]), ["LICENSE.txt"]);
    assert.deepEqual(chooseLicence("ISC", ["LICENSE"]), ["LICENSE"]);
    assert.deepEqual(
      chooseLicence("(MIT OR Apache-2.0) AND Unicode-3.0", [
        "LICENSE-APACHE",
        "LICENSE-MIT",
        "LICENSE-UNICODE",
      ]),
      ["LICENSE-APACHE", "LICENSE-MIT", "LICENSE-UNICODE"],
      "a licence it must also carry",
    );
    assert.deepEqual(chooseLicence("MIT", []), [], "none to carry");
  });
});

describe("the crates the scanner ships", () => {
  /** `cargo metadata`'s shape, for a root with a library, a macro and what each needs, a build tool and a test tool. */
  const metadata = {
    resolve: {
      root: "scanner",
      nodes: [
        {
          id: "scanner",
          deps: [
            { pkg: "serde", dep_kinds: [{ kind: null }] },
            { pkg: "cc", dep_kinds: [{ kind: "build" }] },
            { pkg: "tempfile", dep_kinds: [{ kind: "dev" }] },
          ],
        },
        {
          id: "serde",
          deps: [
            { pkg: "serde_derive", dep_kinds: [{ kind: null }] },
            { pkg: "itoa", dep_kinds: [{ kind: null }] },
          ],
        },
        {
          id: "serde_derive",
          deps: [{ pkg: "syn", dep_kinds: [{ kind: null }] }],
        },
        { id: "syn", deps: [] },
        { id: "itoa", deps: [] },
        { id: "cc", deps: [] },
        { id: "tempfile", deps: [] },
      ],
    },
    packages: [
      ["scanner", "bin"],
      ["serde", "lib"],
      ["serde_derive", "proc-macro"],
      ["syn", "lib"],
      ["itoa", "lib"],
      ["cc", "lib"],
      ["tempfile", "lib"],
    ].map(([name, kind]) => ({
      id: name,
      name,
      version: "1.0.0",
      targets: [{ kind: [kind] }],
    })),
  };

  test("are its normal dependencies, without the macros that run only while it's built", () => {
    assert.deepEqual(
      shippedCrates(metadata).map((item: { name: string }) => item.name),
      ["itoa", "serde"],
    );
  });
});

describe("a dependency's notice", () => {
  test("carries its own licence text, or the one kept for a crate published without one, and stops the build without either", () => {
    const folder = mkdtempSync(path.join(tmpdir(), "pith-notice-"));
    try {
      writeFileSync(path.join(folder, "LICENSE-MIT"), "MIT text\n");
      writeFileSync(path.join(folder, "LICENSE-APACHE"), "Apache text\n");
      assert.equal(
        noticeOf({
          name: "serde",
          version: "1.0.0",
          home: "https://serde.rs",
          folder,
          licence: "MIT OR Apache-2.0",
        }),
        "serde 1.0.0\nhttps://serde.rs\n\nMIT text",
      );
      const bare = path.join(folder, "bare");
      mkdirSync(bare);
      const objc2 = VENDORED["https://github.com/madsmtm/objc2"];
      assert.equal(objc2.licence, "MIT");
      const kept = noticeOf({
        name: "objc2",
        version: "0.6.5",
        folder: bare,
        licence: "MIT",
        vendored: objc2.file,
      });
      assert.ok(
        kept.startsWith("objc2 0.6.5\n\nCopyright 2026 Mads Marquart\n"),
        kept,
      );
      assert.throws(
        () =>
          noticeOf({
            name: "nameless",
            version: "0.1.0",
            folder: bare,
            licence: "MIT",
          }),
        /nameless 0\.1\.0 ships no licence file/,
      );
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
