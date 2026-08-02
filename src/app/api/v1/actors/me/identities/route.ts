import { z } from 'zod';

import { PROVIDERS } from '@/db/schema/enums';
import { linkIdentity, listIdentities, unlinkIdentity } from '@/domain/actor/identity';
import { authed, ok } from '@/lib/api/handler';
import { parseOrThrow, readJson } from '@/lib/validation';

/**
 * 外部サービスとの紐付け（F-22b）。**自分のぶんだけ。**
 * 他人の ID を勝手に結びつけられると、その人宛の通知を自分へ流せてしまう。
 */
const schema = z.object({
  provider: z.enum(PROVIDERS),
  externalId: z.string().trim().min(1, 'IDを入力してください').max(64),
});

export const GET = authed(async ({ actor }) => ok(await listIdentities(actor.id)));

export const PATCH = authed(async ({ request, actor, meta }) => {
  const input = parseOrThrow(schema, await readJson(request));
  await linkIdentity(
    { ...actor, ip: meta.ip, userAgent: meta.userAgent },
    input.provider,
    input.externalId,
  );
  return ok({ linked: true });
});

export const DELETE = authed(async ({ request, actor, meta }) => {
  const provider = new URL(request.url).searchParams.get('provider');
  if (provider !== 'discord' && provider !== 'github') return ok({ unlinked: false });
  await unlinkIdentity({ ...actor, ip: meta.ip, userAgent: meta.userAgent }, provider);
  return ok({ unlinked: true });
});
