import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const work = mkdtempSync(path.join(tmpdir(), "pith-network-memory-"));
const binary = path.join(work, "network-memory");
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
try {
  const source = "tests/native-network-memory.c";
  const include = "native/Sources/PithSystem/include";
  const flags = ["-fblocks", "-O1", "-g", "-I", include, "-framework", "CoreFoundation", "-lproc"];
  run("xcrun", ["clang", source, ...flags, "-o", binary]);
  const child = spawn(binary, ["--hold"], { stdio: ["pipe", "pipe", "inherit"] });
  const exited = once(child, "exit");
  try {
    let output = "";
    for await (const chunk of child.stdout) {
      output += chunk.toString();
      if (output.includes("queries verified.")) break;
    }
    if (!output.includes("queries verified.")) throw new Error("The network ownership fixture did not finish its queries.");
    console.log(run("leaks", ["--noContent", String(child.pid)]));
  } finally {
    child.stdin.end("\n");
    const [status] = await exited;
    if (status !== 0) throw new Error(`The network ownership fixture exited with ${status}.`);
  }
  run("xcrun", ["clang", source, ...flags, "-fsanitize=address", "-o", binary]);
  console.log(run(binary, []));
} finally {
  rmSync(work, { recursive: true, force: true });
}
