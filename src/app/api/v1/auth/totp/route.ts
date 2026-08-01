import { z } from 'zod';

import { disableTotp } from '@/domain/auth/service';
import { authed, noContent } from '@/lib/api/handler';
import { parseOrThrow, readJson } from '@/lib/validation';

const disableSchema = z.object({
  password: z.string().min(1, 'パスワードを入力してください'),
});

/**
 * DELETE /api/v1/auth/totp
 *
 * 解除にもパスワード確認を要求する。Cookie を奪われた状態で外されると2要素の意味がなくなるため。
 */
export const DELETE = authed(async ({ request, actor }) => {
  const input = parseOrThrow(disableSchema, await readJson(request));
  await disableTotp(actor.id, input.password);
  return noContent();
});
