import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { SESSION_TTL_SECONDS, resolveSession, type SessionActor } from './session';

/**
 * セッション Cookie の読み書き（技術仕様書 §2.2）。
 *
 * `next/headers` に触るのはこのファイルだけにして、session.ts をドメイン層から使えるようにしている。
 */

export const SESSION_COOKIE_NAME = 'aq_session';

export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value ?? null;
}

/** Cookie から現在の actor を取得する。未ログインなら null。 */
export async function currentActor(): Promise<SessionActor | null> {
  const token = await readSessionToken();
  if (!token) return null;
  return resolveSession(token);
}

/**
 * 認証必須のページ本体から使う。未認証なら /login へ送る。
 *
 * レイアウト側でも同じチェックをしているが、Next はレイアウトとページを並行して評価するため、
 * ページ側で `(await currentActor())!` のように非nullを決め打ちすると、未認証アクセスのたびに
 * 「null の id を読もうとした」という例外がログに残る。実際に踏んだので、両方で弾く。
 */
export async function requireActor(): Promise<SessionActor> {
  const actor = await currentActor();
  if (!actor) redirect('/login');
  return actor;
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    // 本番は Caddy 越しの HTTPS。ローカル開発は http のため Secure を付けると Cookie が載らない
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}
