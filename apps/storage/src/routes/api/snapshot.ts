import { createFileRoute } from "@tanstack/react-router";
import { readSnapshot } from "~/lib/scanner-server";

// GET /api/snapshot — returns the last cached scan result, or 204 if none.
export const Route = createFileRoute("/api/snapshot")({
  server: {
    handlers: {
      GET: async () => {
        const snap = await readSnapshot();
        if (!snap) return new Response(null, { status: 204 });
        return new Response(snap, {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
