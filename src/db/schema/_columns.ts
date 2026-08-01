import { sql, type SQL } from 'drizzle-orm';
import { customType, timestamp, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * DB設計書の DDL に合わせるための共通部品。
 * 列定義を1か所に寄せることで、DDL とスキーマのズレが生まれる箇所を減らす。
 */

/** `bytea`。Drizzle に組み込みがないため独自定義（integration.config_encrypted 用）。 */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

/** 全テーブル共通の主キー。DB設計書 §3 で `gen_random_uuid()` 固定。 */
export const primaryId = () =>
  uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`);

/** 日時は例外なく timestamptz。DB規約（CLAUDE.md）。 */
export const tz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const createdAt = () =>
  tz('created_at')
    .notNull()
    .default(sql`now()`);

export const updatedAt = () =>
  tz('updated_at')
    .notNull()
    .default(sql`now()`);

/**
 * `col IN ('a','b',...)` の CHECK 制約式を組み立てる。
 *
 * bind パラメータ（`sql`${v}``）だと DDL 生成時に `$1` として出てしまうため、
 * リテラルを `sql.raw` で埋め込む。渡す値は enums.ts の定数のみで、外部入力は通さない。
 */
export function inList(column: AnyPgColumn, values: readonly string[]): SQL {
  const literals = values.map((v) => `'${v}'`).join(', ');
  return sql`${column} IN (${sql.raw(literals)})`;
}
