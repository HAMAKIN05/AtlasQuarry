import { z } from 'zod';

import { createProduct, listProducts } from '@/domain/product/service';
import { authed, ok } from '@/lib/api/handler';
import { optionalText, parseOrThrow, productKeySchema, readJson, requiredText, uuidSchema } from '@/lib/validation';

const createSchema = z.object({
  /** 記号はサーバーで採番する。互換のため受け取れるようにはしておく */
  key: productKeySchema.optional(),
  name: requiredText(100, 'プロダクト名を入力してください'),
  description: optionalText(2000).optional().default(null),
  ownerId: uuidSchema.optional(),
});

/** GET /api/v1/products */
export const GET = authed(async () => ok(await listProducts()));

/** POST /api/v1/products */
export const POST = authed(async ({ request, actor, meta }) => {
  const input = parseOrThrow(createSchema, await readJson(request));

  const created = await createProduct(
    { ...actor, ip: meta.ip, userAgent: meta.userAgent },
    {
      key: input.key,
      name: input.name,
      description: input.description,
      // 指定がなければ作成者を担当にする
      ownerId: input.ownerId ?? actor.id,
    },
  );

  return ok(created, 201);
});
