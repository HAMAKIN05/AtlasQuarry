import { and, eq, gt, lt } from 'drizzle-orm';

import { db, type DbOrTx } from '@/db/client';
import { actor, session, type Actor } from '@/db/schema';

import { generateToken, hashToken } from './token';

/**
 * セッション（技術仕様書 §2.2）。
 *
 * JWT は使わない（即時失効ができないため）。DB には SHA-256 ハッシュのみを保存し、
 * 平文トークンは Cookie にしか存在させない。
 *
 * **このファイルは `next/*` を import しない。** ドメイン層から呼べるようにするため、
 * Cookie の読み書きは lib/auth/cookies.ts に分けている。
 */

/** 30日。session.expires_at と Cookie の Max-Age を一致させる。 */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export type SessionActor = Pick<
  Actor,
  'id' | 'name' | 'userId' | 'email' | 'role' | 'type' | 'avatarUrl' | 'isActive'
> & { hasTotp: boolean };

export type SessionMeta = {
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * セッションを作成し、平文トークンを返す。
 *
 * 返り値の平文はこの1回きりしか手に入らない。呼び出し側は Cookie に載せる以外の用途で
 * 保持・記録しないこと。
 */
export async function createSession(
  tx: DbOrTx,
  actorId: string,
  meta: SessionMeta = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await tx.insert(session).values({
    actorId,
    tokenHash: hashToken(token),
    expiresAt,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
  });

  return { token, expiresAt };
}

/** トークンからログイン中の actor を解決する。期限切れ・無効アカウントは null。 */
export async function resolveSession(token: string): Promise<SessionActor | null> {
  const rows = await db
    .select({
      id: actor.id,
      name: actor.name,
      userId: actor.userId,
      email: actor.email,
      role: actor.role,
      type: actor.type,
      avatarUrl: actor.avatarUrl,
      isActive: actor.isActive,
      totpSecret: actor.totpSecret,
    })
    .from(session)
    .innerJoin(actor, eq(actor.id, session.actorId))
    .where(and(eq(session.tokenHash, hashToken(token)), gt(session.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row || !row.isActive) return null;

  const { totpSecret, ...rest } = row;
  return { ...rest, hasTotp: totpSecret !== null };
}

/** ログアウト。session レコードを削除するため、以降そのトークンでは一切アクセスできない。 */
export async function destroySession(token: string): Promise<void> {
  await db.delete(session).where(eq(session.tokenHash, hashToken(token)));
}

/** 期限切れセッションの掃除。ログイン時に併せて呼ぶ。 */
export async function purgeExpiredSessions(tx: DbOrTx): Promise<void> {
  await tx.delete(session).where(lt(session.expiresAt, new Date()));
}
