import { z } from 'zod';

import { login } from '@/domain/auth/service';
import { ok, publicRoute } from '@/lib/api/handler';
import { setSessionCookie } from '@/lib/auth/cookies';
import { parseOrThrow, readJson } from '@/lib/validation';

const loginSchema = z.object({
  email: z.string().trim().min(1, 'メールアドレスを入力してください'),
  password: z.string().min(1, 'パスワードを入力してください'),
  totpCode: z.string().trim().optional().nullable(),
});

/** POST /api/v1/auth/login。認証不要の唯一のエンドポイント。 */
export const POST = publicRoute(async ({ request, meta }) => {
  const input = parseOrThrow(loginSchema, await readJson(request));

  const result = await login(input, { ip: meta.ip, userAgent: meta.userAgent });

  if (result.kind === 'totpRequired') {
    return ok({ totpRequired: true });
  }

  await setSessionCookie(result.token);
  return ok({ totpRequired: false });
});
