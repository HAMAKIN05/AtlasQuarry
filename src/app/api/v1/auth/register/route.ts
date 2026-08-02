import { z } from 'zod';

import { register } from '@/domain/auth/service';
import { ok, publicRoute } from '@/lib/api/handler';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/password';
import { parseOrThrow, readJson } from '@/lib/validation';

const registerSchema = z.object({
  name: z.string().trim().min(1, '名前を入力してください').max(100),
  email: z.string().trim().email('メールアドレスの形式が正しくありません'),
  password: z.string().min(PASSWORD_MIN_LENGTH, `パスワードは${PASSWORD_MIN_LENGTH}文字以上にしてください`),
  code: z.string().min(1, '合言葉を入力してください'),
});

/**
 * POST /api/v1/auth/register。認証不要。
 *
 * **公開URLなので、素の自己登録にはしない。** 環境変数の合言葉を知る人だけが登録でき、
 * 作られるのは常に `requester`（作成・判断・メンバー管理はできない役割）。
 * 登録しても自動ログインしない。詳細は `domain/auth/service.ts` の `register`。
 */
export const POST = publicRoute(async ({ request, meta }) => {
  const input = parseOrThrow(registerSchema, await readJson(request));

  const result = await register(input, { ip: meta.ip, userAgent: meta.userAgent });

  return ok(result, 201);
});
