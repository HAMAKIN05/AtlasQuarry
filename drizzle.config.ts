import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  // 生成物は必ず目視確認してからコミットする（DB設計書 §6）
  verbose: true,
  strict: true,
});
