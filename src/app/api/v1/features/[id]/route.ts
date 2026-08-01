import { z } from 'zod';

import { deleteFeature, updateFeature } from '@/domain/product/service';
import { authed, noContent, ok } from '@/lib/api/handler';
import {
  dateSchema,
  featureStatusSchema,
  optionalText,
  parseOrThrow,
  readJson,
  requiredText,
  uuidSchema,
} from '@/lib/validation';

type Params = { id: string };

const updateSchema = z
  .object({
    name: requiredText(100).optional(),
    description: optionalText(2000).optional(),
    status: featureStatusSchema.optional(),
    startDate: dateSchema.nullable().optional(),
    dueDate: dateSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: '変更内容がありません' });

/** PATCH /api/v1/features/:id */
export const PATCH = authed<Params>(async ({ request, actor, params, meta }) => {
  const id = parseOrThrow(uuidSchema, params.id);
  const input = parseOrThrow(updateSchema, await readJson(request));
  return ok(await updateFeature({ ...actor, ip: meta.ip, userAgent: meta.userAgent }, id, input));
});

/** DELETE /api/v1/features/:id。配下タスクの feature_id は SET NULL になる。 */
export const DELETE = authed<Params>(async ({ actor, params, meta }) => {
  const id = parseOrThrow(uuidSchema, params.id);
  await deleteFeature({ ...actor, ip: meta.ip, userAgent: meta.userAgent }, id);
  return noContent();
});
