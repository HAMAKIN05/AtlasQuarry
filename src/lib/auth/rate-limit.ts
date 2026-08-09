import { and, eq, gte, sql, type SQL } from 'drizzle-orm';

import { db, type DbOrTx } from '@/db/client';
import { loginAttempt } from '@/db/schema';

/**
 * ログイン試行のレート制限（技術仕様書 §2.5）。
 *
 * 5回 / 15分 / IP+ユーザーID。3名規模のため DB カウンタで十分で、Redis は導入しない。
 *
 * **カウンタのキーは (IP, ユーザーID) の組。** どちらか片方でも上限に達したらロック、という
 * 広い解釈にすると、同じ事務所のグローバルIPを共有している3人のうち1人が打ち間違えただけで
 * 全員が締め出される。実際にそれで巻き添えを出した。
 *
 * この方式では、攻撃者がIPを変えれば1アカウントに対して (IP数 × 5) 回まで試行できる。
 * 分散攻撃への耐性は落ちるが、利用者3名・パスワード12文字以上・TOTP 併用可という前提では
 * 締め出しの実害の方が大きいと判断している。
 */

export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_WINDOW_SECONDS = 15 * 60;

function windowStart(): Date {
  return new Date(Date.now() - LOGIN_WINDOW_SECONDS * 1000);
}

export type LoginLockStatus = {
  locked: boolean;
  /** 解除までの秒数。locked が false のときは 0。 */
  retryAfterSeconds: number;
};

/**
 * ロック中かを判定する。
 *
 * 失敗のみを数える。成功した時点で `clearLoginAttempts` が該当ユーザーIDの記録を消すため、
 * 「連続失敗5回」と同じ意味になる。
 */
export async function checkLoginLock(identifier: string, ip: string | null): Promise<LoginLockStatus> {
  // (IP, ユーザーID) の組で数える。IP が取れない場合はユーザーIDだけで見る
  const scope: SQL =
    ip === null
      ? eq(loginAttempt.identifier, identifier)
      : and(eq(loginAttempt.identifier, identifier), sql`${loginAttempt.ip} = ${ip}::inet`)!;

  const rows = await db
    .select({
      failures: sql<number>`count(*)::int`,
      oldest: sql<string | null>`min(${loginAttempt.createdAt})`,
    })
    .from(loginAttempt)
    .where(and(eq(loginAttempt.succeeded, false), gte(loginAttempt.createdAt, windowStart()), scope));

  const failures = rows[0]?.failures ?? 0;
  const oldest = rows[0]?.oldest ? new Date(rows[0].oldest) : null;

  if (failures < LOGIN_MAX_ATTEMPTS || oldest === null) {
    return { locked: false, retryAfterSeconds: 0 };
  }

  // 窓の起点は最も古い失敗。そこから15分でロックが明ける
  const unlockAt = oldest.getTime() + LOGIN_WINDOW_SECONDS * 1000;
  return {
    locked: true,
    retryAfterSeconds: Math.max(1, Math.ceil((unlockAt - Date.now()) / 1000)),
  };
}

export async function recordLoginAttempt(
  tx: DbOrTx,
  params: { identifier: string; ip: string | null; succeeded: boolean },
): Promise<void> {
  await tx.insert(loginAttempt).values({
    identifier: params.identifier,
    ip: params.ip,
    succeeded: params.succeeded,
  });
}

/**
 * ログイン成功時に、そのユーザーIDの失敗記録を消す。
 *
 * 消さないと、成功後も窓が閉じるまで過去の失敗が数え続けられてしまう。
 */
export async function clearLoginAttempts(tx: DbOrTx, identifier: string): Promise<void> {
  await tx.delete(loginAttempt).where(eq(loginAttempt.identifier, identifier));
}
