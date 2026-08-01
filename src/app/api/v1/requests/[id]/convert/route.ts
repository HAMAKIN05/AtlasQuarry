import { z } from 'zod';

import { convertRequestToTask } from '@/domain/request/service';
import { authed, ok } from '@/lib/api/handler';
import { dateSchema, parseOrThrow, readJson, uuidSchema } from '@/lib/validation';

type Params = { id: string };

const convertSchema = z.object({
  productId: uuidSchema,
  featureId: uuidSchema.nullable().optional().default(null),
  assigneeId: uuidSchema.nullable().optional().default(null),
  dueDate: dateSchema.nullable().optional().default(null),
});

/**
 * POST /api/v1/requests/:id/convert
 *
 * 要望をタスクにする（F-08）。二重変換は 409。
 */
export const POST = authed<Params>(async ({ request, actor, params, meta }) => {
  const id = parseOrThrow(uuidSchema, params.id);
  const input = parseOrThrow(convertSchema, await readJson(request));

  const created = await convertRequestToTask(
    { ...actor, ip: meta.ip, userAgent: meta.userAgent },
    id,
    input,
  );
  return ok(created, 201);
});
