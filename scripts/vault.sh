#!/usr/bin/env bash
#
# リポジトリと Obsidian vault の写しを突き合わせる。
#
# 利用者が読むのは vault（Documents\博真会）であってリポジトリではない。
# 写しが古いまま放置され、指摘を受けて直した表記が利用者に伝わっていなかったことがある。
# **リポジトリが常に正**で、逆向き（vault → リポジトリ）の反映はしない。
#
#   scripts/vault.sh check   一致しているか確認する（作業の開始時と終了時）
#   scripts/vault.sh sync    リポジトリ → vault へ写し、そのまま一致を確認する
#
# 一致していなければ終了コード 1。**確認せずに「同期しました」と言わないための道具。**

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VAULT="/mnt/c/Users/OWNER/Documents/博真会/AtlasQuarry"

# リポジトリ側のパス:vault 側のファイル名
FILES=(
  "CLAUDE.md:CLAUDE.md"
  "docs/v0.1スコープ.md:v0.1スコープ.md"
  "docs/DB設計書.md:DB設計書.md"
  "docs/技術仕様書.md:技術仕様書.md"
  "docs/機能定義書_v1.0.md:機能定義書_v1.0.md"
)

if [ ! -d "$VAULT" ]; then
  echo "vault が見つからない: $VAULT" >&2
  exit 1
fi

check() {
  local ng=0
  for pair in "${FILES[@]}"; do
    local src="$REPO/${pair%%:*}" dst="$VAULT/${pair#*:}" name="${pair#*:}"
    if [ ! -f "$src" ]; then
      printf '  ✗ %-24s リポジトリに無い\n' "$name"; ng=1
    elif [ ! -f "$dst" ]; then
      printf '  ✗ %-24s vault に無い\n' "$name"; ng=1
    elif diff -q "$src" "$dst" >/dev/null; then
      printf '  ✓ %-24s 一致\n' "$name"
    else
      printf '  ✗ %-24s 差分あり（リポジトリ %s行 / vault %s行）\n' \
        "$name" "$(wc -l < "$src")" "$(wc -l < "$dst")"; ng=1
    fi
  done

  # 作業ログは vault にしか無い。書き忘れの検出はここでは行わないが、在処は示す
  printf '  — 作業ログ: %s\n' "$VAULT/作業ログ/"
  return $ng
}

case "${1:-check}" in
  check)
    echo "リポジトリと vault の一致を確認"
    check || { echo; echo "一致していない。scripts/vault.sh sync で写す"; exit 1; }
    ;;
  sync)
    echo "リポジトリ → vault へ写す"
    for pair in "${FILES[@]}"; do
      src="$REPO/${pair%%:*}"
      [ -f "$src" ] && cp "$src" "$VAULT/${pair#*:}"
    done
    echo "写したあとの確認"
    # コピーしただけで終わらせない。**必ずここを通す**
    check || { echo; echo "写したのに一致していない。手で確認すること"; exit 1; }
    ;;
  *)
    echo "使い方: scripts/vault.sh [check|sync]" >&2
    exit 1
    ;;
esac
