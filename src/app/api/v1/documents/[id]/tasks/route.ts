import { z } from 'zod';

import { tasksFromMinutes } from '@/domain/document/minutes';
import { authed, ok } from '@/lib/api/handler';
import { parseOrThrow, readJson } from '@/lib/validation';

/** 議事録の行からタスクを起こす（F-25）。 */
const bodySchema = z.object({
  lineIndexes: z.array(z.number().int().min(0)).min(1).max(50),
  assigneeId: z.string().uuid().nullable().optional(),
  dueDate: z.string().date().nullable().optional(),
});

export const POST = authed<{ id: string }>(async ({ request, actor, meta, params }) => {
  const input = parseOrThrow(bodySchema, await readJson(request));

  const result = await tasksFromMinutes(
    { ...actor, ip: meta.ip, userAgent: meta.userAgent },
    params.id,
    input.lineIndexes,
    { assigneeId: input.assigneeId ?? null, dueDate: input.dueDate ?? null },
  );

  return ok(result);
});
