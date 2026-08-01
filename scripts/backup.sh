#!/usr/bin/env bash
#
# バックアップ（DB設計書 §7）。
#
#   ./scripts/backup.sh [出力先ディレクトリ]
#
# 出力:
#   <出力先>/atlasquarry-YYYYmmdd-HHMMSS.pgc          論理バックアップ
#   <出力先>/atlasquarry-attachments-YYYYmmdd-HHMMSS.tar.gz
#
# ホスト側のパスに依存させず、docker volume 経由で吸い出す（機能定義書 §12.6）。
# 保持世代（日次7 + 週次4 + 月次6）と VPS 外への転送は、このスクリプトを呼ぶ側で行う。
#
# **月1回、scripts/restore.sh を実際に実行して検証すること。**（DB設計書 §7）
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker/compose.yml}"
PROJECT="${COMPOSE_PROJECT_NAME:-atlasquarry}"
OUT_DIR="${1:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"

DB_USER="${POSTGRES_USER:-atlasquarry}"
DB_NAME="${POSTGRES_DB:-atlasquarry}"

mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"

DUMP_FILE="$OUT_DIR/atlasquarry-$STAMP.pgc"
ATTACH_FILE="$OUT_DIR/atlasquarry-attachments-$STAMP.tar.gz"

echo "DB をダンプします → $DUMP_FILE"
docker compose -f "$COMPOSE_FILE" -p "$PROJECT" exec -T db \
  pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$DUMP_FILE"

# 0バイトのダンプを「成功」として残すと、必要なときに気づく
if [ ! -s "$DUMP_FILE" ]; then
  echo "ダンプが空です。中止します。" >&2
  rm -f "$DUMP_FILE"
  exit 1
fi

echo "添付ファイルを固めます → $ATTACH_FILE"
docker run --rm \
  -v atlasquarry-attachments:/data:ro \
  -v "$OUT_DIR":/backup \
  alpine tar czf "/backup/$(basename "$ATTACH_FILE")" -C /data .

echo "完了:"
ls -lh "$DUMP_FILE" "$ATTACH_FILE"
