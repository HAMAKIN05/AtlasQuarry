import { z } from 'zod';

import { deleteProduct, getProductById, updateProduct } from '@/domain/product/service';
import { authed, noContent, ok } from '@/lib/api/handler';
import {
  optionalText,
  parseOrThrow,
  productStatusSchema,
  readJson,
  requiredText,
  uuidSchema,
} from '@/lib/validation';

type Params = { id: string };

const updateSchema = z
  .object({
    name: requiredText(100).optional(),
    description: optionalText(2000).optional(),
    status: productStatusSchema.optional(),
    ownerId: uuidSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: '変更内容がありません' });

/** GET /api/v1/products/:id */
export const GET = authed<Params>(async ({ params }) => {
  const id = parseOrThrow(uuidSchema, params.id);
  return ok(await getProductById(id));
});

/** PATCH /api/v1/products/:id */
export const PATCH = authed<Params>(async ({ request, actor, params, meta }) => {
  const id = parseOrThrow(uuidSchema, params.id);
  const input = parseOrThrow(updateSchema, await readJson(request));

  const updated = await updateProduct(
    { ...actor, ip: meta.ip, userAgent: meta.userAgent },
    id,
    input,
  );
  return ok(updated);
});

/** DELETE /api/v1/products/:id。配下の開発項目・タスクも CASCADE で消えるため owner / manager のみ。 */
export const DELETE = authed<Params>(async ({ actor, params, meta }) => {
  const id = parseOrThrow(uuidSchema, params.id);
  await deleteProduct({ ...actor, ip: meta.ip, userAgent: meta.userAgent }, id);
  return noContent();
});
