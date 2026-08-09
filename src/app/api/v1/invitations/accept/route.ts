import { z } from 'zod';

import { acceptInvitation } from '@/domain/invitation/service';
import { ok, publicRoute } from '@/lib/api/handler';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/policy';
import { parseOrThrow, readJson } from '@/lib/validation';

const schema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(1, '名前を入力してください').max(100),
  userId: z.string().trim().min(1, 'ユーザーIDを入力してください').max(100),
  password: z.string().min(PASSWORD_MIN_LENGTH),
});

/** 招待からアカウントを作る。認証不要。 */
export const POST = publicRoute(async ({ request, meta }) => {
  const input = parseOrThrow(schema, await readJson(request));
  await acceptInvitation({ ...input, ip: meta.ip, userAgent: meta.userAgent });
  return ok({ joined: true }, 201);
});
