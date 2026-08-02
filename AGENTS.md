# AGENTS.md — AtlasQuarry

**まず `CLAUDE.md` を読むこと。** 方針・規約・禁止事項はすべてそこにある。
この文書は、それに加えてこの環境でつまずく点だけを書く。

## VPS には `scripts/vps.sh` から入る

```bash
scripts/vps.sh 'docker ps'
scripts/vps.sh 'docker logs atlasquarry-app --tail 50'
```

**`ssh` を直接叩かない。** 2つの理由がある。

1. **`-F ~/.ssh/config` が要る。** このサンドボックスは user namespace の中で動き、
   `/etc` の中身が root ではなく 65534 に見える。ssh は設定ファイルの持ち主を厳密に
   見るので、素の `ssh` は
   `Bad owner or permissions on /etc/ssh/ssh_config.d/20-systemd-ssh-proxy.conf`
   で止まる。`-F` を付けるとシステム全体の設定を読まなくなり、この判定を通らない

2. **IP とログイン名を自分で組み立てない。** `owner@133.18.123.41` では入れない。
   正しくは利用者 `hakushinkai`・鍵 `~/.ssh/nippou_prod` で、どちらも
   `~/.ssh/config` の `nippou-prod` に書いてある

**鍵は渡されていないのではなく、既に読める。** `~/.ssh/nippou_prod` は同じユーザー
（`owner`）の持ち物で、このプロセスから読める。`SSH_AUTH_SOCK` は要らない。
`Permission denied (publickey)` が出たときは、鍵が無いのではなく**別名を使わずに
IP を直接指定している**ことを疑うこと。

`~/.ssh` には書けないので、**known_hosts に登録済みのホストにしか繋がらない**
（`nippou-prod` / `nippou-vps` は登録済み）。新しいサーバーは人に登録してもらう。

## ビルドの前に走るもの

`npm run build` は `scripts/check-routes.mjs` を先に走らせる。同じ階層に別名の
動的セグメント（`[key]` と `[idOrKey]` など）があると、ビルドは通るのに起動時に
全ページが 500 になるため。新しい API を足すときは既存のセグメント名に合わせる。

## VPS 上でビルドしない

Next.js の本番ビルドは瞬間的に 2〜4GB 使う。既存アプリが動いている VPS で実行すると
OOM Killer が無関係なプロセスを止める。手元でイメージを作って転送する（`CLAUDE.md` 参照）。
