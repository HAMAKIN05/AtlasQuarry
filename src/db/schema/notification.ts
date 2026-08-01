import { sql } from 'drizzle-orm';
import { boolean, check, index, jsonb, pgTable, primaryKey, smallint, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, inList, primaryId, tz } from './_columns';
import {
  NOTIFY_CHANNELS,
  QUEUED_CHANNELS,
  QUEUE_STATUSES,
  type NotifyChannel,
  type QueueStatus,
  type QueuedChannel,
} from './enums';
import { actor } from './actor';

/** 通知基盤（F-09 / v0.2）。v0.1 ではテーブルのみ作り、発火・送信は実装しない。 */
export const notification = pgTable(
  'notification',
  {
    id: primaryId(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actor.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    targetType: text('target_type'),
    targetId: uuid('target_id'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    url: text('url'),
    isRead: boolean('is_read').notNull().default(false),
    deliveredChannels: text('delivered_channels')
      .array()
      .notNull()
      .default(sql`'{}'`),
    createdAt: createdAt(),
  },
  (t) => [index('idx_notification_unread').on(t.actorId, t.isRead, t.createdAt.desc())],
);

export const notificationPref = pgTable(
  'notification_pref',
  {
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actor.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    channel: text('channel').$type<NotifyChannel>().notNull(),
    enabled: boolean('enabled').notNull().default(true),
  },
  (t) => [
    primaryKey({ columns: [t.actorId, t.eventType, t.channel] }),
    check('notification_pref_channel_check', inList(t.channel, NOTIFY_CHANNELS)),
  ],
);

/**
 * DBベースの簡易キュー（技術仕様書 §4.4）。Redis / BullMQ は導入しない。
 * 取り出しは `FOR UPDATE SKIP LOCKED` で行い、失敗時は指数バックオフで再試行する。
 */
export const notificationQueue = pgTable(
  'notification_queue',
  {
    id: primaryId(),
    channel: text('channel').$type<QueuedChannel>().notNull(),
    payloadJson: jsonb('payload_json').notNull(),
    status: text('status').$type<QueueStatus>().notNull().default('pending'),
    attempts: smallint('attempts').notNull().default(0),
    nextRetryAt: tz('next_retry_at')
      .notNull()
      .default(sql`now()`),
    lastError: text('last_error'),
    createdAt: createdAt(),
  },
  (t) => [
    index('idx_queue_pending')
      .on(t.status, t.nextRetryAt)
      .where(sql`status = 'pending'`),
    check('notification_queue_channel_check', inList(t.channel, QUEUED_CHANNELS)),
    check('notification_queue_status_check', inList(t.status, QUEUE_STATUSES)),
  ],
);
