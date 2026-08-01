# AtlasQuarry

法人内システム内製化プロジェクト向けのプロジェクト管理ツール。

仕様は `docs/` にある。実装方針とルールは `CLAUDE.md` を参照。
**現在のフェーズは v0.1。`docs/v0.1スコープ.md` に書かれたものだけを実装する。**

---

## 開発環境の立ち上げ

```bash
# 1. 依存関係
npm install

# 2. 環境変数
cp .env.example .env
#   SESSION_SECRET / ENCRYPTION_KEY を生成して埋める
#     openssl rand -base64 32
#   SEED_*_EMAIL / SEED_*_PASSWORD も埋める（パスワードは12文字以上）
#   DATABASE_URL は下の dev DB に合わせて 127.0.0.1:5433 を指す

# 3. DB（pg_bigm 入り PostgreSQL 16）
docker compose -f docker/compose.dev.yml up -d --build

# 4. マイグレーションとシード
npm run db:migrate
npm run db:seed

# 5. 起動
npm run dev     # http://localhost:3000
```

開発用の DB はループバックの **5433** に出している。本番（`docker/compose.yml`）では
db をホストに publish しない。

## よく使うコマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm run build` | 本番ビルド |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | vitest（rbac / position / ステータス遷移） |
| `npm run db:generate` | スキーマからマイグレーション生成。**内容を目視確認してからコミットする** |
| `npm run db:migrate` | マイグレーション適用 |
| `npm run db:seed` | 初期ユーザー投入（既存メールはスキップ） |

### WSL + `/mnt/c` で開発する場合

Windows のドライブ上ではファイル変更イベントが伝わらず、`next dev` が編集を検知しない。
**編集後は dev サーバーを再起動すること。** 動いているつもりで古いコードを検証してしまう。

---

## デプロイ

**VPS 上でビルドしない**（`CLAUDE.md` / 機能定義書 §12.5）。

```bash
# ローカル
docker build -t atlasquarry:latest .
docker save atlasquarry:latest | gzip > atlasquarry.tar.gz
scp atlasquarry.tar.gz vps:~/

# VPS
gunzip -c atlasquarry.tar.gz | docker load
docker compose -f docker/compose.yml --env-file .env up -d

# マイグレーション（起動時に自動適用はしない。事前に pg_dump を取ること）
docker compose -f docker/compose.yml run --rm app node scripts/migrate.mjs
docker compose -f docker/compose.yml run --rm app node scripts/seed.mjs
```

ホスト側 Caddy に以下を足す。

```
quarry.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

## バックアップ

```bash
./scripts/backup.sh ./backups
./scripts/restore.sh ./backups/atlasquarry-YYYYmmdd-HHMMSS.pgc
```

**月1回、リストアを実際に実行して検証する**（DB設計書 §7）。検証は本番ではなく
`docker/compose.dev.yml` で立てた別 DB に対して行う。

---

## 構成

```
src/
├── app/          Next.js App Router（画面と /api/v1）
├── domain/       ビジネスロジック。next/* を import しない
├── db/           Drizzle スキーマとクライアント
├── infra/        外部依存の実装（暗号化など）
└── lib/          横断的な小物（エラー、権限、認証、整形）
```

依存の向きは `app → domain → db` と `app → infra`。詳細は `docs/技術仕様書.md` §1。
