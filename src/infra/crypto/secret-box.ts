import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * 対称鍵による封筒暗号化。
 *
 * 用途:
 * - `actor.totp_secret`（技術仕様書 §2.4）
 * - `integration.config_encrypted`（機能定義書 §6.2）
 *
 * **復号結果をログ・エラーメッセージ・スタックトレースに出さないこと**（CLAUDE.md 絶対ルール §4）。
 * このモジュールは例外メッセージにも平文・鍵を含めない。
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

let cachedKey: Buffer | null = null;

/**
 * ENCRYPTION_KEY を 32 バイトの鍵として解釈する。
 *
 * base64 → hex → utf8 の順に試し、32バイトになったものを採用する。
 * 運用では `openssl rand -base64 32` の出力を想定している。
 */
function loadKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('ENCRYPTION_KEY が設定されていません');
  }

  const candidates = [
    Buffer.from(raw, 'base64'),
    Buffer.from(raw, 'hex'),
    Buffer.from(raw, 'utf8'),
  ];
  const key = candidates.find((buf) => buf.length === KEY_BYTES);
  if (!key) {
    throw new Error('ENCRYPTION_KEY は32バイトである必要があります');
  }

  cachedKey = key;
  return key;
}

/** テスト・鍵ローテーション時にキャッシュを捨てる。 */
export function resetKeyCache(): void {
  cachedKey = null;
}

/** 平文を封入する。返り値のレイアウトは [iv(12) | tag(16) | ciphertext]。 */
export function seal(plaintext: string): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, loadKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

/** 封入された値を開く。改竄されていれば例外を投げる（メッセージに中身は含めない）。 */
export function open(sealed: Buffer): string {
  if (sealed.length <= IV_BYTES + TAG_BYTES) {
    throw new Error('暗号文の形式が不正です');
  }
  const iv = sealed.subarray(0, IV_BYTES);
  const tag = sealed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = sealed.subarray(IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, loadKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** text カラム（actor.totp_secret）に入れるための base64 版。 */
export function sealToString(plaintext: string): string {
  return seal(plaintext).toString('base64');
}

export function openFromString(sealed: string): string {
  return open(Buffer.from(sealed, 'base64'));
}
