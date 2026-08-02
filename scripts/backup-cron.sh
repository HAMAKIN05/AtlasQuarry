#!/usr/bin/env bash
#
# 毎日のバックアップと世代の整理（DB設計書 §7）。cron から呼ぶ。
#
#   0 4 * * * /opt/atlasquarry/scripts/backup-cron.sh >> /var/log/atlasquarry-backup.log 2>&1
#
# 保持: 日次7 + 週次4（月曜） + 月次6（1日）。
#
# **世代の整理を backup.sh に入れない。** backup.sh は手元でも実行するもので、
# そこに削除を混ぜると、手で1回取ったつもりが古いものを消す。
set -euo pipefail

cd /opt/atlasquarry

BASE="${BACKUP_DIR:-/opt/atlasquarry/backups}"
DAY="$(date +%u)"    # 1=月曜
DOM="$(date +%d)"

if [ "$DOM" = "01" ]; then
  DIR="$BASE/monthly"; KEEP=6
elif [ "$DAY" = "1" ]; then
  DIR="$BASE/weekly";  KEEP=4
else
  DIR="$BASE/daily";   KEEP=7
fi

mkdir -p "$DIR"

COMPOSE_FILE=/opt/atlasquarry/compose.yml \
  /opt/atlasquarry/scripts/backup.sh "$DIR"

# 世代を落とす。**新しい方から数えて KEEP 個を残す**（古い順に消すのではなく）
for pattern in 'atlasquarry-*.pgc' 'atlasquarry-attachments-*.tar.gz'; do
  # shellcheck disable=SC2012
  ls -1t "$DIR"/$pattern 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
    echo "古い世代を消します: $old"
    rm -f "$old"
  done
done

echo "$(date '+%Y-%m-%d %H:%M:%S') バックアップ完了 ($DIR)"
