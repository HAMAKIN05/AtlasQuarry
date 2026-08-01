import { boolean, check, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { bytea, createdAt, inList, primaryId, updatedAt } from './_columns';
import { INTEGRATION_PROVIDERS, type IntegrationProvider } from './enums';
import { product } from './product';

/**
 * 外部連携の設定（v0.2 以降）。v0.1 ではテーブルのみ。
 *
 * config_encrypted は必ず暗号化して保存する。Discord の Webhook URL は実質的な認証情報であり、
 * 平文保存するとDBバックアップ漏洩時の被害範囲が広がる。復号結果をログに出さないこと。
 */
export const integration = pgTable(
  'integration',
  {
    id: primaryId(),
    provider: text('provider').$type<IntegrationProvider>().notNull(),
    configEncrypted: bytea('config_encrypted').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    productId: uuid('product_id').references(() => product.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [check('integration_provider_check', inList(t.provider, INTEGRATION_PROVIDERS))],
);

/** アクティビティの重みなど、運用後に調整する値を置く（技術仕様書 §6.2）。ハードコードしない。 */
export const appSetting = pgTable('app_setting', {
  key: text('key').primaryKey(),
  valueJson: jsonb('value_json').notNull(),
  updatedAt: updatedAt(),
});

export type AppSetting = typeof appSetting.$inferSelect;
