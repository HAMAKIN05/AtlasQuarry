# アプリのイメージ。**VPS 上でビルドしないこと**（CLAUDE.md / 機能定義書 §12.5）。
#
#   ローカル: docker build -t atlasquarry:latest .
#             docker save atlasquarry:latest | gzip > atlasquarry.tar.gz
#   転送    : scp atlasquarry.tar.gz vps:~/
#   VPS     : gunzip -c atlasquarry.tar.gz | docker load
#             docker compose -f docker/compose.yml up -d

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# standalone 出力には実行に必要な node_modules が同梱される
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# マイグレーションとシードはコンテナ内から明示的に実行する。
# 起動時に自動適用しないのは、DB設計書 §6 が「本番適用前に必ず pg_dump を取る」と定めており、
# 起動のたびに勝手にスキーマが変わる状態にしたくないため。
#
#   docker compose -f docker/compose.yml run --rm app node scripts/migrate.mjs
#   docker compose -f docker/compose.yml run --rm app node scripts/seed.mjs
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/drizzle-orm ./node_modules/drizzle-orm

# 添付ファイルの置き場（F-13）。**ボリュームを被せても所有者が残るよう、先に作っておく。**
# root 所有のまま mount されると、実行ユーザー（nextjs）が書けない（実際に踏んだ）。
RUN mkdir -p /var/atlasquarry/attachments && chown -R nextjs:nodejs /var/atlasquarry

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
