#!/usr/bin/env bash
#
# VPS へのコマンド実行。**素の ssh を直接叩かず、これを使う。**
#
#   scripts/vps.sh 'docker ps'
#   scripts/vps.sh 'docker logs atlasquarry-app --tail 50'
#   scripts/vps.sh --host nippou-vps 'uptime'
#
# なぜ包むか（2026-08-03）:
#
#   1. **`-F ~/.ssh/config` が要る。** codex のサンドボックスは user namespace の中で
#      動き、`/etc` の中身が root ではなく 65534 に見える。ssh は設定ファイルの持ち主を
#      厳密に見るので、素の ssh は
#      `Bad owner or permissions on /etc/ssh/ssh_config.d/20-systemd-ssh-proxy.conf`
#      で止まる。`-F` を付けるとシステム全体の設定を読まなくなり、この判定を通らない
#
#   2. **ホスト名を直接書くと繋がらない。** `owner@133.18.123.41` のように IP と
#      ログイン名を自分で組み立てると、利用者名も鍵も違う（正しくは `hakushinkai` と
#      `~/.ssh/nippou_prod`）。`~/.ssh/config` の別名を使えば間違えようがない
#
# 鍵の共有は要らない。Claude Code も codex も同じユーザーで動くので、
# `~/.ssh` をそのまま読める。
set -euo pipefail

HOST=nippou-prod
if [ "${1:-}" = "--host" ]; then
  HOST="$2"
  shift 2
fi

if [ $# -eq 0 ]; then
  echo "使い方: scripts/vps.sh [--host <別名>] '<コマンド>'" >&2
  exit 2
fi

exec ssh -F "$HOME/.ssh/config" -o ConnectTimeout=15 "$HOST" "$@"
