#!/bin/sh
# Vercel's ignored build step: exit 0 skips the deploy, 1 builds it, and anything else fails it.
# Skip only when nothing the page is built from changed since the last deploy. When in doubt,
# build: Vercel's shallow clone can miss the last deployed commit (after a run of other commits),
# and git diff on a missing commit exits 128, which Vercel reports as a failed deploy.
prev=${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}
if ! git cat-file -e "$prev^{commit}" 2>/dev/null; then
  echo "Last deployed commit $prev isn't in this clone; building."
  exit 1
fi
git diff --quiet "$prev" HEAD -- . ../api ../outside/src ../outside/assets ../../packages \
  ../../pnpm-lock.yaml ../../package.json ../../pnpm-workspace.yaml ../../turbo.json
status=$?
[ "$status" -le 1 ] && exit "$status"
echo "git diff failed ($status); building."
exit 1
