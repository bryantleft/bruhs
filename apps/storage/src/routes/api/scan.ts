import os from "node:os";
import { createFileRoute } from "@tanstack/react-router";
import { streamScan } from "~/lib/scanner-server";

// GET /api/scan?root=<path>&engine=bulk|std
// Streams NDJSON: repeated progress events, then one result event.
export const Route = createFileRoute("/api/scan")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url);
        const root = url.searchParams.get("root") || os.homedir();
        const engine =
          url.searchParams.get("engine") === "std" ? "std" : "bulk";

        const stream = streamScan(root, engine);
        return new Response(stream, {
          headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
