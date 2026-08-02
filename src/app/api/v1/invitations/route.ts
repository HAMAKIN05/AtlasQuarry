import { z } from 'zod';

import { INVITABLE_ROLES } from '@/db/schema/enums';
import { createInvitation, listInvitations } from '@/domain/invitation/service';
import { authed, ok } from '@/lib/api/handler';
import { assertCan } from '@/lib/auth/rbac';
import { parseOrThrow, readJson } from '@/lib/validation';

const createSchema = z.object({
  role: z.enum(INVITABLE_ROLES),
  days: z.number().int().min(1).max(30).optional(),
  maxUses: z.number().int().min(1).max(20).optional(),
});

export const GET = authed(async ({ actor }) => {
  assertCan(actor, 'member.invite');
  return ok(await listInvitations());
});

/** **平文のトークンはここでしか返らない。** 画面は一度だけ見せる。 */
export const POST = authed(async ({ request, actor, meta }) => {
  const input = parseOrThrow(createSchema, await readJson(request));
  const created = await createInvitation(
    { ...actor, ip: meta.ip, userAgent: meta.userAgent },
    input,
  );
  return ok(created, 201);
});
