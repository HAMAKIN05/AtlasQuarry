-- 全文検索インデックスと初期データ（DB設計書 §4 / §5）。
-- Drizzle では gin_bigm_ops を表現できないため手書きの custom マイグレーションにしている。
--
-- 拡張（pgcrypto / pg_bigm）は本マイグレーションより前に作られている必要がある。
-- 作成は docker/postgres/initdb/00-extensions.sql と scripts/migrate.ts の両方で行う。

CREATE INDEX IF NOT EXISTS "idx_task_title_bigm"     ON "task"     USING gin ("title" gin_bigm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_body_bigm"      ON "task"     USING gin ("body_md" gin_bigm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_request_title_bigm"  ON "request"  USING gin ("title" gin_bigm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_request_body_bigm"   ON "request"  USING gin ("body_md" gin_bigm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_document_title_bigm" ON "document" USING gin ("title" gin_bigm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_document_body_bigm"  ON "document" USING gin ("body_md" gin_bigm_ops);--> statement-breakpoint

-- ヒートマップの重みなど、運用後に調整する値。ハードコードしない（技術仕様書 §6.2）。
-- 運用側で調整済みの値を上書きしないため ON CONFLICT DO NOTHING にする。
INSERT INTO "app_setting" ("key", "value_json") VALUES
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
  '["png","jpg","jpeg","gif","webp","svg","pdf","md","txt","csv","xlsx","docx","pptx","zip","json","yaml","yml","log"]'::jsonb)
ON CONFLICT ("key") DO NOTHING;
