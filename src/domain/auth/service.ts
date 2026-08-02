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


/* ------------------------------------------------------------------ *
 * 自己登録
 * ------------------------------------------------------------------ */

/**
 * ログイン画面からの自己登録。
 *
 * **誰でも登録できる形にはしない。** このアプリは公開URLで動いており、
 * 素の自己登録は第三者がアカウントを作れることを意味する。
 * `REGISTRATION_CODE`（環境変数）を知っている人だけが登録できる。
 *
 * v0.1 にメール送信が無いため、招待リンク（F-10、v0.2）は作れない。
 * 合言葉方式は、その制約下で**テーブルを増やさずに**入口を絞れる最小の手段。
 *
 * 決めていること:
 *
 *   - **役割は必ず `requester`。** 作成・判断・メンバー管理はできない。
 *     必要になったときだけ、既存の owner / manager が設定画面で上げる
 *   - **登録しても自動ログインしない。** 成功も失敗も同じ文言を返し、
 *     メールアドレスが既に存在するかどうかを外から判別させない
 *   - **利用停止済みのアカウントを復活させない。** 停止の解除は設定画面から明示的に行う
 *   - 合言葉・その比較結果はログに出さない
 */
export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  code: string;
};

/** 登録の試行を数えるための固定キー。ログインの (IP, メール) と混ぜない。 */
const REGISTER_SCOPE_EMAIL = '__register__';

/** 成功も失敗も同じ文言。存在の有無を漏らさない。 */
const REGISTER_DONE_MESSAGE = '登録を受け付けました。ログインしてください';

export async function register(input: RegisterInput, meta: SessionMeta): Promise<{ message: string }> {
  const expected = process.env.REGISTRATION_CODE;
  const email = input.email.trim().toLowerCase();
  const ip = meta.ip ?? null;

  /*
   * **IP 単位で 15分5回まで。** 合言葉の総当たりを防ぐ。
   * ログインの (IP, メール) ロックとは別のキーにする。混ぜると、登録の試行で
   * 実在アカウントのログインを締め出せてしまう。
   */
  const lock = await checkLoginLock(REGISTER_SCOPE_EMAIL, ip);
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

  const codeOk = expected !== undefined && expected.length > 0 && timingSafeEquals(input.code, expected);

  // 合言葉が違う場合も、既存メールの場合も、**同じ扱い**にする
  if (!codeOk) {
    await db.transaction(async (tx) => {
      await recordLoginAttempt(tx, { email: REGISTER_SCOPE_EMAIL, ip, succeeded: false });
    });
    throw new ValidationError('登録できませんでした。入力内容と合言葉を確かめてください', {
      fields: {},
    });
  }

  const existing = await db
    .select({ id: actor.id })
    .from(actor)
    .where(eq(actor.email, email))
    .limit(1);

  if (existing.length > 0) {
    // 存在を知らせない。失敗として数えたうえで、成功と同じ文言を返す
    await db.transaction(async (tx) => {
      await recordLoginAttempt(tx, { email: REGISTER_SCOPE_EMAIL, ip, succeeded: false });
    });
    return { message: REGISTER_DONE_MESSAGE };
  }

  const passwordHash = await hashPassword(input.password);

  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(actor)
      .values({
        type: 'human',
        name: input.name.trim(),
        email,
        role: 'requester',
        passwordHash,
        isActive: true,
      })
      .returning({ id: actor.id, name: actor.name });

    // 書き込みは activity に残す（CLAUDE.md 絶対ルール3）。**合言葉は残さない**
    await recordActivity(tx, {
      actorId: created!.id,
      entityType: 'actor',
      entityId: created!.id,
      action: 'create',
      diff: { name: created!.name, role: 'requester', via: 'self-register' },
      ip,
      userAgent: meta.userAgent,
    });

    await recordLoginAttempt(tx, { email: REGISTER_SCOPE_EMAIL, ip, succeeded: true });
  });

  return { message: REGISTER_DONE_MESSAGE };
}

/** 長さの差からも情報を出さない比較。 */
function timingSafeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
