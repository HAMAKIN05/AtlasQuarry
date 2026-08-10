#!/usr/bin/env bash
set -euo pipefail

HOST="${DEPLOY_HOST:-nippou-prod}"
REMOTE_DIR="${REMOTE_DIR:-/opt/atlasquarry}"
REMOTE_COMPOSE_FILE="${REMOTE_COMPOSE_FILE:-compose.yml}"
HEALTH_URL="${HEALTH_URL:-https://atlasquarry.duckdns.org/api/health}"

echo "building image"
docker build -t atlasquarry:latest .

echo "transferring image to $HOST"
docker save atlasquarry:latest | gzip | ssh -o BatchMode=yes "$HOST" 'gunzip | docker load'

echo "restarting application"
ssh -o BatchMode=yes "$HOST" "cd '$REMOTE_DIR' && docker compose -f '$REMOTE_COMPOSE_FILE' up -d --no-build app"

echo "checking public health endpoint"
curl --fail --silent --show-error --max-time 30 "$HEALTH_URL"
printf '\n'
echo "deploy: ok"
