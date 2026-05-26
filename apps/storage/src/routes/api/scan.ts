import os from "node:os";
import { createServerFileRoute } from "@tanstack/react-start/server";
import { streamScan } from "~/lib/scanner-server";

// GET /api/scan?root=<path>&engine=bulk|std
// Streams NDJSON: repeated progress events, then one result event.
export const ServerRoute = createServerFileRoute("/api/scan").methods({
  GET: ({ request }) => {
    const url = new URL(request.url);
    const root = url.searchParams.get("root") || os.homedir();
    const engine = url.searchParams.get("engine") === "std" ? "std" : "bulk";

    const stream = streamScan(root, engine);
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  },
});
