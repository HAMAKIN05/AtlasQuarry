import { and, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { actor } from '@/db/schema';
import { fakeVerifyPassword, hashPassword, verifyPassword } from '@/lib/auth/password';
import {
  checkLoginLock,
  clearLoginAttempts,
  recordLoginAttempt,
} from '@/lib/auth/rate-limit';
import { createSession, purgeExpiredSessions, type SessionMeta } from '@/lib/auth/session';
import {
  createTotpSecret,
  decryptTotpSecret,
  encryptTotpSecret,
  totpUri,
  verifyTotp,
} from '@/lib/auth/totp';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/password';
import { ConflictError, RateLimitError, UnauthorizedError, ValidationError } from '@/lib/errors';

/**
 * 認証（F-01、技術仕様書 §2）。
 *
 * ドメイン層なので `next/*` に依存しない。Cookie の設定は API 層の責務。
 */

/**
 * 認証失敗時に返すメッセージ。
 *
 * メールとパスワードのどちらが誤りかを示さない（受入基準 5.1）。
 * TOTP 誤りだけは、正しい資格情報を持つ本人にしか到達しないため区別してよい。
 */
const CREDENTIAL_ERROR_MESSAGE = 'メールアドレスまたはパスワードが正しくありません';

export type LoginInput = {
  email: string;
  password: string;
  /** TOTP 設定済みの場合のみ必要。 */
  totpCode?: string | null;
};

export type LoginResult =
  | { kind: 'success'; token: string; actorId: string }
  /** 資格情報は正しいが6桁コードが要る。画面はコード入力欄を出す。 */
  | { kind: 'totpRequired' };

export async function login(input: LoginInput, meta: SessionMeta): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  const ip = meta.ip ?? null;

  const lock = await checkLoginLock(email, ip);
  if (lock.locked) {
    throw new RateLimitError(
      'ログイン試行の回数が上限に達しました。しばらく待ってからお試しください',
      lock.retryAfterSeconds,
    );
  }

  const rows = await db
    .select({
      id: actor.id,
      passwordHash: actor.passwordHash,
      totpSecret: actor.totpSecret,
      isActive: actor.isActive,
    })
    .from(actor)
    .where(and(eq(actor.email, email), eq(actor.type, 'human')))
    .limit(1);

  const found = rows[0];

  // 存在しないアカウントでも同じだけ時間を使う。応答時間の差でメールの存在有無を漏らさないため
  if (!found || !found.passwordHash || !found.isActive) {
    await fakeVerifyPassword();
    await db.transaction(async (tx) => {
      await recordLoginAttempt(tx, { email, ip, succeeded: false });
    });
    throw new UnauthorizedError(CREDENTIAL_ERROR_MESSAGE);
  }

  const passwordOk = await verifyPassword(found.passwordHash, input.password);
  if (!passwordOk) {
    await db.transaction(async (tx) => {
      await recordLoginAttempt(tx, { email, ip, succeeded: false });
    });
    throw new UnauthorizedError(CREDENTIAL_ERROR_MESSAGE);
  }

  if (found.totpSecret) {
    if (!input.totpCode) {
      // まだ失敗として数えない。コード入力欄を出すための往復であってブルートフォースではない
      return { kind: 'totpRequired' };
    }

    const totpOk = await verifyTotp(decryptTotpSecret(found.totpSecret), input.totpCode);
    if (!totpOk) {
      await db.transaction(async (tx) => {
        await recordLoginAttempt(tx, { email, ip, succeeded: false });
      });
      throw new UnauthorizedError('認証コードが正しくありません');
    }
  }

  return db.transaction(async (tx) => {
    await recordLoginAttempt(tx, { email, ip, succeeded: true });
    await clearLoginAttempts(tx, email);
    await purgeExpiredSessions(tx);
    const { token } = await createSession(tx, found.id, meta);
    return { kind: 'success', token, actorId: found.id };
  });
}

export type TotpSetup = {
  /** 平文シークレット。設定完了時に verify へ送り返してもらう。DBにはまだ入れない。 */
  secret: string;
  uri: string;
};

/**
 * TOTP 設定を開始する。
 *
 * この時点では保存しない。認証アプリで生成した6桁が通ることを確認してから保存する。
 * 先に保存すると、アプリ側の登録に失敗した利用者がログインできなくなる。
 */
export async function beginTotpSetup(actorId: string): Promise<TotpSetup> {
  const rows = await db
    .select({ email: actor.email, name: actor.name, totpSecret: actor.totpSecret })
    .from(actor)
    .where(eq(actor.id, actorId))
    .limit(1);

  const found = rows[0];
  if (!found) throw new UnauthorizedError();
  if (found.totpSecret) {
    throw new ConflictError('既に2要素認証が設定されています', null, 'TOTP_ALREADY_SET');
  }

  const secret = createTotpSecret();
  return { secret, uri: totpUri(secret, found.email ?? found.name) };
}

/** 6桁コードを検証し、通ったら暗号化して保存する。 */
export async function confirmTotpSetup(
  actorId: string,
  secret: string,
  code: string,
): Promise<void> {
  const ok = await verifyTotp(secret, code);
  if (!ok) {
    throw new ValidationError('認証コードが正しくありません', null, 'TOTP_INVALID');
  }

  await db
    .update(actor)
    .set({ totpSecret: encryptTotpSecret(secret) })
    .where(eq(actor.id, actorId));
}

/**
 * TOTP を解除する。
 *
 * 解除にもパスワード確認を要求する。Cookie を奪われた状態で2要素を外されると、
 * 2要素を設定している意味がなくなるため。
 */
export async function disableTotp(actorId: string, password: string): Promise<void> {
  const rows = await db
    .select({ passwordHash: actor.passwordHash })
    .from(actor)
    .where(eq(actor.id, actorId))
    .limit(1);

  const hash = rows[0]?.passwordHash;
  if (!hash || !(await verifyPassword(hash, password))) {
    throw new UnauthorizedError('パスワードが正しくありません');
  }

  await db.update(actor).set({ totpSecret: null }).where(eq(actor.id, actorId));
}

/** パスワード変更。現在のパスワードを確認してから差し替える。 */
export async function changePassword(
  actorId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    throw new ValidationError(`パスワードは${PASSWORD_MIN_LENGTH}文字以上にしてください`);
  }

  const rows = await db
    .select({ passwordHash: actor.passwordHash })
    .from(actor)
    .where(eq(actor.id, actorId))
    .limit(1);

  const hash = rows[0]?.passwordHash;
  if (!hash || !(await verifyPassword(hash, currentPassword))) {
    throw new UnauthorizedError('現在のパスワードが正しくありません');
  }

  await db
    .update(actor)
    .set({ passwordHash: await hashPassword(newPassword) })
    .where(eq(actor.id, actorId));
}
