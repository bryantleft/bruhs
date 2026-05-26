import os from "node:os";
import { createServerFileRoute } from "@tanstack/react-start/server";

// GET /api/home — the user's home directory, for path presets/defaults.
export const ServerRoute = createServerFileRoute("/api/home").methods({
  GET: () =>
    new Response(JSON.stringify({ home: os.homedir() }), {
      headers: { "Content-Type": "application/json" },
    }),
});
