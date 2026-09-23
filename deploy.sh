#!/bin/bash
#
# PrintSetu — Production deployment
#
# Run on the server, from the app directory (default /home/ubuntu/printsetu):
#   ./deploy.sh
#
# Pulls the latest `main`, rebuilds and restarts every service, applies
# pending Prisma migrations plus the (idempotent) demo seed, and verifies
# the whole stack actually came up before declaring success — rather than
# assuming `docker compose up -d` succeeding means the app works. See
# infra/README.md for the full deployment guide and first-time setup.

set -euo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/printsetu}"
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
ENV_FILE="printsetu-backend/.env.production"
TOTAL_STEPS=9

cd "$APP_DIR"

step() {
  echo ""
  echo "[$1/$TOTAL_STEPS] $2"
  echo "----------------------------------------"
}

fail() {
  echo "" >&2
  echo "ERROR: $1" >&2
  exit 1
}

echo "========================================"
echo " PrintSetu Production Deployment"
echo "========================================"

# ---------------------------------------------------------------------------
step 1 "Checking prerequisites"
# ---------------------------------------------------------------------------
[ -f "$ENV_FILE" ] || fail "$ENV_FILE is missing. Copy printsetu-backend/.env.production.example to $ENV_FILE and fill in real values first (see infra/README.md)."

# A leftover CHANGE_ME either leaves the backend crash-looping
# (CREDENTIAL_ENCRYPTION_KEY) or running with a default secret — both are
# far cheaper to catch here than after the stack is half up.
if grep -qE '=CHANGE_ME' "$ENV_FILE"; then
  echo "The following $ENV_FILE values are still placeholders:" >&2
  grep -E '=CHANGE_ME' "$ENV_FILE" | sed 's/=.*/=.../' >&2
  fail "fill in real values before deploying."
fi
grep -qE '^CREDENTIAL_ENCRYPTION_KEY=.+' "$ENV_FILE" \
  || fail "CREDENTIAL_ENCRYPTION_KEY is missing from $ENV_FILE. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
echo "OK — $ENV_FILE present, no placeholder values left."

# ---------------------------------------------------------------------------
step 2 "Checking Git status"
# ---------------------------------------------------------------------------
git status --short
[ -z "$(git status --porcelain)" ] || fail "working tree has local changes — commit, stash, or discard them before pulling."

# ---------------------------------------------------------------------------
step 3 "Pulling latest code"
# ---------------------------------------------------------------------------
git fetch origin main
BEFORE="$(git rev-parse HEAD)"
git pull --ff-only origin main
AFTER="$(git rev-parse HEAD)"
if [ "$BEFORE" = "$AFTER" ]; then
  echo "Already up to date — nothing new to deploy (still $(git log -1 --oneline))."
else
  echo "Updated $BEFORE -> $AFTER:"
  git log --oneline "$BEFORE..$AFTER"
fi

# ---------------------------------------------------------------------------
step 4 "Building Print Agent installer bundle"
# ---------------------------------------------------------------------------
# The backend's "Download Print Agent" endpoint (agent-package.service.ts)
# serves printsetu-print-agent/release/bundle/PrintSetuAgent.exe straight
# off disk via the volume mount in docker-compose.prod.yml — it 404s with
# "installer has not been built on this server yet" if that file is
# missing. Nothing else in this pipeline builds it, so do it here, every
# deploy, gated on PRINT_AGENT_BUNDLE_DIR (opt-in — see
# .env.production.example) so servers that don't use the feature don't
# need it. Built inside a throwaway Node container rather than requiring
# Node/npm on the host, since this server only has Docker installed.
if grep -qE '^PRINT_AGENT_BUNDLE_DIR=' "$ENV_FILE"; then
  docker run --rm \
    -v "$APP_DIR/printsetu-print-agent:/app" \
    -w /app \
    node:20 \
    sh -c "npm ci --no-audit --no-fund && npm run build:exe && npm run package"
  [ -f printsetu-print-agent/release/bundle/PrintSetuAgent.exe ] \
    || fail "Print Agent build reported success but release/bundle/PrintSetuAgent.exe is still missing."
  echo "OK — printsetu-print-agent/release/bundle/PrintSetuAgent.exe built."
else
  echo "PRINT_AGENT_BUNDLE_DIR not set in $ENV_FILE — skipping Print Agent bundle build (the 'Download Print Agent' feature will 404 until it's configured; see infra/README.md)."
fi

# ---------------------------------------------------------------------------
step 5 "Building and restarting services"
# ---------------------------------------------------------------------------
$COMPOSE up -d --build

# ---------------------------------------------------------------------------
step 6 "Waiting for the backend to come up"
# ---------------------------------------------------------------------------
# `up -d` returns success even if a container immediately crash-loops
# (e.g. a bad env var, or a migration that failed on a previous attempt).
# Poll its actual state instead of trusting that.
echo "Waiting for the backend container to report 'running'..."
attempt=0
until [ "$($COMPOSE ps -q backend | xargs -r docker inspect -f '{{.State.Status}}' 2>/dev/null)" = "running" ]; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "Recent backend logs:" >&2
    $COMPOSE logs --tail=50 backend >&2
    fail "backend container never reached 'running' after 60s."
  fi
  sleep 2
done
echo "Backend container is running."

# ---------------------------------------------------------------------------
step 7 "Running database migrations + demo seed"
# ---------------------------------------------------------------------------
# prisma/ts-node/typescript are regular (not dev) dependencies specifically
# so they're present in this pruned production image — see
# printsetu-backend/package.json and infra/README.md. `db seed` is
# idempotent (upserts / existence checks throughout prisma/seed.ts), so
# it's safe to run on every deploy, not just the first one.
$COMPOSE exec -T backend npx prisma migrate deploy
$COMPOSE exec -T backend npx prisma db seed

# ---------------------------------------------------------------------------
step 8 "Checking service status"
# ---------------------------------------------------------------------------
$COMPOSE ps
if $COMPOSE ps | grep -qiE "restarting|exit"; then
  $COMPOSE ps >&2
  fail "one or more services are restarting/exited instead of running (see above)."
fi

# ---------------------------------------------------------------------------
step 9 "Verifying the application responds"
# ---------------------------------------------------------------------------
curl -fsS -o /dev/null http://127.0.0.1/ || fail "frontend (http://127.0.0.1/) is not responding."
echo "Frontend: OK"

api_status="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/api/)"
case "$api_status" in
  502|504|000) fail "backend API through Nginx returned $api_status (unreachable). Check: $COMPOSE logs backend" ;;
  *) echo "Backend API: OK (HTTP $api_status through Nginx)" ;;
esac

# This host's root disk is small (see infra/README.md "Disk budget") —
# drop now-superseded image layers from this build so it doesn't fill up
# over repeated deploys.
docker image prune -f >/dev/null

echo ""
echo "========================================"
echo " Deployment completed successfully"
echo " $(git log -1 --format='%h %s')"
echo "========================================"
