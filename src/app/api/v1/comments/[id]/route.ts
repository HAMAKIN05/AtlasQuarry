import { deleteComment } from '@/domain/comment/service';
import { authed, noContent } from '@/lib/api/handler';
import { parseOrThrow, uuidSchema } from '@/lib/validation';

type Params = { id: string };

/** DELETE /api/v1/comments/:id。投稿者本人と manager 以上のみ。 */
export const DELETE = authed<Params>(async ({ actor, params, meta }) => {
  const id = parseOrThrow(uuidSchema, params.id);
  await deleteComment({ ...actor, ip: meta.ip, userAgent: meta.userAgent }, id);
  return noContent();
});
