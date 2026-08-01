import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  inet,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  uuid,
} from 'drizzle-orm/pg-core';

import { createdAt, inList, primaryId, tz } from './_columns';
import {
  ACTIVITY_ACTIONS,
  ENTITY_TYPES,
  WORKLOG_SOURCES,
  type ActivityAction,
  type EntityType,
  type WorklogSource,
} from './enums';
import { actor } from './actor';
import { task } from './task';

/** 工数算出専用（F-17 / v0.5）。ヒートマップは activity を見るため、この分離を崩さない。 */
export const workLog = pgTable(
  'work_log',
  {
    id: primaryId(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actor.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
    workDate: date('work_date').notNull(),
    minutes: integer('minutes').notNull(),
    note: text('note'),
    source: text('source').$type<WorklogSource>().notNull().default('manual'),
    createdAt: createdAt(),
  },
  (t) => [
    index('idx_worklog_actor_date').on(t.actorId, t.workDate),
    index('idx_worklog_task').on(t.taskId),
    check('work_log_source_check', inList(t.source, WORKLOG_SOURCES)),
    check('work_log_minutes_range', sql`${t.minutes} > 0 AND ${t.minutes} <= 1440`),
  ],
);

/**
 * 変更履歴・ヒートマップ・タイムラインの唯一のデータソース（機能定義書 §6.2）。
 *
 * **UPDATE / DELETE を発行するコードを書かないこと。**（DB設計書 §3.6）
 * 記録は必ずミューテーションと同一トランザクション内で行う。domain/activity/recorder.ts を使う。
 */
export const activity = pgTable(
  'activity',
  {
    id: primaryId(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actor.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').$type<EntityType>().notNull(),
    entityId: uuid('entity_id').notNull(),
    action: text('action').$type<ActivityAction>().notNull(),
    diffJson: jsonb('diff_json').$type<Record<string, unknown> | null>(),
    /** 記録時点の重みを保存する。後から重みを変えても過去のヒートマップが揺れないようにするため。 */
    weight: smallint('weight').notNull().default(1),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [
    index('idx_activity_actor_date').on(t.actorId, t.createdAt.desc()),
    index('idx_activity_entity').on(t.entityType, t.entityId, t.createdAt.desc()),
    index('idx_activity_created').on(t.createdAt.desc()),
    check('activity_entity_type_check', inList(t.entityType, ENTITY_TYPES)),
    check('activity_action_check', inList(t.action, ACTIVITY_ACTIONS)),
  ],
);

/** AIエージェントの作業セッション（F-18 / v1.0）。v0.1 ではテーブルのみ。 */
export const agentSession = pgTable(
  'agent_session',
  {
    id: primaryId(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => actor.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => task.id, { onDelete: 'set null' }),
    startedAt: tz('started_at')
      .notNull()
      .default(sql`now()`),
    endedAt: tz('ended_at'),
    toolCallCount: integer('tool_call_count').notNull().default(0),
    summary: text('summary'),
    tokenUsage: integer('token_usage'),
  },
  (t) => [
    index('idx_agent_session_task').on(t.taskId),
    index('idx_agent_session_agent').on(t.agentId, t.startedAt.desc()),
  ],
);

export type Activity = typeof activity.$inferSelect;
export type NewActivity = typeof activity.$inferInsert;
