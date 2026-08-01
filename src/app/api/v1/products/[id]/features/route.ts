import { listFeatures } from '@/domain/product/service';
import { authed, ok } from '@/lib/api/handler';
import { parseOrThrow, uuidSchema } from '@/lib/validation';

type Params = { id: string };

/** GET /api/v1/products/:id/features。進捗率と日付はタスクから導出済みの値が入る。 */
export const GET = authed<Params>(async ({ params }) => {
  const productId = parseOrThrow(uuidSchema, params.id);
  return ok(await listFeatures(productId));
});
