import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db/client';
import { integration } from '@/db/schema';
import { recordActivity } from '@/domain/activity/recorder';
import { seal } from '@/infra/crypto/secret-box';
import { authed, ok } from '@/lib/api/handler';
import { assertCan } from '@/lib/auth/rbac';
import { parseOrThrow, readJson } from '@/lib/validation';

/**
 * 外部連携の設定（F-22a / F-09）。
 *
 * **保存した値は返さない。** Discord の Webhook URL も SMTP のパスワードも
 * 実質的な認証情報で、一度入れたら画面から読めなくてよい。
 * 「設定済みかどうか」だけを返す。
 */

const smtpSchema = z.object({
  provider: z.literal('smtp'),
  host: z.string().trim().min(1),
  port: z.number().int().min(1).max(65535),
  user: z.string().trim().min(1),
  pass: z.string().min(1),
  from: z.string().trim().email(),
});

const discordSchema = z.object({
  provider: z.literal('discord'),
  webhookUrl: z.string().trim().url().startsWith('https://discord.com/api/webhooks/', {
    message: 'Discord の Webhook URL を入れてください',
  }),
});

const bodySchema = z.discriminatedUnion('provider', [smtpSchema, discordSchema]);

/** GET: 設定済みかどうかだけ。**中身は返さない。** */
export const GET = authed(async ({ actor }) => {
  assertCan(actor, 'integration.manage');

  const rows = await db
    .select({ provider: integration.provider, isActive: integration.isActive })
    .from(integration);

  return ok({
    discord: rows.some((r) => r.provider === 'discord' && r.isActive),
    smtp: rows.some((r) => r.provider === 'smtp' && r.isActive),
  });
});

export const POST = authed(async ({ request, actor, meta }) => {
  assertCan(actor, 'integration.manage');

  const input = parseOrThrow(bodySchema, await readJson(request));
  const { provider, ...config } = input;

  await db.transaction(async (tx) => {
    // 1経路につき1件。入れ直しは置き換える
    await tx.delete(integration).where(eq(integration.provider, provider));

    await tx.insert(integration).values({
      provider,
      configEncrypted: seal(JSON.stringify(config)),
      isActive: true,
    });

    // **中身は残さない。** どの経路を設定したかだけ
    await recordActivity(tx, {
      actorId: actor.id,
      entityType: 'product',
      entityId: actor.id,
      action: 'update',
      diff: { integration: provider },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  });

  return ok({ provider, configured: true });
});

export const DELETE = authed(async ({ request, actor }) => {
  assertCan(actor, 'integration.manage');

  const provider = new URL(request.url).searchParams.get('provider');
  if (provider !== 'smtp' && provider !== 'discord') {
    return ok({ deleted: false });
  }

  await db
    .delete(integration)
    .where(and(eq(integration.provider, provider)));

  return ok({ deleted: true });
});
