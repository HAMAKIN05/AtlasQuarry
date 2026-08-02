-- activity.entity_type に 'actor' を許す。
--
-- ログイン画面からの自己登録でアカウント（actor）を作るため。
-- CLAUDE.md 絶対ルール3「全ての書き込み操作は activity に記録する」を満たすには、
-- アカウント作成の記録先が要る。
--
-- 既存のマイグレーションは編集せず、CHECK 制約を張り直す。

ALTER TABLE "activity" DROP CONSTRAINT IF EXISTS "activity_entity_type_check";

ALTER TABLE "activity" ADD CONSTRAINT "activity_entity_type_check"
  CHECK ("entity_type" IN ('product', 'feature', 'task', 'request', 'document', 'comment', 'actor'));
