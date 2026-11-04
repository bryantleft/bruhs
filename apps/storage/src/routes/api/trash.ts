import os from "node:os";
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse } from "~/lib/http";
import {
  isJsonRequest,
  isSameOriginRequest,
  resolveTrashTarget,
  type TrashTargetRejection,
} from "~/lib/request-guard";
import { readSnapshotRoot, trashPath } from "~/lib/scanner-server";

const REJECTION_STATUS: Record<TrashTargetRejection, number> = {
  not_absolute: 400,
  aggregate: 400,
  no_scan: 409,
  not_found: 404,
  outside_scan_root: 403,
  protected_path: 403,
};

function refuse(reason: string, status: number): Response {
  return jsonResponse({ type: "trash", ok: false, reason }, status);
}

// POST /api/trash  { "path": "<absolute path inside the last scan's root>" }
export const Route = createFileRoute("/api/trash")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isSameOriginRequest(request.headers)) {
          return refuse("cross_origin", 403);
        }
        if (!isJsonRequest(request.headers)) {
          return refuse("unsupported_media_type", 415);
        }

        const body: unknown = await request.json().catch(() => null);
        if (typeof body !== "object" || body === null || !("path" in body)) {
          return refuse("invalid_body", 400);
        }

        const target = await resolveTrashTarget(body.path, {
          scanRoot: await readSnapshotRoot(),
          home: os.homedir(),
        });
        if (!target.ok) {
          return refuse(target.reason, REJECTION_STATUS[target.reason]);
        }

        const line = await trashPath(target.path);
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
    },
  },
});
