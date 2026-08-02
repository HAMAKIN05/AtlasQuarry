import { verify as verifyEd25519 } from 'node:crypto';

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { decisionNote, integration } from '@/db/schema';
import { actorByDiscordId } from '@/domain/actor/identity';
import { recordActivity } from '@/domain/activity/recorder';
import { createRequest } from '@/domain/request/service';
import { open as openSealed } from '@/infra/crypto/secret-box';
import { logger } from '@/lib/logger';

/**
 * Discord のスラッシュコマンド（F-22c `/request` / F-24 `/decide`）。
 *
 * **Discord → こちらへの一方向。** こちらの変更を Discord へ戻す同期はしない
 * （CLAUDE.md の禁止事項）。通知（F-22a）とは別の経路で、こちらは「受け口」。
 *
 * **署名を必ず検証する。** このエンドポイントは認証なしで公開される。
 * Discord は全リクエストに Ed25519 署名を付けるので、アプリの公開鍵で検証する。
 * 検証しないと、誰でも他人の名前で要望を起票できる。
 *
 * **本人確認は紐付け（F-22b）で行う。** 紐付けていない人のコマンドは受けない。
 * Discord の表示名を信じて actor を作ると、なりすましができてしまう。
 */

const PONG = 1;
const APPLICATION_COMMAND = 2;
const CHANNEL_MESSAGE = 4;

type DiscordConfig = { webhookUrl?: string; publicKey?: string };

async function publicKey(): Promise<string | null> {
  const rows = await db
    .select({ config: integration.configEncrypted })
    .from(integration)
    .where(and(eq(integration.provider, 'discord'), eq(integration.isActive, true)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const config = JSON.parse(openSealed(row.config)) as DiscordConfig;
  return config.publicKey ?? null;
}

/** Discord の Ed25519 署名を検証する。**ライブラリは足さない**（Node の crypto で足りる）。 */
function verifySignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  body: string,
): boolean {
  try {
    // 生の32バイト公開鍵を SPKI に包む（Node は SPKI しか受けない）
    const spki = Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'),
      Buffer.from(publicKeyHex, 'hex'),
    ]);

    return verifyEd25519(
      null,
      Buffer.from(timestamp + body),
      { key: spki, format: 'der', type: 'spki' },
      Buffer.from(signatureHex, 'hex'),
    );
  } catch {
    return false;
  }
}

/** その場で見えるだけの返事（ephemeral）。チャンネルを汚さない。 */
function reply(content: string) {
  return NextResponse.json({
    type: CHANNEL_MESSAGE,
    data: { content, flags: 1 << 6 },
  });
}

export async function POST(request: Request) {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const body = await request.text();

  const key = await publicKey();
  if (!key) return new NextResponse('未設定です', { status: 503 });

  if (!signature || !timestamp || !verifySignature(key, signature, timestamp, body)) {
    // **理由は返さない。** 401 だけ
    return new NextResponse('invalid signature', { status: 401 });
  }

  const payload = JSON.parse(body) as {
    type: number;
    data?: { name?: string; options?: Array<{ name: string; value: string }> };
    member?: { user?: { id?: string } };
    user?: { id?: string };
    channel_id?: string;
    id?: string;
  };

  if (payload.type === 1) return NextResponse.json({ type: PONG });
  if (payload.type !== APPLICATION_COMMAND) return NextResponse.json({ type: PONG });

  const discordId = payload.member?.user?.id ?? payload.user?.id ?? null;
  if (!discordId) return reply('あなたが誰か分かりませんでした。');

  const me = await actorByDiscordId(discordId);
  if (!me) {
    return reply(
      'このツールと紐付いていません。AtlasQuarry の 設定 → 自分の設定 から、Discord のユーザーIDを登録してください。',
    );
  }

  /*
   * コマンド名は日本語で登録する（`/要望` `/決定`）。Discord は Unicode の
   * コマンド名を許すので、英語名を覚えてもらう理由がない。
   * 英語名でも受けるのは、登録し直す前の呼び出しを落とさないため。
   */
  const raw = payload.data?.name;
  const command = raw === '要望' ? 'request' : raw === '決定' ? 'decide' : raw;
  const options = Object.fromEntries((payload.data?.options ?? []).map((o) => [o.name, o.value]));

  try {
    if (command === 'request') {
      const title = String(options.title ?? '').trim();
      if (!title) return reply('内容を入れてください。');

      const created = await createRequest(
        { id: me.id, name: me.name, role: me.role as never, isActive: true, ip: null, userAgent: 'discord' },
        { title, bodyMd: null, productId: null },
      );

      const url = `${process.env.APP_URL ?? ''}/requests/${created.id}`;
      return reply(`要望として受け付けました。\n${url}`);
    }

    if (command === 'decide') {
      const text = String(options.text ?? '').trim();
      if (!text) return reply('決めたことを入れてください。');

      /*
       * **議事録へ直接書き込まない。** いったん決定事項の控えに置き、
       * 人が確認してから議事録へ入れる（機能定義書 §6.2）。
       * Discord の発言をそのまま記録にすると、言い間違いがそのまま残る。
       */
      await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(decisionNote)
          .values({
            body: text,
            source: 'discord',
            sourceRef: payload.channel_id ?? null,
            authorId: me.id,
          })
          .returning({ id: decisionNote.id });

        await recordActivity(tx, {
          actorId: me.id,
          entityType: 'document',
          entityId: created!.id,
          action: 'create',
          diff: { decision: text.slice(0, 100), via: 'discord' },
          ip: null,
          userAgent: 'discord',
        });
      });

      return reply('決めたこととして控えました。議事録に入れるときは、こちらの画面から取り込めます。');
    }

    return reply('知らないコマンドです。');
  } catch (error) {
    // **本文も宛先も出さない**
    logger.error('Discord コマンドの処理に失敗', {
      command: raw,
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return reply('うまくいきませんでした。時間をおいて試してください。');
  }
}
