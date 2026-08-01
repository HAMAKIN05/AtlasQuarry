import { sql } from 'drizzle-orm';
import { check, date, doublePrecision, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, inList, primaryId } from './_columns';
import {
  FEATURE_STATUSES,
  PRODUCT_STATUSES,
  type FeatureStatus,
  type ProductStatus,
} from './enums';
import { actor } from './actor';

export const product = pgTable(
  'product',
  {
    id: primaryId(),
    /** タスクキーの接頭辞（例: PRD-123 の PRD）。 */
    key: text('key').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status').$type<ProductStatus>().notNull().default('planning'),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => actor.id),
    /** タスクキーの採番用。UPDATE ... RETURNING で採番と同一トランザクションにする（DB設計書 §3.2）。 */
    taskSeq: integer('task_seq').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    check('product_key_format', sql`${t.key} ~ '^[A-Z][A-Z0-9]{1,9}$'`),
    check('product_status_check', inList(t.status, PRODUCT_STATUSES)),
  ],
);

/**
 * 画面表示名は「開発項目」。DB上の英語名を画面に出さない（CLAUDE.md UI規約）。
 * 日付と進捗は原則タスクから導出し、start_date / due_date は手動オーバーライド用（機能定義書 §6.3）。
 */
export const feature = pgTable(
  'feature',
  {
    id: primaryId(),
    productId: uuid('product_id')
      .notNull()
      .references(() => product.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status').$type<FeatureStatus>().notNull().default('planning'),
    startDate: date('start_date'),
    dueDate: date('due_date'),
    position: doublePrecision('position').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('idx_feature_product').on(t.productId),
    check('feature_status_check', inList(t.status, FEATURE_STATUSES)),
  ],
);

export type Product = typeof product.$inferSelect;
export type NewProduct = typeof product.$inferInsert;
export type Feature = typeof feature.$inferSelect;
export type NewFeature = typeof feature.$inferInsert;
