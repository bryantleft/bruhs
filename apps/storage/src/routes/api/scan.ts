import os from "node:os";
import { createFileRoute } from "@tanstack/react-router";
import { crossOriginResponse } from "~/lib/http";
import { isSameOriginRequest } from "~/lib/request-guard";
import { streamScan } from "~/lib/scanner-server";

// GET /api/scan?root=<path>&engine=bulk|std
// Streams NDJSON: repeated progress events, then one result event (or an error event).
export const Route = createFileRoute("/api/scan")({
  server: {
    handlers: {
      GET: ({ request }) => {
        // A scan is heavy and overwrites the cached snapshot; only our own UI may start one.
        if (!isSameOriginRequest(request.headers)) return crossOriginResponse();

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
