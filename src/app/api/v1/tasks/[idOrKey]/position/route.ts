import { z } from 'zod';

import { moveTask } from '@/domain/task/service';
import { authed, ok } from '@/lib/api/handler';
import { parseOrThrow, readJson, taskStatusSchema, uuidSchema } from '@/lib/validation';

type Params = { idOrKey: string };

const moveSchema = z.object({
  status: taskStatusSchema,
  /** 移動先の列で直前に来るタスクのID。列の先頭へ置くときは null。 */
  afterId: uuidSchema.nullable(),
});

/**
 * PATCH /api/v1/tasks/:id/position
 *
 * かんばんのDnD用。status と position を同時に更新する（v0.1スコープ §4）。
 */
export const PATCH = authed<Params>(async ({ request, actor, params, meta }) => {
  const id = parseOrThrow(uuidSchema, params.idOrKey);
  const input = parseOrThrow(moveSchema, await readJson(request));
  return ok(await moveTask({ ...actor, ip: meta.ip, userAgent: meta.userAgent }, id, input));
});
