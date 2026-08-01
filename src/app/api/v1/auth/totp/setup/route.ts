import { beginTotpSetup } from '@/domain/auth/service';
import { authed, ok } from '@/lib/api/handler';

/**
 * POST /api/v1/auth/totp/setup
 *
 * シークレットと otpauth URI を返す。**この時点ではまだ保存しない。**
 * 認証アプリで生成した6桁が通ることを /totp/verify で確認してから保存する。
 *
 * 返り値は秘匿情報。ログに出さないこと。
 */
export const POST = authed(async ({ actor }) => {
  const setup = await beginTotpSetup(actor.id);
  return ok(setup);
});
