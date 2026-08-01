import { generateSecret, generateURI, verify } from 'otplib';

import { openFromString, sealToString } from '@/infra/crypto/secret-box';

/**
 * TOTP（技術仕様書 §2.4）。
 *
 * - 標準の TOTP（30秒 / 6桁）
 * - 全ロールで任意設定。強制しない
 * - `actor.totp_secret` は暗号化して保存する
 * - リカバリコードは v0.1 では実装しない（管理者が手動で解除する運用）
 */

const ISSUER = 'AtlasQuarry';

/** 時刻ずれの許容。前後1ステップ（±30秒）まで受け付ける。 */
const EPOCH_TOLERANCE_SECONDS = 30;

/** 設定フロー用の新しいシークレット（Base32）を発行する。まだDBには保存しない。 */
export function createTotpSecret(): string {
  return generateSecret();
}

/** 認証アプリに読み込ませる otpauth:// URI。QRにするのは画面側の責務。 */
export function totpUri(secret: string, accountLabel: string): string {
  return generateURI({ issuer: ISSUER, label: accountLabel, secret });
}

/**
 * 6桁コードを検証する。
 *
 * 不正なシークレット等で例外が出ても false に潰す。呼び出し側から見ると「コード不一致」と
 * 同じ扱いでよく、例外の中身を認証エンドポイントへ伝播させたくない。
 */
export async function verifyTotp(secret: string, token: string): Promise<boolean> {
  if (!/^\d{6}$/.test(token)) return false;
  try {
    const result = await verify({
      secret,
      token,
      epochTolerance: EPOCH_TOLERANCE_SECONDS,
    });
    return result.valid;
  } catch {
    return false;
  }
}

/** DB へ保存する形（暗号化済み文字列）に変換する。 */
export function encryptTotpSecret(secret: string): string {
  return sealToString(secret);
}

/** DB から読んだ値を平文シークレットに戻す。戻り値をログに出さないこと。 */
export function decryptTotpSecret(stored: string): string {
  return openFromString(stored);
}
