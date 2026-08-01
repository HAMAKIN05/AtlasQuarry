import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

/**
 * DB 接続。
 *
 * **Pool は遅延生成する。** Next.js のビルドは各ルートを import して静的解析するため、
 * モジュール読み込み時に DATABASE_URL を要求すると、DB を持たないビルド環境
 * （= Docker イメージのビルド）でビルド自体が失敗する。実際に踏んだ。
 *
 * dev の HMR でモジュールが再評価されるたびに Pool を作ると接続が枯渇するため、
 * globalThis に載せて使い回す。本番では1回しか評価されない。
 */
const globalForDb = globalThis as unknown as { __atlasquarryPool?: Pool };

function realPool(): Pool {
  if (globalForDb.__atlasquarryPool) return globalForDb.__atlasquarryPool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL が設定されていません');
  }

  const created = new Pool({
    connectionString,
    // 3名規模。アプリ1コンテナなので少なくてよい
    max: 10,
    idleTimeoutMillis: 30_000,
  });

  globalForDb.__atlasquarryPool = created;
  return created;
}

const globalForDrizzle = globalThis as unknown as {
  __atlasquarryDb?: NodePgDatabase<typeof schema>;
};

function realDb(): NodePgDatabase<typeof schema> {
  if (!globalForDrizzle.__atlasquarryDb) {
    globalForDrizzle.__atlasquarryDb = drizzle(realPool(), { schema });
  }
  return globalForDrizzle.__atlasquarryDb;
}

/**
 * 実体の生成を最初のアクセスまで遅らせる。
 *
 * Pool 側だけを遅延にしても足りない。`drizzle(pool)` は生成時に pool のプロパティを読むため、
 * モジュール評価の時点で接続情報が要求されてしまう。
 */
export const db: NodePgDatabase<typeof schema> = new Proxy(
  {} as NodePgDatabase<typeof schema>,
  {
    get(_target, property) {
      const instance = realDb();
      const value = Reflect.get(instance, property);
      return typeof value === 'function' ? value.bind(instance) : value;
    },
    has(_target, property) {
      return Reflect.has(realDb(), property);
    },
  },
);

export type Database = typeof db;

/**
 * トランザクションハンドル。
 *
 * ドメイン層のミューテーションはこれを引数に取り、`recordActivity` と同一トランザクションで
 * 実行する（CLAUDE.md 絶対ルール §3）。
 */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** `db` と `tx` のどちらでも受け取れる箇所で使う。 */
export type DbOrTx = Database | Transaction;

export { schema };
