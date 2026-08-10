#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker/compose.yml}"
PROJECT="${COMPOSE_PROJECT_NAME:-atlasquarry}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"

echo "[1/3] compose services"
docker compose -f "$COMPOSE_FILE" -p "$PROJECT" ps --status running

echo "[2/3] database readiness"
docker compose -f "$COMPOSE_FILE" -p "$PROJECT" exec -T db pg_isready \
  -U "${POSTGRES_USER:-atlasquarry}" -d "${POSTGRES_DB:-atlasquarry}"

echo "[3/3] application health: $HEALTH_URL"
response="$(curl --fail --silent --show-error --max-time 15 "$HEALTH_URL")"
case "$response" in
  *'"status":"ok"'*) echo "$response" ;;
  *) echo "unexpected health response: $response" >&2; exit 1 ;;
esac

echo "healthcheck: ok"
