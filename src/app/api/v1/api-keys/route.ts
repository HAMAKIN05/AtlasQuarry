import { z } from 'zod';

import { API_SCOPES } from '@/db/schema/enums';
import { createApiKey, listApiKeys } from '@/domain/mcp/auth';
import { authed, ok } from '@/lib/api/handler';
import { assertCan } from '@/lib/auth/rbac';
import { parseOrThrow, readJson, uuidSchema } from '@/lib/validation';

const createSchema = z.object({
  name: z.string().trim().min(1, '名前を入力してください').max(100),
  scope: z.enum(API_SCOPES),
  productIds: z.array(uuidSchema).nullable().optional().default(null),
  days: z.number().int().min(1).max(365).nullable().optional().default(null),
});

export const GET = authed(async ({ actor }) => {
  assertCan(actor, 'integration.manage');
  return ok(await listApiKeys());
});

/** **平文の鍵はここでしか返らない。** */
export const POST = authed(async ({ request, actor, meta }) => {
  const input = parseOrThrow(createSchema, await readJson(request));
  const created = await createApiKey({ ...actor, ip: meta.ip, userAgent: meta.userAgent }, input);
  return ok(created, 201);
});
