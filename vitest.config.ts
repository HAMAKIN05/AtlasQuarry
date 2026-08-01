import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// 技術仕様書 §14: v0.1 でテストを書くのは rbac / position / ステータス遷移に限定する
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
