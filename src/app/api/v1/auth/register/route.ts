import { z } from 'zod';

import { register } from '@/domain/auth/service';
import { ok, publicRoute } from '@/lib/api/handler';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/password';
import { parseOrThrow, readJson } from '@/lib/validation';

const registerSchema = z.object({
  userId: z
    .string()
    .trim()
    .min(1, 'ユーザーIDを入力してください')
    .max(100)
    .refine((value) => !/\s/.test(value), 'ユーザーIDに空白は使えません'),
  password: z.string().min(PASSWORD_MIN_LENGTH, `パスワードは${PASSWORD_MIN_LENGTH}文字以上にしてください`),
});

/**
 * POST /api/v1/auth/register。認証不要。
 *
 * ユーザーIDとパスワードだけで登録でき、作られるのは常に `manager`（管理者）。
 * 登録試行はIP単位でレート制限する。
 * 登録しても自動ログインしない。詳細は `domain/auth/service.ts` の `register`。
 */
export const POST = publicRoute(async ({ request, meta }) => {
  const input = parseOrThrow(registerSchema, await readJson(request));

  const result = await register(input, { ip: meta.ip, userAgent: meta.userAgent });

  return ok(result, 201);
});
