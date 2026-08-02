import { z } from 'zod';

import { DOCUMENT_TYPES } from '@/db/schema/enums';
import { createDocument, listDocuments } from '@/domain/document/service';
import { authed, ok } from '@/lib/api/handler';
import { parseOrThrow, readJson, requiredText, uuidSchema } from '@/lib/validation';
import { ValidationError } from '@/lib/errors';

const createSchema = z.object({
  productId: uuidSchema,
  parentId: uuidSchema.nullable().optional().default(null),
  type: z.enum(DOCUMENT_TYPES),
  title: requiredText(200, '題名を入力してください'),
  meetingDate: z.string().date().nullable().optional().default(null),
});

export const GET = authed(async ({ request }) => {
  const productId = new URL(request.url).searchParams.get('productId');
  if (!productId) throw new ValidationError('プロジェクトを指定してください');
  return ok(await listDocuments(productId));
});

export const POST = authed(async ({ request, actor, meta }) => {
  const input = parseOrThrow(createSchema, await readJson(request));
  const created = await createDocument({ ...actor, ip: meta.ip, userAgent: meta.userAgent }, input);
  return ok(created, 201);
});
