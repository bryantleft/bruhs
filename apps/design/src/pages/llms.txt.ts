import type { APIRoute } from "astro";
import agentsMarkdown from "@bruhs/theme/AGENTS.md?raw";

export const prerender = true;

export const GET: APIRoute = () => {
  return new Response(agentsMarkdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
};
