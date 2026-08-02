import { and, desc, eq, lte, sql } from 'drizzle-orm';

import { db, type DbOrTx } from '@/db/client';
import { actor, notification, notificationPref, notificationQueue } from '@/db/schema';
import { discordNotifier } from '@/infra/notifier/discord';
import { mailNotifier } from '@/infra/notifier/mail';
import type { NotifierAdapter, NotifyEvent, NotifyPayload } from '@/infra/notifier/types';
import { logger } from '@/lib/logger';

/**
 * 通知の発火と配送（F-09）。
 *
 * **アプリ内（web）はその場で書き込み、外（メール・Discord）はキューに積む。**
 * 外部への送信は失敗しうるので、業務のトランザクションに巻き込まない。
 * タスクの割り当てが「メールが送れなかった」で巻き戻るのは筋が悪い。
 *
 * キューは DB1本（技術仕様書 §4.4）。Redis / BullMQ は入れない。
 * 取り出しは `FOR UPDATE SKIP LOCKED`、失敗は指数バックオフで再試行する。
 */

const ADAPTERS: NotifierAdapter[] = [mailNotifier, discordNotifier];

/** 既定の宛先。**利用者が何も設定していないときの挙動をここで決める。** */
const DEFAULT_CHANNELS: Record<NotifyEvent, Array<'web' | 'mail' | 'discord'>> = {
  'task.assigned': ['web', 'discord'],
  'task.due_soon': ['web'],
  'task.overdue': ['web', 'discord'],
  'task.completed': ['web'],
  'comment.created': ['web'],
  'comment.mentioned': ['web', 'discord'],
  'request.created': ['web', 'discord'],
  'request.decided': ['web'],
};

/**
 * 通知する。**同一トランザクションで呼んでよい。**
 *
 * 自分の操作で自分に通知しない（`exceptActorId`）。
 * 「自分がコメントしたことを自分に知らせる」のは雑音でしかない。
 */
export async function notify(
  tx: DbOrTx,
  payload: NotifyPayload & { exceptActorId?: string | null },
): Promise<void> {
  if (payload.exceptActorId && payload.exceptActorId === payload.actorId) return;

  const channels = await channelsFor(tx, payload.actorId, payload.event);

  if (channels.includes('web')) {
    await tx.insert(notification).values({
      actorId: payload.actorId,
      eventType: payload.event,
      targetType: payload.targetType ?? null,
      targetId: payload.targetId ?? null,
      title: payload.title,
      body: payload.body,
      url: payload.url ?? null,
      deliveredChannels: ['web'],
    });
  }

  for (const channel of ['mail', 'discord'] as const) {
    if (!channels.includes(channel)) continue;
    await tx.insert(notificationQueue).values({
      channel,
      payloadJson: payload as unknown as Record<string, unknown>,
    });
  }
}

/** その人がその出来事をどの経路で受けるか。設定が無ければ既定に従う。 */
async function channelsFor(
  tx: DbOrTx,
  actorId: string,
  event: NotifyEvent,
): Promise<Array<'web' | 'mail' | 'discord'>> {
  const prefs = await tx
    .select({ channel: notificationPref.channel, enabled: notificationPref.enabled })
    .from(notificationPref)
    .where(and(eq(notificationPref.actorId, actorId), eq(notificationPref.eventType, event)));

  if (prefs.length === 0) return DEFAULT_CHANNELS[event] ?? ['web'];
  return prefs.filter((p) => p.enabled).map((p) => p.channel);
}

/* ------------------------------------------------------------------ *
 * キューの取り出しと送信
 * ------------------------------------------------------------------ */

const MAX_ATTEMPTS = 5;

/**
 * 溜まっている通知を送る。**1回の呼び出しで最大 `limit` 件。**
 *
 * `FOR UPDATE SKIP LOCKED` で取り出すので、複数のプロセスが同時に呼んでも
 * 同じ行を二重に送らない。失敗したら指数バックオフ（2^試行回数 分）で戻す。
 */
export async function drainQueue(limit = 20): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < limit; i += 1) {
    const picked = await db.transaction(async (tx) => {
      const rows = await tx.execute(sql`
        select id, channel, payload_json, attempts
          from notification_queue
         where status = 'pending' and next_retry_at <= now()
         order by next_retry_at
         limit 1
           for update skip locked
      `);
      const row = (rows as unknown as { rows: Array<Record<string, unknown>> }).rows?.[0];
      if (!row) return null;

      await tx
        .update(notificationQueue)
        .set({ status: 'processing' })
        .where(eq(notificationQueue.id, row.id as string));

      return row;
    });

    if (!picked) break;

    const id = picked.id as string;
    const channel = picked.channel as 'mail' | 'discord';
    const payload = picked.payload_json as unknown as NotifyPayload;
    const attempts = Number(picked.attempts ?? 0) + 1;

    try {
      const adapter = ADAPTERS.find((a) => a.channel === channel);
      if (!adapter) throw new Error(`未知の経路です: ${channel}`);
      if (!(await adapter.isConfigured())) throw new Error(`${channel} の設定がありません`);

      const [to] = await db
        .select({ name: actor.name, email: actor.email })
        .from(actor)
        .where(eq(actor.id, payload.actorId))
        .limit(1);
      if (!to) throw new Error('宛先が見つかりません');

      await adapter.send({ ...payload, to });

      await db
        .update(notificationQueue)
        .set({ status: 'sent', attempts })
        .where(eq(notificationQueue.id, id));
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const giveUp = attempts >= MAX_ATTEMPTS;

      await db
        .update(notificationQueue)
        .set({
          status: giveUp ? 'failed' : 'pending',
          attempts,
          lastError: message.slice(0, 500),
          nextRetryAt: sql`now() + (${2 ** attempts} || ' minutes')::interval`,
        })
        .where(eq(notificationQueue.id, id));

      // **本文や宛先は出さない。** 経路と理由だけ残す
      logger.warn('通知の送信に失敗しました', { channel, attempts, reason: message });
      failed += 1;
    }
  }

  return { sent, failed };
}

/* ------------------------------------------------------------------ *
 * アプリ内通知
 * ------------------------------------------------------------------ */

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  url: string | null;
  isRead: boolean;
  createdAt: Date;
};

export async function listNotifications(actorId: string, limit = 50): Promise<NotificationItem[]> {
  return db
    .select({
      id: notification.id,
      title: notification.title,
      body: notification.body,
      url: notification.url,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
    })
    .from(notification)
    .where(eq(notification.actorId, actorId))
    .orderBy(desc(notification.createdAt))
    .limit(limit);
}

export async function countUnread(actorId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notification)
    .where(and(eq(notification.actorId, actorId), eq(notification.isRead, false)));
  return row?.count ?? 0;
}

export async function markAllRead(actorId: string): Promise<void> {
  await db
    .update(notification)
    .set({ isRead: true })
    .where(and(eq(notification.actorId, actorId), eq(notification.isRead, false)));
}

/** 古い既読を消す。溜め続ける意味がない。 */
export async function purgeOldNotifications(days = 60): Promise<void> {
  await db
    .delete(notification)
    .where(
      and(
        eq(notification.isRead, true),
        lte(notification.createdAt, sql`now() - (${days} || ' days')::interval`),
      ),
    );
}
