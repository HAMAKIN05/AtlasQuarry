#!/usr/bin/env bash
#
# リストア（DB設計書 §7）。
#
#   ./scripts/restore.sh <dump.pgc> [attachments.tar.gz]
#
# **上書きする操作なので確認を挟む。** --clean は既存オブジェクトを落としてから入れ直す。
#
# DB設計書 §7 は「月1回、リストア手順を実際に実行して検証する」と定めている。
# 検証は本番ではなく、compose.dev.yml で立てた別DBに対して行うこと。
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker/compose.yml}"
PROJECT="${COMPOSE_PROJECT_NAME:-atlasquarry}"

DB_USER="${POSTGRES_USER:-atlasquarry}"
# 検証用の別DBへ復元するときは RESTORE_DB を指定する。本番DBを誤って上書きしないため、明示的に分離する。
DB_NAME="${RESTORE_DB:-${POSTGRES_DB:-atlasquarry}}"

DUMP_FILE="${1:-}"
ATTACH_FILE="${2:-}"

if [ -z "$DUMP_FILE" ] || [ ! -f "$DUMP_FILE" ]; then
  echo "使い方: $0 <dump.pgc> [attachments.tar.gz]" >&2
  exit 1
fi

echo "対象: プロジェクト=$PROJECT データベース=$DB_NAME"
echo "$DUMP_FILE の内容で上書きします。現在のデータは失われます。"
read -r -p "続行しますか？ [yes/N] " answer
if [ "$answer" != "yes" ]; then
  echo "中止しました。"
  exit 1
fi

echo "DB をリストアします…"
docker compose -f "$COMPOSE_FILE" -p "$PROJECT" exec -T db \
  pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists < "$DUMP_FILE"

if [ -n "$ATTACH_FILE" ]; then
  if [ ! -f "$ATTACH_FILE" ]; then
    echo "添付ファイルのアーカイブが見つかりません: $ATTACH_FILE" >&2
    exit 1
  fi
  echo "添付ファイルをリストアします…"
  docker run --rm \
    -v atlasquarry-attachments:/data \
    -v "$(cd "$(dirname "$ATTACH_FILE")" && pwd)":/backup:ro \
    alpine sh -c "rm -rf /data/* && tar xzf /backup/$(basename "$ATTACH_FILE") -C /data"
fi

echo "完了しました。アプリを再起動してください:"
echo "  docker compose -f $COMPOSE_FILE -p $PROJECT restart app"
