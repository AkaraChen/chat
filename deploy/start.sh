#!/usr/bin/env bash
# Starts the three processes of the app in one container. If any of them
# exits, the others are stopped and the container exits, so Docker restarts it.
set -euo pipefail

mkdir -p "$(dirname "${DATABASE_URL#file:}")" "$CREDENTIALS_DIR" "$PROXY_DATA_DIR"
chmod 700 "$CREDENTIALS_DIR" "$PROXY_DATA_DIR"

# Brings SQLite up to the schema. Refuses changes that would drop data.
(cd /app/packages/db && bun run db:push)

trap 'kill 0' EXIT

(cd /app/apps/proxy && bun src/index.ts) &
(cd /app/apps/worker && bun src/index.ts) &
(cd /app/apps/web && node .output/server/index.mjs) &

wait -n
