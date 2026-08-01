import { z } from 'zod';

import { REQUEST_STATUSES } from '@/db/schema/enums';
import { createRequest, listRequests } from '@/domain/request/service';
import { authed, ok } from '@/lib/api/handler';
import { optionalText, parseOrThrow, readJson, requiredText, uuidSchema } from '@/lib/validation';

const createSchema = z.object({
  title: requiredText(200, 'どんなことができたら良いか、一言で書いてください'),
  bodyMd: optionalText(20000).optional().default(null),
  productId: uuidSchema.nullable().optional().default(null),
});

/** GET /api/v1/requests?status=received,reviewing */
export const GET = authed(async ({ request }) => {
  const raw = new URL(request.url).searchParams.get('status');
  const status = raw
    ? parseOrThrow(z.array(z.enum(REQUEST_STATUSES)).min(1), raw.split(','))
    : undefined;

  return ok(await listRequests(status));
});

/** POST /api/v1/requests。要望を出す。 */
export const POST = authed(async ({ request, actor, meta }) => {
  const input = parseOrThrow(createSchema, await readJson(request));
  const created = await createRequest({ ...actor, ip: meta.ip, userAgent: meta.userAgent }, input);
  return ok(created, 201);
});
