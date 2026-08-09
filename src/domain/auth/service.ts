import { and, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { actor } from '@/db/schema';
import { recordActivity } from '@/domain/activity/recorder';
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
 * ユーザーIDとパスワードのどちらが誤りかを示さない（受入基準 5.1）。
 * TOTP 誤りだけは、正しい資格情報を持つ本人にしか到達しないため区別してよい。
 */
const CREDENTIAL_ERROR_MESSAGE = 'ユーザーIDまたはパスワードが正しくありません';

export type LoginInput = {
  userId: string;
  password: string;
  /** TOTP 設定済みの場合のみ必要。 */
  totpCode?: string | null;
};

export type LoginResult =
  | { kind: 'success'; token: string; actorId: string }
  /** 資格情報は正しいが6桁コードが要る。画面はコード入力欄を出す。 */
  | { kind: 'totpRequired' };

export async function login(input: LoginInput, meta: SessionMeta): Promise<LoginResult> {
  const userId = input.userId.trim().toLowerCase();
  const ip = meta.ip ?? null;

  const lock = await checkLoginLock(userId, ip);
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
    .where(and(eq(actor.userId, userId), eq(actor.type, 'human')))
    .limit(1);

  const found = rows[0];

  // 存在しないアカウントでも同じだけ時間を使う。応答時間の差でユーザーIDの存在有無を漏らさないため
  if (!found || !found.passwordHash || !found.isActive) {
    await fakeVerifyPassword();
    await db.transaction(async (tx) => {
      await recordLoginAttempt(tx, { identifier: userId, ip, succeeded: false });
    });
    throw new UnauthorizedError(CREDENTIAL_ERROR_MESSAGE);
  }

  const passwordOk = await verifyPassword(found.passwordHash, input.password);
  if (!passwordOk) {
    await db.transaction(async (tx) => {
      await recordLoginAttempt(tx, { identifier: userId, ip, succeeded: false });
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
        await recordLoginAttempt(tx, { identifier: userId, ip, succeeded: false });
      });
      throw new UnauthorizedError('認証コードが正しくありません');
    }
  }

  return db.transaction(async (tx) => {
    await recordLoginAttempt(tx, { identifier: userId, ip, succeeded: true });
    await clearLoginAttempts(tx, userId);
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
    .select({ userId: actor.userId, name: actor.name, totpSecret: actor.totpSecret })
    .from(actor)
    .where(eq(actor.id, actorId))
    .limit(1);

  const found = rows[0];
  if (!found) throw new UnauthorizedError();
  if (found.totpSecret) {
    throw new ConflictError('既に2要素認証が設定されています', null, 'TOTP_ALREADY_SET');
  }

  const secret = createTotpSecret();
  return { secret, uri: totpUri(secret, found.userId ?? found.name) };
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


/* ------------------------------------------------------------------ *
 * 自己登録
 * ------------------------------------------------------------------ */

/**
 * ログイン画面からの自己登録。
 *
 * ログイン画面からユーザーIDとパスワードだけで登録できる。
 * 公開URLのため、登録試行はIP単位でレート制限する。
 *
 * 決めていること:
 *
 *   - **役割は必ず `manager`（管理者）。** 登録直後からタスク・プロジェクト・要望・
 *     メンバー管理を行える。登録ユーザー間で権限差を作らない
 *   - **登録しても自動ログインしない。** 登録後はログイン画面へ戻る
 *   - **利用停止済みのアカウントを復活させない。** 停止の解除は設定画面から明示的に行う
 */
export type RegisterInput = {
  userId: string;
  password: string;
};

/** 登録の試行を数えるための固定キー。ログインの (IP, ユーザーID) と混ぜない。 */
const REGISTER_SCOPE_IDENTIFIER = '__register__';

const REGISTER_DONE_MESSAGE = '登録しました。ユーザーIDとパスワードでログインしてください';

export async function register(input: RegisterInput, meta: SessionMeta): Promise<{ message: string }> {
  const userId = input.userId.trim().toLowerCase();
  const ip = meta.ip ?? null;

  /*
   * **IP 単位で 15分5回まで。** 大量登録を防ぐ。
   * ログインの (IP, ユーザーID) ロックとは別のキーにする。
   */
  const lock = await checkLoginLock(REGISTER_SCOPE_IDENTIFIER, ip);
  if (lock.locked) {
    throw new RateLimitError(
      '登録の試行回数が上限に達しました。しばらく待ってからお試しください',
      lock.retryAfterSeconds,
    );
  }

  if (input.password.length < PASSWORD_MIN_LENGTH) {
    throw new ValidationError(`パスワードは${PASSWORD_MIN_LENGTH}文字以上にしてください`, {
      fields: { password: [`パスワードは${PASSWORD_MIN_LENGTH}文字以上にしてください`] },
    });
  }

  const existing = await db
    .select({ id: actor.id })
    .from(actor)
    .where(eq(actor.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    await db.transaction(async (tx) => {
      await recordLoginAttempt(tx, { identifier: REGISTER_SCOPE_IDENTIFIER, ip, succeeded: false });
    });
    throw new ConflictError('このユーザーIDは既に使われています', null, 'USER_ID_TAKEN');
  }

  const passwordHash = await hashPassword(input.password);

  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(actor)
      .values({
        type: 'human',
        name: userId,
        userId,
        email: null,
        role: 'manager',
        passwordHash,
        isActive: true,
      })
      .returning({ id: actor.id, name: actor.name });

    // 書き込みは activity に残す（CLAUDE.md 絶対ルール3）。パスワードは残さない
    await recordActivity(tx, {
      actorId: created!.id,
      entityType: 'actor',
      entityId: created!.id,
      action: 'create',
      diff: { name: created!.name, role: 'manager', via: 'self-register' },
      ip,
      userAgent: meta.userAgent,
    });

    await recordLoginAttempt(tx, { identifier: REGISTER_SCOPE_IDENTIFIER, ip, succeeded: true });
  });

  return { message: REGISTER_DONE_MESSAGE };
}

