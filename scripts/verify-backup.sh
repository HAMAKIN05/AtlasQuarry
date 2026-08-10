#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker/compose.yml}"
PROJECT="${COMPOSE_PROJECT_NAME:-atlasquarry}"
DB_USER="${POSTGRES_USER:-atlasquarry}"
DB_NAME="${POSTGRES_DB:-atlasquarry}"
DUMP_FILE="${1:-}"
ATTACH_FILE="${2:-}"

if [ -z "$DUMP_FILE" ] || [ ! -s "$DUMP_FILE" ]; then
  echo "usage: $0 <dump.pgc> [attachments.tar.gz]" >&2
  exit 2
fi

echo "checking PostgreSQL archive: $DUMP_FILE"
docker compose -f "$COMPOSE_FILE" -p "$PROJECT" exec -T db sh -c \
  'set -e; tmp=/tmp/atlasquarry-verify.pgc; cat > "$tmp"; pg_restore --list "$tmp" >/dev/null; rm -f "$tmp"' < "$DUMP_FILE"

if [ -n "$ATTACH_FILE" ]; then
  if [ ! -s "$ATTACH_FILE" ]; then
    echo "attachment archive is missing or empty: $ATTACH_FILE" >&2
    exit 1
  fi
  echo "checking attachment archive: $ATTACH_FILE"
  docker run --rm -i alpine tar -tzf - >/dev/null < "$ATTACH_FILE"
fi

echo "backup verification: ok"
