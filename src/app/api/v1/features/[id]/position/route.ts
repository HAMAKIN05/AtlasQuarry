import { z } from 'zod';

import { moveFeature } from '@/domain/product/service';
import { authed, noContent } from '@/lib/api/handler';
import { parseOrThrow, readJson, uuidSchema } from '@/lib/validation';

type Params = { id: string };

const moveSchema = z.object({
  /** 移動先の直前に来る開発項目のID。先頭へ移すときは null。 */
  afterId: uuidSchema.nullable(),
});

/** PATCH /api/v1/features/:id/position。中間値挿入のため他行は UPDATE されない。 */
export const PATCH = authed<Params>(async ({ request, actor, params, meta }) => {
  const id = parseOrThrow(uuidSchema, params.id);
  const input = parseOrThrow(moveSchema, await readJson(request));
  await moveFeature({ ...actor, ip: meta.ip, userAgent: meta.userAgent }, id, input.afterId);
  return noContent();
});
