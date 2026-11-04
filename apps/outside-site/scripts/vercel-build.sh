#!/bin/sh
# Vercel build. Production deploys the shared Convex API (apps/api) first, so the waitlist route
# the page posts to is live before the page is. Previews only build the page.
set -eu

if [ "${VERCEL_ENV:-}" = "production" ]; then
  if [ -z "${CONVEX_DEPLOY_KEY:-}" ]; then
    echo "CONVEX_DEPLOY_KEY is not set for Production in the bruhs-outside Vercel project, so the API can't deploy." >&2
    echo "Create one with: npx convex deployment token create <name> --deployment earnest-wren-707" >&2
    exit 1
  fi
  # Vercel doesn't wait for GitHub CI, so run the API's own checks here: a failing test must
  # never reach production.
  pnpm --filter bruhs-api check
  pnpm --filter bruhs-api exec convex deploy
fi

pnpm exec astro build
