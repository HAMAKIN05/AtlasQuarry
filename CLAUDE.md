# CLAUDE.md — AtlasQuarry

**AtlasQuarry**（アトラスクォーリー）。法人内システム内製化プロジェクト向けのプロジェクト管理ツール。

作業フォルダ・リポジトリ名は `atlasquarry`。会話上の略称は AQ / Quarry。

利用者は3名（経営者・上司・開発者）＋AIエージェント。開発者は1名。
Docker で完全分離し、既存VPS上で稼働させる。

---

## 参照ドキュメント

作業前に必ず該当箇所を読むこと。

| ファイル | 内容 |
|---|---|
| `docs/機能定義書_v1.0.md` | 何を作るか。機能一覧、データモデル、画面一覧 |
| `docs/技術仕様書.md` | どう作るか。レイヤー構成、規約、実装方針 |
| `docs/DB設計書.md` | DDL、インデックス、マイグレーション方針 |
| `docs/v0.1スコープ.md` | **現在のフェーズ。ここに書かれたものだけを実装する** |

---

## 絶対ルール

### 1. フェーズ外の実装をしない

機能定義書には v1.1 までの全機能が書かれているが、**実装するのは現在のフェーズのものだけ**。

現在のフェーズは `docs/v0.1スコープ.md` を参照。スコープ外の機能について、テーブル定義以外の実装（画面・API・ロジック）を先回りして作らない。

「ついでに作っておく」は禁止。

### 2. 推測で仕様を埋めない

仕様書に書かれていない判断が必要になったら、実装を止めて確認する。特に以下は勝手に決めない。

- テーブル・カラムの追加
- 外部ライブラリの追加
- 認証・権限まわりの挙動
- ステータス遷移のルール

### 3. `activity` の記録を省略しない

全ての書き込み操作は `activity` に記録する。これはヒートマップ（F-16）とタスクタイムライン（S-06）の唯一のデータソースであり、記録漏れは機能の欠損に直結する。

記録はドメイン層のミューテーションと**同一トランザクション内**で行う。

### 4. 秘匿情報をログに出さない

以下は `console.log` / エラーメッセージ / スタックトレースに含めない。

- Discord Webhook URL
- API キー、セッショントークン、招待トークン
- パスワードハッシュ、TOTP シークレット
- `integration.config_encrypted` の復号結果

### 5. ブラウザストレージを使わない

`localStorage` / `sessionStorage` は使用しない。状態は React state とサーバー側セッションで管理する。

---

## 技術スタック

| 領域 | 採用 |
|---|---|
| 言語 | TypeScript（strict） |
| フレームワーク | Next.js（App Router） |
| DB | PostgreSQL 16 + pg_bigm |
| ORM | Drizzle ORM |
| 認証 | 自前実装（Argon2id + セッションCookie） |
| DnD | dnd-kit |
| スタイル | Tailwind CSS v4（設定ファイルは持たず `globals.css` の `@theme`） |
| UI部品 | shadcn/ui（Radix UI + cva）。`src/components/ui` に置いて自前で持つ |
| アイコン | lucide-react |
| Markdown | unified / remark |
| コンテナ | Docker Compose |

**追加ライブラリの導入は事前に確認すること。** 特に以下は採用しない方針。

- Auth.js / NextAuth（SSO前提で今回の要件に合わない）
- Redis / BullMQ（キューはDBベース。障害点を増やさない）
- ガントチャートライブラリ（SVG自前描画）
- UIフレームワーク一式（MUI / Chakra 等）。shadcn/ui は**コードをリポジトリに持つ**方式なので別扱い
- リッチテキストエディタ（プレーンMarkdown）

---

## ディレクトリ構成

```
src/
├── app/                    Next.js App Router
│   ├── (auth)/             未認証で入れる画面
│   ├── (app)/              認証必須の画面
│   └── api/
│       ├── v1/             REST API
│       ├── discord/        Interactions エンドポイント
│       └── webhooks/       GitHub 等
├── domain/                 ビジネスロジック（フレームワーク非依存）
│   ├── task/
│   ├── request/
│   ├── document/
│   ├── activity/
│   └── events/
├── db/
│   ├── schema/             Drizzle スキーマ
│   └── client.ts
├── infra/                  外部依存の実装
│   ├── storage/            StorageAdapter
│   ├── notifier/           NotifierAdapter
│   └── queue/
├── lib/                    横断的な小物
│   ├── auth/
│   ├── errors.ts
│   └── result.ts
└── components/             UI コンポーネント
```

### 依存の向き

```
app → domain → db
app → infra
```

**`domain/` から `next/*` を import しない。** ドメイン層は Next.js に依存させず、単体でテスト可能に保つ。

**`components/` から DB を直接触らない。** データ取得は Server Component か API 経由。

---

## コーディング規約

### 命名

| 対象 | 規則 | 例 |
|---|---|---|
| ファイル | kebab-case | `task-service.ts` |
| React コンポーネント | PascalCase | `KanbanBoard.tsx` |
| 変数・関数 | camelCase | `createTask` |
| 型・インターフェース | PascalCase | `TaskStatus` |
| DBテーブル・カラム | snake_case | `feature_id` |
| 定数 | UPPER_SNAKE_CASE | `MAX_UPLOAD_SIZE` |

### TypeScript

- `strict: true`。`any` は使わない。どうしても必要なら `unknown` + 絞り込み
- 型は `type` を優先。`interface` は拡張が必要な場合のみ
- enum は使わず、Union 型 + `as const` オブジェクトで表現する
- 関数の戻り値型は明示する（推論に任せない）

### エラー

- ドメイン層のエラーは `AppError` を継承した独自クラスで表現する
- API 層で HTTP ステータスに変換する（詳細は技術仕様書 §5）
- `catch` して握りつぶさない。ログに残すか再送出する

### コメント

- 「何をしているか」ではなく「なぜそうしたか」を書く
- 自明なコメントは書かない
- コード内コメントは日本語で構わない

---

## DB規約

- 主キーは `uuid`（`gen_random_uuid()`）
- 日時は `timestamptz`。日付のみは `date`
- 論理削除はしない。削除は物理削除で、履歴は `activity` に残す
- `position` は `double precision`。整数連番にしない（技術仕様書 §7）
- マイグレーションは Drizzle Kit で生成し、**手動で内容を確認してからコミットする**
- 既存マイグレーションファイルを編集しない。修正は新しいマイグレーションで行う

---

## UI規約

- **モバイルファースト。** ガント（S-07）と工数集計（S-16）を除く全画面は、スマホで実用的に操作できること
- 表示文言は日本語。**DB上の英語名を画面に出さない。** `feature` → 「開発項目」、`product` → 「プロジェクト」、`request` → 「要望」、`actor` → 「メンバー」
- **カタカナに置き換えただけの語を使わない。** 「プロダクト」は利用者に伝わらず作り直しになった。迷ったら、その画面を初めて見る人が意味を取れるかで判断する
- **既にあるタスク管理ツールの作法に寄せる。** 独自の比喩や凝った表現より、見た瞬間に使い方が分かることを優先する
- **空状態を「ありません」で終わらせない。** 何のための場所かを1行で説明し、次の操作へのボタンを置く
- ローディング・エラー・空状態を必ず用意する
- フォームは Server Actions か API を使う。React 内で `<form>` の標準 submit に依存しない

---

## 作業の進め方

1. 着手前に該当フェーズのスコープと受入基準を確認する
2. 変更が複数ファイルに及ぶ場合、先に方針を提示して確認を取る
3. 実装後、受入基準のどの項目を満たしたかを報告する
4. 型チェック（`tsc --noEmit`）とビルドが通ることを確認してから完了とする
5. **作業ログを残す**（下記）

### 記録は常に Obsidian に残す

`C:\Users\OWNER\Documents\博真会` が **Obsidian の vault 本体**。利用者はここを読む。
**記録はリポジトリだけに置かず、必ず vault に書く。**

| 何 | どこ |
|---|---|
| 作業ログ | `博真会\AtlasQuarry\作業ログ\作業報告_YYYYMMDD.md` |
| 仕様書の写し | `博真会\AtlasQuarry\`（`CLAUDE.md` と `docs/` の5文書） |
| 認証情報 | `博真会\AtlasQuarry\ログイン情報.md` |

**`CLAUDE.md` か `docs/` を直したら、同じ作業の中で vault の写しも更新する。**
更新を怠って、言い換えを指摘されて直した表記や前倒しした機能が vault に反映されないまま
利用者に読まれていた。**リポジトリだけ直すのは、古い方を読ませるぶん直さないより悪い。**

**リポジトリが常に正**（利用者は vault 側に書かない）。逆向きの反映はしない。
ただし **同期したら必ず一致を確認する。** コピーしたつもりで一致していないことがある。

```bash
scripts/vault.sh check   # 一致しているか確認する（作業の開始時と終了時）
scripts/vault.sh sync    # リポジトリ → vault へ写して、そのまま一致を確認する
```

**確認せずに「同期しました」と言わない。** `sync` は最後に必ず `check` を通す。

**作業した日は必ず作業報告を書く。** 同じ vault の他プロジェクト（`SNS分析/作業ログ/`、
`05_作業ログ/日報自動化/`）と同じ形式に揃える。frontmatter（`title` / `tags`）＋
`## この日やったこと` ＋ `## 残っていること`。

書くのは**決定と根拠、そして踏んだ失敗**。何を変えたかはコミットログを見れば分かるので、
なぜそうしたか・何を確認したか・次に何が残っているかを書く。同日に追記する場合は
同じファイルに足す（日付ごとに1ファイル）。

### コミットメッセージ

```
<type>: <要約>

type: feat / fix / refactor / docs / chore / test
```

タスクキーがある場合は要約の先頭に付ける。

```
feat: PRD-12 かんばんのドラッグ&ドロップを実装
```

GitHub 連携（F-27）でこのキーを検出してタスクに紐付けるため、形式を守ること。

---

## ビルドとデプロイ

**VPS 上でビルドしない。**

Next.js の本番ビルドは瞬間的に 2〜4GB のメモリを消費する。既存アプリが稼働中の VPS で実行すると OOM Killer が予期しないプロセスを止める。

```
ローカル: docker build -t atlasquarry:latest .
          docker save atlasquarry:latest | gzip > atlasquarry.tar.gz
転送    : scp atlasquarry.tar.gz vps:~/
VPS     : gunzip -c atlasquarry.tar.gz | docker load
          docker compose up -d
```

Compose プロジェクト名は `atlasquarry`。コンテナは `atlasquarry-app` / `atlasquarry-db`、
ボリュームは `atlasquarry-db-data` / `atlasquarry-attachments`。
**既存アプリのリソース名と衝突しないよう、接頭辞を省略しないこと。**

VPS 上での `npm run build` や `docker build` を提案しないこと。

---

## やってはいけないこと

- 現在フェーズ外の機能を実装する
- テーブル・カラムを独断で追加する
- 承認なくライブラリを追加する
- `activity` の記録を省略する
- 秘匿情報をログに出す
- `localStorage` / `sessionStorage` を使う
- 既存マイグレーションを編集する
- VPS 上でのビルド手順を書く
- Discord との双方向同期を実装する（スコープ外）
