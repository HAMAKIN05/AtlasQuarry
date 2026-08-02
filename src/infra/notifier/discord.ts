import { and, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { integration } from '@/db/schema';
import { open as openSealed } from '@/infra/crypto/secret-box';

import type { NotifierAdapter, NotifyPayload } from './types';

/**
 * Discord への通知（F-22a）。**一方向だけ。**
 *
 * ツール → Discord に流すだけで、Discord 側の編集をツールへ戻さない。
 * 双方向にすると、片方が壊れたときに両方が壊れる（CLAUDE.md の禁止事項）。
 *
 * 送り先は Outgoing Webhook の URL。**これは実質的な認証情報**なので、
 * `integration.config_encrypted` に暗号化して保存し、**復号結果をログに出さない。**
 */

type DiscordConfig = { webhookUrl: string };

async function loadConfig(): Promise<DiscordConfig | null> {
  const rows = await db
    .select({ config: integration.configEncrypted })
    .from(integration)
    .where(and(eq(integration.provider, 'discord'), eq(integration.isActive, true)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  // **復号結果をログに出さない**（CLAUDE.md 絶対ルール4）
  const config = JSON.parse(openSealed(row.config)) as DiscordConfig;
  return config.webhookUrl ? config : null;
}

export const discordNotifier: NotifierAdapter = {
  channel: 'discord',

  async isConfigured() {
    return (await loadConfig()) !== null;
  },

  async send(payload: NotifyPayload & { to: { name: string; email: string | null } }) {
    const config = await loadConfig();
    if (!config) throw new Error('Discord の送り先が設定されていません');

    const appUrl = process.env.APP_URL ?? '';
    const link = payload.url ? `${appUrl}${payload.url}` : null;

    const res = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // 宛先の名前は本文に入れる。Discord のメンションは F-22b の紐付けが要る
        content: [`**${payload.title}**`, payload.body, link].filter(Boolean).join('\n'),
        allowed_mentions: { parse: [] },
      }),
    });

    if (!res.ok) {
      // **URL は載せない。** エラー文にそのまま出すと、ログに認証情報が残る
      throw new Error(`Discord への送信に失敗しました（HTTP ${res.status}）`);
    }
  },
};
