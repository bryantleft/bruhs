import { createServerFileRoute } from "@tanstack/react-start/server";
import { readSnapshot } from "~/lib/scanner-server";

// GET /api/snapshot — returns the last cached scan result, or 204 if none.
export const ServerRoute = createServerFileRoute("/api/snapshot").methods({
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
});
