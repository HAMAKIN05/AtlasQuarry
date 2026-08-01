import { authed, noContent } from '@/lib/api/handler';
import { clearSessionCookie, readSessionToken } from '@/lib/auth/cookies';
import { destroySession } from '@/lib/auth/session';

/**
 * POST /api/v1/auth/logout
 *
 * session レコードを削除するため、Cookie が残っていても以降アクセスできない（受入基準 5.1）。
 */
export const POST = authed(async () => {
  const token = await readSessionToken();
  if (token) {
    await destroySession(token);
  }
  await clearSessionCookie();
  return noContent();
});
