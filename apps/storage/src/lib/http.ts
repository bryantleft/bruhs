/** Small response helpers shared by the API routes. */

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...NO_STORE },
  });
}

/** 403 for requests another site made through the user's browser. */
export function crossOriginResponse(): Response {
  return new Response("Cross-origin requests are not allowed.", {
    status: 403,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...NO_STORE },
  });
}
