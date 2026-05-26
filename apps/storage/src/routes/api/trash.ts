import { createServerFileRoute } from "@tanstack/react-start/server";
import { trashPath } from "~/lib/scanner-server";

// POST /api/trash  { "path": "<absolute path>" }
export const ServerRoute = createServerFileRoute("/api/trash").methods({
  POST: async ({ request }) => {
    const body = (await request.json().catch(() => null)) as {
      path?: string;
    } | null;
    const target = body?.path;
    if (!target) {
      return new Response(
        JSON.stringify({ type: "trash", ok: false, reason: "missing_path" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    const line = await trashPath(target);
    return new Response(
      line || '{"type":"trash","ok":false,"reason":"no_output"}',
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  },
});
