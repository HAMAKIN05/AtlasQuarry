-- ログイン識別子をメールアドレスからユーザーIDへ分離する。
-- email は通知・連絡先用の任意情報として残す。

ALTER TABLE "actor" ADD COLUMN "user_id" text;

-- 既存データを復旧する場合もログインできるよう、旧メールを仮ユーザーIDへ引き継ぐ。
UPDATE "actor"
SET "user_id" = lower(trim("email"))
WHERE "type" = 'human' AND "email" IS NOT NULL AND "user_id" IS NULL;

ALTER TABLE "actor" ADD CONSTRAINT "actor_user_id_unique" UNIQUE("user_id");

ALTER TABLE "actor" DROP CONSTRAINT IF EXISTS "human_needs_credentials";
ALTER TABLE "actor" ADD CONSTRAINT "human_needs_credentials"
  CHECK ("type" <> 'human' OR ("user_id" IS NOT NULL AND "password_hash" IS NOT NULL));

ALTER TABLE "login_attempt" RENAME COLUMN "email" TO "identifier";
ALTER INDEX "idx_login_attempt_email" RENAME TO "idx_login_attempt_identifier";
