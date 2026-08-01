-- DB設計書 §1。データベース初回作成時のみ実行される。
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_bigm;    -- 日本語全文検索
