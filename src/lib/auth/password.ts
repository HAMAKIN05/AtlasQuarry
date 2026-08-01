import { hash, verify } from '@node-rs/argon2';

/**
 * パスワードハッシュ（技術仕様書 §2.3）。
 *
 * パラメータはVPSのスペックに合わせて調整可だが、変更するとハッシュ形式に埋め込まれるため
 * 既存ハッシュの検証は引き続き動く（verify はハッシュ側のパラメータを読む）。
 */
const ARGON2_OPTIONS = {
  // argon2id
  algorithm: 2,
  memoryCost: 65_536, // 64MB
  timeCost: 3,
  parallelism: 4,
} as const;

export const PASSWORD_MIN_LENGTH = 12;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

/**
 * パスワードを検証する。
 *
 * ハッシュが壊れている等で verify が例外を投げても false を返す。呼び出し側から見ると
 * 「一致しなかった」と同じ扱いでよく、例外内容を認証エンドポイントに伝播させたくない。
 */
export async function verifyPassword(hashValue: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashValue, plain, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

/**
 * 存在しないアカウントに対してもハッシュ検証と同等の時間を消費させる。
 *
 * これがないと応答時間の差でメールアドレスの存在有無が漏れる。
 */
export async function fakeVerifyPassword(): Promise<void> {
  await hash('atlasquarry-timing-equalizer', ARGON2_OPTIONS);
}
