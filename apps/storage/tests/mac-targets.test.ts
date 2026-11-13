import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildArchitecture,
  macTargets,
  verifyArchitectures,
  verifyDeploymentTarget,
} from "../scripts/mac-targets.mjs";

describe("Mac build targets", () => {
  test("native builds follow the building process and universal builds compile both binaries", () => {
    assert.deepEqual(macTargets("native", "arm64").architectures, ["arm64"]);
    assert.deepEqual(macTargets("native", "x64").architectures, ["x86_64"]);
    const universal = macTargets("universal", "arm64");
    assert.deepEqual(universal.rustTargets, [
      "aarch64-apple-darwin",
      "x86_64-apple-darwin",
    ]);
    assert.deepEqual(universal.swiftArguments, [
      "--arch",
      "arm64",
      "--arch",
      "x86_64",
    ]);
    assert.equal(universal.deploymentTarget, "14.0");
    assert.throws(
      () => macTargets("amd64", "arm64"),
      /Unknown Pith architecture/,
    );
    assert.throws(() => macTargets("native", "riscv"), /host architecture/);
  });
  test("command-line architecture takes precedence over the environment and malformed flags fail", () => {
    assert.equal(buildArchitecture(["--release"]), "universal");
    assert.equal(buildArchitecture([]), "native");
    assert.equal(
      buildArchitecture(["--release", "--arch", "native"]),
      "native",
    );
    assert.equal(
      buildArchitecture([], { PITH_ARCH: "universal" }),
      "universal",
    );
    assert.equal(
      buildArchitecture(["--release", "--arch=x86_64"], {
        PITH_ARCH: "universal",
      }),
      "x86_64",
    );
    assert.equal(buildArchitecture(["--arch", "arm64"]), "arm64");
    assert.throws(() => buildArchitecture(["--arch"]), /needs/);
    assert.throws(() => buildArchitecture(["--arch", "--release"]), /needs/);
    assert.throws(
      () => buildArchitecture(["--arch=arm64", "--arch=universal"]),
      /only once/,
    );
  });
  test("packaging refuses an Intel scanner in a universal app and checks Sparkle's architectures", () => {
    assert.throws(
      () =>
        verifyArchitectures(
          "x86_64",
          ["arm64", "x86_64"],
          "storage-scanner",
          true,
        ),
      /requires arm64, x86_64/,
    );
    assert.throws(
      () => verifyArchitectures("arm64", ["arm64", "x86_64"], "Sparkle"),
      /Sparkle/,
    );
    assert.deepEqual(
      verifyArchitectures("x86_64 arm64\n", ["arm64", "x86_64"], "Pith", true),
      ["x86_64", "arm64"],
    );
    assert.throws(
      () => verifyArchitectures("arm64 x86_64", ["arm64"], "Pith", true),
      /requires arm64/,
    );
    assert.deepEqual(
      verifyArchitectures("arm64 x86_64", ["arm64"], "Sparkle"),
      ["arm64", "x86_64"],
    );
  });
  test("each binary slice supports the macOS version advertised by the bundle", () => {
    assert.deepEqual(
      verifyDeploymentTarget(" minos 14.0\n minos 13.0\n", "14.0", "Pith", 2),
      ["14.0", "13.0"],
    );
    assert.throws(
      () =>
        verifyDeploymentTarget(" minos 15.0\n minos 14.0\n", "14.0", "Pith", 2),
      /must support macOS 14/,
    );
    assert.throws(
      () => verifyDeploymentTarget(" minos 14.1\n", "14.0", "scanner", 1),
      /scanner/,
    );
    assert.throws(
      () => verifyDeploymentTarget(" minos 14.0\n", "14.0", "Pith", 2),
      /all 2 slices/,
    );
    assert.throws(
      () => verifyDeploymentTarget("", "14.0", "Pith", 1),
      /unknown/,
    );
  });
});
