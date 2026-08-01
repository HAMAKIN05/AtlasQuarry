import { z } from 'zod';

import { REQUEST_STATUSES } from '@/db/schema/enums';
import { getRequestById, triageRequest } from '@/domain/request/service';
import { authed, ok } from '@/lib/api/handler';
import { optionalText, parseOrThrow, readJson, uuidSchema } from '@/lib/validation';

type Params = { id: string };

const triageSchema = z.object({
  status: z.enum(REQUEST_STATUSES),
  rejectReason: optionalText(2000).optional(),
  productId: uuidSchema.nullable().optional(),
});

/** GET /api/v1/requests/:id */
export const GET = authed<Params>(async ({ params }) => {
  const id = parseOrThrow(uuidSchema, params.id);
  return ok(await getRequestById(id));
});

/** PATCH /api/v1/requests/:id。判断（検討中 / 着手する / 見送る）。 */
export const PATCH = authed<Params>(async ({ request, actor, params, meta }) => {
  const id = parseOrThrow(uuidSchema, params.id);
  const input = parseOrThrow(triageSchema, await readJson(request));
  return ok(await triageRequest({ ...actor, ip: meta.ip, userAgent: meta.userAgent }, id, input));
});
