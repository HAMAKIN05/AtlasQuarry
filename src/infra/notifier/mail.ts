import { and, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { integration } from '@/db/schema';
import { open as openSealed } from '@/infra/crypto/secret-box';

import type { NotifierAdapter, NotifyPayload } from './types';

/**
 * メール通知（F-09）。
 *
 * **ライブラリを足さない。** nodemailer を入れずに、SMTP を素の TCP で喋る。
 * 3人・1日数通という量で、依存を1つ増やす価値がない。
 * 対応するのは `STARTTLS` と `AUTH LOGIN` の組み合わせだけ（一般的な SMTP 中継はこれで通る）。
 *
 * 設定は `integration`（provider = 'smtp'）に暗号化して置く。**復号結果をログに出さない。**
 */

type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
};

async function loadConfig(): Promise<SmtpConfig | null> {
  const rows = await db
    .select({ config: integration.configEncrypted })
    .from(integration)
    .where(and(eq(integration.provider, 'smtp'), eq(integration.isActive, true)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const config = JSON.parse(openSealed(row.config)) as SmtpConfig;
  return config.host && config.from ? config : null;
}

/** 1通ぶんの SMTP 会話。失敗したら投げる（キューが再試行する）。 */
async function sendSmtp(config: SmtpConfig, to: string, subject: string, text: string) {
  const net = await import('node:net');
  const tls = await import('node:tls');

  let socket: import('node:net').Socket = net.connect(config.port, config.host);

  const read = (): Promise<string> =>
    new Promise((resolve, reject) => {
      const onData = (chunk: Buffer) => {
        socket.off('error', onError);
        resolve(chunk.toString('utf8'));
      };
      const onError = (e: Error) => {
        socket.off('data', onData);
        reject(e);
      };
      socket.once('data', onData);
      socket.once('error', onError);
    });

  const write = async (line: string, expect = '2') => {
    socket.write(`${line}\r\n`);
    const res = await read();
    if (!res.startsWith(expect)) {
      // **応答をそのまま投げない。** 認証情報が混ざる可能性がある
      throw new Error(`SMTP がエラーを返しました（${res.slice(0, 3)}）`);
    }
  };

  try {
    await read(); // 220
    await write(`EHLO atlasquarry`, '2');
    await write('STARTTLS', '2');

    socket = tls.connect({ socket, servername: config.host }) as unknown as import('node:net').Socket;
    await new Promise((resolve, reject) => {
      socket.once('secureConnect' as never, resolve);
      socket.once('error', reject);
    });

    await write(`EHLO atlasquarry`, '2');
    await write('AUTH LOGIN', '3');
    await write(Buffer.from(config.user).toString('base64'), '3');
    await write(Buffer.from(config.pass).toString('base64'), '2');
    await write(`MAIL FROM:<${config.from}>`, '2');
    await write(`RCPT TO:<${to}>`, '2');
    await write('DATA', '3');

    const headers = [
      `From: AtlasQuarry <${config.from}>`,
      `To: <${to}>`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
    ].join('\r\n');

    socket.write(`${headers}\r\n\r\n${Buffer.from(text).toString('base64')}\r\n.\r\n`);
    const res = await read();
    if (!res.startsWith('2')) throw new Error('メールを受け付けてもらえませんでした');

    socket.write('QUIT\r\n');
  } finally {
    socket.destroy();
  }
}

export const mailNotifier: NotifierAdapter = {
  channel: 'mail',

  async isConfigured() {
    return (await loadConfig()) !== null;
  },

  async send(payload: NotifyPayload & { to: { name: string; email: string | null } }) {
    const config = await loadConfig();
    if (!config) throw new Error('メールの送信元が設定されていません');
    if (!payload.to.email) throw new Error('宛先のメールアドレスがありません');

    const appUrl = process.env.APP_URL ?? '';
    const body = [payload.body, payload.url ? `${appUrl}${payload.url}` : null]
      .filter(Boolean)
      .join('\n\n');

    await sendSmtp(config, payload.to.email, payload.title, body);
  },
};
