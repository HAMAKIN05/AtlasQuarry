/**
 * 初期ユーザーの投入（v0.1スコープ §1）。招待機能（F-10）は v0.2 のため、
 * v0.1 では 3 名分のアカウントをこのスクリプトで作る。
 *
 * migrate.mjs と同じ理由で素の ESM。開発でもコンテナ内でも同じファイルを実行する。
 *
 *   開発  : npm run db:seed
 *   本番  : docker compose -f docker/compose.yml run --rm app node scripts/seed.mjs
 *
 * パスワードは環境変数から読む。**スクリプトに直書きしない。**
 * 既に同じメールの actor が居る場合は何もしない（再実行してもパスワードを上書きしない）。
 */
import { hash } from '@node-rs/argon2';
import { Pool } from 'pg';

const ARGON2_OPTIONS = {
  algorithm: 2, // argon2id
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
};

const PASSWORD_MIN_LENGTH = 12;

/** 利用者は3名（経営者・上司・開発者）。CLAUDE.md 冒頭の前提に対応する。 */
// 名前は SEED_*_NAME で必ず実名を渡すこと。既定値のままだと画面に役割名が人名として出る
const SEED_ACTORS = [
  { role: 'owner', envPrefix: 'SEED_OWNER', defaultName: 'オーナー' },
  { role: 'manager', envPrefix: 'SEED_MANAGER', defaultName: 'マネージャー' },
  { role: 'developer', envPrefix: 'SEED_DEVELOPER', defaultName: 'デベロッパー' },
];

function readActorConfig({ role, envPrefix, defaultName }) {
  const email = process.env[`${envPrefix}_EMAIL`];
  const password = process.env[`${envPrefix}_PASSWORD`];
  const name = process.env[`${envPrefix}_NAME`] ?? defaultName;

  if (!email || !password) {
    throw new Error(`${envPrefix}_EMAIL と ${envPrefix}_PASSWORD を設定してください`);
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    // どのアカウントかは出すが、値そのものは出さない
    throw new Error(`${envPrefix}_PASSWORD は${PASSWORD_MIN_LENGTH}文字以上にしてください`);
  }

  return { role, name, email: email.trim().toLowerCase(), password };
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL が設定されていません');
  }

  const configs = SEED_ACTORS.map(readActorConfig);
  const pool = new Pool({ connectionString, max: 1 });

  try {
    for (const config of configs) {
      const existing = await pool.query('SELECT id FROM actor WHERE email = $1', [config.email]);
      if (existing.rowCount > 0) {
        console.log(`スキップ（既に存在）: ${config.email}`);
        continue;
      }

      const passwordHash = await hash(config.password, ARGON2_OPTIONS);
      await pool.query(
        `INSERT INTO actor (type, name, email, role, password_hash)
         VALUES ('human', $1, $2, $3, $4)`,
        [config.name, config.email, config.role, passwordHash],
      );
      console.log(`作成: ${config.email} (${config.role})`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  // 接続文字列やパスワードを出さないよう message だけにする
  console.error('シードに失敗しました:', error instanceof Error ? error.message : error);
  process.exit(1);
});
