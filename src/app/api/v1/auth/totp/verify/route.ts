import { z } from 'zod';

import { confirmTotpSetup } from '@/domain/auth/service';
import { authed, noContent } from '@/lib/api/handler';
import { parseOrThrow, readJson } from '@/lib/validation';

const verifySchema = z.object({
  secret: z.string().min(1),
  code: z.string().trim().regex(/^\d{6}$/, '6桁の数字を入力してください'),
});

/** POST /api/v1/auth/totp/verify。コードが通れば暗号化して保存する。 */
export const POST = authed(async ({ request, actor }) => {
  const input = parseOrThrow(verifySchema, await readJson(request));
  await confirmTotpSetup(actor.id, input.secret, input.code);
  return noContent();
});
