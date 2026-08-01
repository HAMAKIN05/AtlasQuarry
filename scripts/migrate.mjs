/**
 * マイグレーション適用。
 *
 * 開発でもコンテナ内でも**同じファイルを実行する**ため、TypeScript ではなく素の ESM で書いている。
 * standalone 出力には tsx が含まれず、ビルド生成物を1つ増やすと「本番で流したSQLが手元と違う」
 * という事故が起きうるため。
 *
 *   開発  : npm run db:migrate
 *   本番  : docker compose -f docker/compose.yml run --rm app node scripts/migrate.mjs
 *
 * 拡張（pgcrypto / pg_bigm）はマイグレーション本体より先に必要になる。Docker の初回起動時は
 * docker/postgres/initdb/00-extensions.sql が作るが、既存ボリュームや外部の PostgreSQL に対しては
 * 実行されないため、ここでも冪等に作成する。
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL が設定されていません');
  }

  const pool = new Pool({ connectionString, max: 1 });
  const db = drizzle(pool);

  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_bigm`);
    console.log('拡張を確認しました: pgcrypto, pg_bigm');

    await migrate(db, { migrationsFolder });
    console.log('マイグレーションを適用しました');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  // 接続文字列にはパスワードが含まれるため、error をそのまま出さず message だけにする
  console.error('マイグレーションに失敗しました:', error instanceof Error ? error.message : error);
  process.exit(1);
});
