import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/client/stdio";

const scanner =
  process.env.PITH_SCANNER ??
  fileURLToPath(
    new URL("../scanner/target/release/storage-scanner", import.meta.url),
  );

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  assert(isRecord(value), "MCP must return a structured object");
  return value;
}

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const result = await client.callTool({ name, arguments: args });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  return record(result.structuredContent);
}

async function refusal(
  client: Client,
  name: string,
  args: Record<string, unknown>,
  reason: RegExp,
): Promise<void> {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, true);
  assert.match(String(record(result.structuredContent).error), reason);
}

// The official SDK validates the wire format independently of Pith's Rust JSON fixtures.
// Pin modern negotiation so a broken modern server cannot silently fall back to legacy.
for (const era of ["modern", "legacy"] as const) {
  test(`official MCP SDK: ${era} storage flow, immutable handles and reconnects`, async (t) => {
    const temporary = await realpath(
      await mkdtemp(join(tmpdir(), `pith-sdk-${era}-`)),
    );
    const clients: Client[] = [];
    t.after(async () => {
      const closed = await Promise.allSettled(
        clients.map((client) => client.close()),
      );
      await rm(temporary, { recursive: true, force: true });
      for (const result of closed) assert.equal(result.status, "fulfilled");
    });
    const home = join(temporary, "home");
    const cache = join(temporary, "reports");
    const first = join(home, "first");
    const second = join(home, "second");
    const target = join(first, "target");
    const generated = join(target, "build.bin");
    const personal = join(first, "Documents", "keep.bin");
    const dependencies = join(second, "node_modules", "pkg", "index.js");
    await Promise.all([
      mkdir(target, { recursive: true }),
      mkdir(join(first, "Documents"), { recursive: true }),
      mkdir(join(second, "node_modules", "pkg"), { recursive: true }),
    ]);
    const files = [
      join(first, "Cargo.toml"),
      generated,
      personal,
      join(second, "package.json"),
      dependencies,
    ];
    const contents = [
      '[package]\nname = "fixture"\nversion = "0.0.0"\n',
      "generated\n".repeat(4096),
      "keep\n".repeat(32768),
      "{}",
      "dependency\n".repeat(4096),
    ];
    await Promise.all(
      files.map((path, index) => writeFile(path, contents[index])),
    );
    const before = await Promise.all(files.map((path) => readFile(path)));
    async function connect(scope = home): Promise<Client> {
      const client = new Client(
        { name: "pith-conformance", version: "1.0.0" },
        {
          versionNegotiation: {
            mode: era === "modern" ? { pin: "2026-07-28" } : "legacy",
          },
        },
      );
      clients.push(client);
      await client.connect(
        new StdioClientTransport({
          command: scanner,
          args: ["mcp", "--root", scope],
          env: {
            ...getDefaultEnvironment(),
            HOME: home,
            PITH_MCP_REPORTS: cache,
          },
        }),
      );
      assert.equal(client.getProtocolEra(), era);
      assert.equal(
        client.getNegotiatedProtocolVersion(),
        era === "modern" ? "2026-07-28" : "2025-11-25",
      );
      return client;
    }
    const client = await connect();
    const listing = await client.listTools();
    assert.deepEqual(listing.tools.map((tool) => tool.name).sort(), [
      "pith_cleanup_candidates",
      "pith_estimate_cleanup",
      "pith_inspect_path",
      "pith_scan",
      "pith_status",
    ]);
    for (const tool of listing.tools)
      assert.equal(tool.annotations?.readOnlyHint, true);
    const candidatesTool = listing.tools.find(
      (tool) => tool.name === "pith_cleanup_candidates",
    );
    assert(candidatesTool);
    assert.deepEqual(candidatesTool.inputSchema.required, ["scan_id"]);
    const status = await call(client, "pith_status");
    assert.equal(status.configuredRoot, home);
    assert.equal(record(status.reportPolicy).scopeBound, true);
    assert.equal("lastScanRoot" in status, false);
    const scan = await call(client, "pith_scan", { path: first });
    assert.equal(typeof scan.scan_id, "string");
    assert.match(String(scan.scan_id), /^scan_[0-9a-f]{32}$/);
    assert.equal(scan.root, first);
    assert(Number(scan.expiresAt) > Number(scan.completedAt));
    const page = await call(client, "pith_cleanup_candidates", {
      scan_id: scan.scan_id,
      limit: 1,
    });
    assert.equal(page.scan_id, scan.scan_id);
    assert(Array.isArray(page.candidates));
    const candidate = record(page.candidates[0]);
    assert.equal(candidate.path, target);
    assert.equal(candidate.risk, "rebuildable");
    const generatedStat = await stat(generated);
    assert.equal(candidate.allocatedBytes, generatedStat.blocks * 512);
    assert.equal(typeof page.nextOffset, "number");
    const next = await call(client, "pith_cleanup_candidates", {
      scan_id: scan.scan_id,
      offset: page.nextOffset,
      limit: 1,
    });
    assert.equal(next.scan_id, scan.scan_id);
    assert.notDeepEqual(next.candidates, page.candidates);
    const newer = await call(client, "pith_scan", { path: second });
    assert.notEqual(newer.scan_id, scan.scan_id);
    const inspected = await call(client, "pith_inspect_path", { path: target });
    assert.notEqual(inspected.scan_id, scan.scan_id);
    assert.notEqual(inspected.scan_id, newer.scan_id);
    assert.deepEqual(
      await call(client, "pith_cleanup_candidates", {
        scan_id: scan.scan_id,
        limit: 1,
      }),
      page,
    );
    const file = await call(client, "pith_inspect_path", { path: generated });
    assert.equal(file.kind, "file");
    assert.equal(file.allocatedBytes, generatedStat.blocks * 512);
    const estimate = await call(client, "pith_estimate_cleanup", {
      paths: [target, generated],
    });
    assert.equal(estimate.files, 1);
    assert.equal(typeof estimate.bytes, "number");
    await refusal(client, "pith_inspect_path", { path: temporary }, /outside/);
    await refusal(
      client,
      "pith_cleanup_candidates",
      { scan_id: `scan_${"0".repeat(32)}` },
      /unavailable.*pith_scan/,
    );
    await client.close();
    const reconnected = await connect();
    assert.deepEqual(
      await call(reconnected, "pith_cleanup_candidates", {
        scan_id: scan.scan_id,
        limit: 1,
      }),
      page,
    );
    assert.equal(
      (
        await call(reconnected, "pith_cleanup_candidates", {
          scan_id: newer.scan_id,
        })
      ).root,
      second,
    );
    const narrowed = await connect(first);
    await refusal(
      narrowed,
      "pith_cleanup_candidates",
      { scan_id: scan.scan_id },
      /different configured folder scope/,
    );
    const parallel = await connect();
    const [one, two] = await Promise.all([
      call(reconnected, "pith_scan", { path: first }),
      call(parallel, "pith_scan", { path: second }),
    ]);
    assert.notEqual(one.scan_id, two.scan_id);
    const [onePage, twoPage] = await Promise.all([
      call(parallel, "pith_cleanup_candidates", { scan_id: one.scan_id }),
      call(reconnected, "pith_cleanup_candidates", { scan_id: two.scan_id }),
    ]);
    assert.equal(onePage.root, first);
    assert.equal(twoPage.root, second);
    assert.deepEqual(
      await Promise.all(files.map((path) => readFile(path))),
      before,
      "All user fixture contents must remain unchanged",
    );
  });
}
