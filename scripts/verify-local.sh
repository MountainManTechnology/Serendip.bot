#!/usr/bin/env bash
set -euo pipefail

# verify-local.sh — quick verification steps for local dev
# Usage: ./scripts/verify-local.sh

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE="${ROOT}/docker-compose.dev.yml"

echo "Using compose file: ${COMPOSE}"

echo "1) Build and bring up containers (detached)"
docker compose -f "${COMPOSE}" up --build -d

echo "2) Wait a few seconds for healthchecks..."
sleep 6

echo "3) Show service status"
docker compose -f "${COMPOSE}" ps

cat <<'EOF'
Next verification steps (manual):
- Visit http://localhost:3000 for the web UI (if web built successfully).
- Visit http://localhost:4000 for the API.
- Visit http://127.0.0.1:8080 to open Adminer (DB UI).
- Visit http://127.0.0.1:5555 for Flower (task monitor) if enabled (tools profile).
- To inspect discovery API: http://localhost:8002/health
EOF

# Tail logs for quick troubleshooting
echo "Tailing logs for api, web, and discovery-api (press Ctrl+C to exit)"
docker compose -f "${COMPOSE}" logs -f api web discovery-api
