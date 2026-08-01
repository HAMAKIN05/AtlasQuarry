import { z } from 'zod';

import { createFeature } from '@/domain/product/service';
import { authed, ok } from '@/lib/api/handler';
import {
  dateSchema,
  optionalText,
  parseOrThrow,
  readJson,
  requiredText,
  uuidSchema,
} from '@/lib/validation';

const createSchema = z.object({
  productId: uuidSchema,
  name: requiredText(100, '開発項目名を入力してください'),
  description: optionalText(2000).optional().default(null),
  startDate: dateSchema.nullable().optional().default(null),
  dueDate: dateSchema.nullable().optional().default(null),
});

/** POST /api/v1/features */
export const POST = authed(async ({ request, actor, meta }) => {
  const input = parseOrThrow(createSchema, await readJson(request));
  const created = await createFeature({ ...actor, ip: meta.ip, userAgent: meta.userAgent }, input);
  return ok(created, 201);
});
