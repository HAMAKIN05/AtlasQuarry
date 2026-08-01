import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * ランダムトークンとそのハッシュ（技術仕様書 §2.2 / §2.7 / §11.2）。
 *
 * セッション・招待・APIキーのいずれも、**DBにはSHA-256ハッシュのみを保存する。**
 * 平文はCookieか発行時の1回きりの表示にしか存在させない。
 */

const TOKEN_BYTES = 32;

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** ハッシュ同士の比較。長さが同じなので固定時間比較にできる。 */
export function tokenHashEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
