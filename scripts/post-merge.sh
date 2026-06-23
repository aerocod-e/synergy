#!/bin/bash
set -e
pnpm install --frozen-lockfile

# Only run migrate.ts if it was changed in the most recent commit.
# This prevents accidental destructive operations on merges that
# have nothing to do with the database schema.
if git diff --name-only HEAD~1 HEAD 2>/dev/null | grep -q "src/db/migrate.ts"; then
  echo "migrate.ts changed — running migration..."
  pnpm --filter @workspace/api-server run migrate
else
  echo "migrate.ts unchanged — skipping migration."
fi
