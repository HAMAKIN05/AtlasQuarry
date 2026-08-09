# AtlasQuarry DB設計書 v1.0

PostgreSQL 16 + pg_bigm。ORM は Drizzle。

本書の DDL は仕様の正本。Drizzle スキーマはこれに一致させる。

---

## 1. 初期セットアップ

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_bigm;    -- 日本語全文検索
```

`pg_bigm` は公式イメージに含まれない。`docker/postgres/Dockerfile` でインストールする。

---

## 2. 列挙型

Drizzle 側では Union 型 + `as const` で表現し、DB 側は `text` + `CHECK` 制約とする。
PostgreSQL の `ENUM` 型は値の追加・削除が面倒なため使わない。

```sql
-- 値の一覧（CHECK 制約で使用）
-- actor_type      : human, agent
-- actor_role      : owner, manager, developer, requester, agent
-- provider        : discord, github
-- api_scope       : read, read_write
-- product_status  : planning, active, paused, archived
-- feature_status  : planning, active, done, cancelled
-- task_status     : backlog, todo, in_progress, review, done, cancelled
-- task_priority   : urgent, high, normal, low
-- dependency_type : FS
-- request_source  : web, discord_command
-- request_status  : received, reviewing, accepted, rejected, done
-- document_type   : spec, knowledge, minutes
-- target_type     : task, request, document, comment
-- worklog_source  : manual, agent
-- entity_type     : product, feature, task, request, document, comment
-- activity_action : create, update, delete, status_change, comment, complete, triage
-- notify_channel  : web, mail, discord
-- queue_status    : pending, processing, sent, failed
-- integration_provider : discord, github, smtp
-- decision_source : discord, web
```

---

## 3. DDL

### 3.1 アクター・認証

```sql
CREATE TABLE actor (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL CHECK (type IN ('human','agent')),
  name          text NOT NULL,
  user_id       text UNIQUE,
  email         text UNIQUE,
  role          text NOT NULL CHECK (role IN ('owner','manager','developer','requester','agent')),
  password_hash text,
  totp_secret   text,
  avatar_url    text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT human_needs_credentials
    CHECK (type <> 'human' OR (user_id IS NOT NULL AND password_hash IS NOT NULL))
);

CREATE TABLE actor_external_id (
  actor_id    uuid NOT NULL REFERENCES actor(id) ON DELETE CASCADE,
  provider    text NOT NULL CHECK (provider IN ('discord','github')),
  external_id text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, provider),
  UNIQUE (provider, external_id)
);

CREATE TABLE session (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   uuid NOT NULL REFERENCES actor(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  ip         inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_session_actor ON session(actor_id);
CREATE INDEX idx_session_expires ON session(expires_at);

CREATE TABLE invitation (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  role       text NOT NULL CHECK (role IN ('owner','manager','developer','requester')),
  created_by uuid NOT NULL REFERENCES actor(id),
  expires_at timestamptz NOT NULL,
  max_uses   smallint NOT NULL DEFAULT 1,
  used_count smallint NOT NULL DEFAULT 0,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ログイン試行の記録。技術仕様書 §2.5 のレート制限（5回 / 15分 / IP+ユーザーID）に使う。
-- 判定は常に直近15分の窓で行う。古い行の切り詰めは運用側で行う。
CREATE TABLE login_attempt (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  ip         inet,
  succeeded  boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_attempt_identifier ON login_attempt(identifier, created_at DESC);
CREATE INDEX idx_login_attempt_ip    ON login_attempt(ip, created_at DESC);

CREATE TABLE api_key (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid NOT NULL REFERENCES actor(id) ON DELETE CASCADE,
  name        text NOT NULL,
  key_hash    text NOT NULL UNIQUE,
  scope       text NOT NULL CHECK (scope IN ('read','read_write')),
  product_ids uuid[],
  expires_at  timestamptz,
  revoked_at  timestamptz,
  last_used_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

### 3.2 プロダクト・開発項目・タスク

```sql
CREATE TABLE product (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE CHECK (key ~ '^[A-Z][A-Z0-9]{1,9}$'),
  name        text NOT NULL,
  description text,
  status      text NOT NULL DEFAULT 'planning'
              CHECK (status IN ('planning','active','paused','archived')),
  owner_id    uuid NOT NULL REFERENCES actor(id),
  task_seq    integer NOT NULL DEFAULT 0,   -- タスクキー採番用
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 画面表示名は「開発項目」
CREATE TABLE feature (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  status      text NOT NULL DEFAULT 'planning'
              CHECK (status IN ('planning','active','done','cancelled')),
  start_date  date,          -- 手動オーバーライド。未設定ならタスクから導出
  due_date    date,          -- 同上
  position    double precision NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_feature_product ON feature(product_id);

CREATE TABLE task (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  feature_id       uuid REFERENCES feature(id) ON DELETE SET NULL,
  parent_task_id   uuid REFERENCES task(id) ON DELETE CASCADE,
  key              text NOT NULL UNIQUE,      -- 例: PRD-123
  title            text NOT NULL,
  body_md          text,
  status           text NOT NULL DEFAULT 'backlog'
                   CHECK (status IN ('backlog','todo','in_progress','review','done','cancelled')),
  priority         text NOT NULL DEFAULT 'normal'
                   CHECK (priority IN ('urgent','high','normal','low')),
  assignee_id      uuid REFERENCES actor(id) ON DELETE SET NULL,
  reporter_id      uuid NOT NULL REFERENCES actor(id),
  estimate_minutes integer CHECK (estimate_minutes IS NULL OR estimate_minutes > 0),
  start_date       date,
  due_date         date,
  position         double precision NOT NULL,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT date_order CHECK (start_date IS NULL OR due_date IS NULL OR start_date <= due_date),
  CONSTRAINT done_has_timestamp CHECK (status <> 'done' OR completed_at IS NOT NULL)
);
CREATE INDEX idx_task_product ON task(product_id);
CREATE INDEX idx_task_feature ON task(feature_id);
CREATE INDEX idx_task_assignee ON task(assignee_id);
CREATE INDEX idx_task_status ON task(product_id, status);
CREATE INDEX idx_task_due ON task(due_date) WHERE status NOT IN ('done','cancelled');
CREATE INDEX idx_task_parent ON task(parent_task_id);

CREATE TABLE task_dependency (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  predecessor_id uuid NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  successor_id   uuid NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  type           text NOT NULL DEFAULT 'FS' CHECK (type = 'FS'),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (predecessor_id, successor_id),
  CONSTRAINT no_self_dependency CHECK (predecessor_id <> successor_id)
);

CREATE TABLE label (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES product(id) ON DELETE CASCADE,  -- null ならグローバル
  name       text NOT NULL,
  color      text NOT NULL DEFAULT '#888888',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE task_label (
  task_id  uuid NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES label(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);
```

**タスクキーの採番**: `product.task_seq` を `UPDATE ... RETURNING` でインクリメントし、`{product.key}-{seq}` を組み立てる。同一トランザクション内で行うことで採番の重複を防ぐ。

### 3.3 要望

```sql
CREATE TABLE request (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        uuid REFERENCES product(id) ON DELETE SET NULL,
  title             text NOT NULL,
  body_md           text,
  reporter_id       uuid NOT NULL REFERENCES actor(id),
  source            text NOT NULL DEFAULT 'web'
                    CHECK (source IN ('web','discord_command')),
  source_ref        text,
  status            text NOT NULL DEFAULT 'received'
                    CHECK (status IN ('received','reviewing','accepted','rejected','done')),
  converted_task_id uuid REFERENCES task(id) ON DELETE SET NULL,
  decided_by        uuid REFERENCES actor(id),
  decided_at        timestamptz,
  reject_reason     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rejected_needs_reason
    CHECK (status <> 'rejected' OR reject_reason IS NOT NULL)
);
CREATE INDEX idx_request_status ON request(status);
CREATE INDEX idx_request_product ON request(product_id);
```

### 3.4 ドキュメント

```sql
CREATE TABLE document (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid REFERENCES product(id) ON DELETE CASCADE,
  parent_id    uuid REFERENCES document(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN ('spec','knowledge','minutes')),
  title        text NOT NULL,
  body_md      text NOT NULL DEFAULT '',
  position     double precision NOT NULL,
  meeting_date date,                       -- type='minutes' のみ
  is_confirmed boolean NOT NULL DEFAULT false,
  locked_by    uuid REFERENCES actor(id) ON DELETE SET NULL,
  locked_at    timestamptz,
  created_by   uuid NOT NULL REFERENCES actor(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT minutes_only_fields
    CHECK (type = 'minutes' OR (meeting_date IS NULL AND is_confirmed = false))
);
CREATE INDEX idx_document_parent ON document(parent_id);
CREATE INDEX idx_document_product ON document(product_id);
CREATE INDEX idx_document_type ON document(type);

CREATE TABLE document_revision (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  body_md     text NOT NULL,
  author_id   uuid NOT NULL REFERENCES actor(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_revision_document ON document_revision(document_id, created_at DESC);

CREATE TABLE decision_note (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES document(id) ON DELETE SET NULL,
  body        text NOT NULL,
  source      text NOT NULL CHECK (source IN ('discord','web')),
  source_ref  text,
  author_id   uuid NOT NULL REFERENCES actor(id),
  is_merged   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_decision_unmerged ON decision_note(is_merged, created_at DESC);
```

### 3.5 コメント・添付

```sql
CREATE TABLE comment (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('task','request','document')),
  target_id   uuid NOT NULL,
  author_id   uuid NOT NULL REFERENCES actor(id),
  body_md     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_comment_target ON comment(target_type, target_id, created_at);

CREATE TABLE attachment (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('task','request','document','comment')),
  target_id   uuid NOT NULL,
  filename    text NOT NULL,
  size_bytes  bigint NOT NULL CHECK (size_bytes > 0),
  mime_type   text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  uploader_id uuid NOT NULL REFERENCES actor(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_attachment_target ON attachment(target_type, target_id);
```

**ポリモーフィック参照のため外部キー制約は張れない。** 対象削除時のクリーンアップはアプリケーション側で行う。

### 3.6 作業記録

```sql
CREATE TABLE work_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   uuid NOT NULL REFERENCES actor(id) ON DELETE CASCADE,
  task_id    uuid NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  work_date  date NOT NULL,
  minutes    integer NOT NULL CHECK (minutes > 0 AND minutes <= 1440),
  note       text,
  source     text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','agent')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_worklog_actor_date ON work_log(actor_id, work_date);
CREATE INDEX idx_worklog_task ON work_log(task_id);

CREATE TABLE activity (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid NOT NULL REFERENCES actor(id) ON DELETE CASCADE,
  entity_type text NOT NULL
              CHECK (entity_type IN ('product','feature','task','request','document','comment')),
  entity_id   uuid NOT NULL,
  action      text NOT NULL
              CHECK (action IN ('create','update','delete','status_change','comment','complete','triage')),
  diff_json   jsonb,
  weight      smallint NOT NULL DEFAULT 1,
  ip          inet,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_actor_date ON activity(actor_id, created_at DESC);
CREATE INDEX idx_activity_entity ON activity(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_activity_created ON activity(created_at DESC);

CREATE TABLE agent_session (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        uuid NOT NULL REFERENCES actor(id) ON DELETE CASCADE,
  task_id         uuid REFERENCES task(id) ON DELETE SET NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  tool_call_count integer NOT NULL DEFAULT 0,
  summary         text,
  token_usage     integer
);
CREATE INDEX idx_agent_session_task ON agent_session(task_id);
CREATE INDEX idx_agent_session_agent ON agent_session(agent_id, started_at DESC);
```

**`activity` は削除・改変しない。** UPDATE / DELETE を発行するコードを書かないこと。

### 3.7 通知

```sql
CREATE TABLE notification (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id           uuid NOT NULL REFERENCES actor(id) ON DELETE CASCADE,
  event_type         text NOT NULL,
  target_type        text,
  target_id          uuid,
  title              text NOT NULL,
  body               text NOT NULL,
  url                text,
  is_read            boolean NOT NULL DEFAULT false,
  delivered_channels text[] NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notification_unread ON notification(actor_id, is_read, created_at DESC);

CREATE TABLE notification_pref (
  actor_id   uuid NOT NULL REFERENCES actor(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  channel    text NOT NULL CHECK (channel IN ('web','mail','discord')),
  enabled    boolean NOT NULL DEFAULT true,
  PRIMARY KEY (actor_id, event_type, channel)
);

CREATE TABLE notification_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel       text NOT NULL CHECK (channel IN ('mail','discord')),
  payload_json  jsonb NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','processing','sent','failed')),
  attempts      smallint NOT NULL DEFAULT 0,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_queue_pending ON notification_queue(status, next_retry_at)
  WHERE status = 'pending';
```

### 3.8 設定・連携

```sql
CREATE TABLE integration (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider         text NOT NULL CHECK (provider IN ('discord','github','smtp')),
  config_encrypted bytea NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  product_id       uuid REFERENCES product(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_setting (
  key        text PRIMARY KEY,
  value_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

---

## 4. 全文検索インデックス

```sql
CREATE INDEX idx_task_title_bigm     ON task     USING gin (title gin_bigm_ops);
CREATE INDEX idx_task_body_bigm      ON task     USING gin (body_md gin_bigm_ops);
CREATE INDEX idx_request_title_bigm  ON request  USING gin (title gin_bigm_ops);
CREATE INDEX idx_request_body_bigm   ON request  USING gin (body_md gin_bigm_ops);
CREATE INDEX idx_document_title_bigm ON document USING gin (title gin_bigm_ops);
CREATE INDEX idx_document_body_bigm  ON document USING gin (body_md gin_bigm_ops);
```

検索語は **2文字以上** に制限する。1文字では GIN インデックスが効かない。

---

## 5. 初期データ

```sql
-- ヒートマップの重み
INSERT INTO app_setting (key, value_json) VALUES
('activity.weights', '{
  "complete": 5,
  "document.create": 3,
  "document.update": 3,
  "create": 2,
  "update": 2,
  "triage": 2,
  "comment": 1,
  "status_change": 1
}'::jsonb),
('heatmap.thresholds', '[1, 5, 12, 25]'::jsonb),
('upload.maxBytes', '52428800'::jsonb),
('upload.allowedExtensions',
  '["png","jpg","jpeg","gif","webp","svg","pdf","md","txt","csv","xlsx","docx","pptx","zip","json","yaml","yml","log"]'::jsonb);
```

---

## 6. マイグレーション方針

- Drizzle Kit で生成し、**内容を目視確認してからコミット**する
- **既存のマイグレーションファイルを編集しない。** 修正は新しいマイグレーションで行う
- 破壊的変更（カラム削除、型変更）は、追加 → データ移行 → 削除の3段階に分ける
- 本番適用前に必ず `pg_dump` を取る

---

## 7. バックアップ

```bash
# 論理バックアップ（DB名は atlasquarry）
docker compose -p atlasquarry exec -T db pg_dump -U "$PGUSER" -Fc atlasquarry > dump.pgc

# 添付ファイル
docker run --rm -v atlasquarry-attachments:/data -v "$PWD":/backup alpine \
  tar czf /backup/attachments.tar.gz -C /data .
```

保持世代: 日次7 + 週次4 + 月次6。VPS 外へ転送する。

**月1回、リストア手順を実際に実行して検証する。**

```bash
# リストア
docker compose -p atlasquarry exec -T db pg_restore -U "$PGUSER" -d atlasquarry --clean < dump.pgc
```

---

## 8. 制約に関する注意

| 箇所 | 注意 |
|---|---|
| `comment` / `attachment` | ポリモーフィック参照のため FK なし。削除時のクリーンアップはアプリ側 |
| `task.key` | `product.task_seq` の採番と同一トランザクションで生成 |
| `activity` | UPDATE / DELETE を発行しない |
| `position` | `double precision`。差が `1e-6` 未満になったら再採番 |
| `feature` の日付・進捗 | 原則タスクから導出。カラムの値は手動オーバーライド用 |
| タイムゾーン | 集計時は `AT TIME ZONE 'Asia/Tokyo'` を明示。UTC のままだと日付境界がずれる |
