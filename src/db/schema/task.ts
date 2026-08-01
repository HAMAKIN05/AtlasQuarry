import { sql } from 'drizzle-orm';
import {
  check,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { createdAt, inList, primaryId, tz, updatedAt } from './_columns';
import {
  DEPENDENCY_TYPES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type DependencyType,
  type TaskPriority,
  type TaskStatus,
} from './enums';
import { actor } from './actor';
import { feature, product } from './product';

export const task = pgTable(
  'task',
  {
    id: primaryId(),
    /** feature_id が null のタスクでも所属プロダクトを辿れるよう冗長に持つ（機能定義書 §6.2）。 */
    productId: uuid('product_id')
      .notNull()
      .references(() => product.id, { onDelete: 'cascade' }),
    /** 開発項目にまとめる意味がないタスク（バグ修正・雑務）のため nullable。 */
    featureId: uuid('feature_id').references(() => feature.id, { onDelete: 'set null' }),
    parentTaskId: uuid('parent_task_id').references((): AnyPgColumn => task.id, {
      onDelete: 'cascade',
    }),
    /** 例: PRD-123。product.task_seq の採番と同一トランザクションで生成する。 */
    key: text('key').notNull().unique(),
    title: text('title').notNull(),
    bodyMd: text('body_md'),
    status: text('status').$type<TaskStatus>().notNull().default('backlog'),
    priority: text('priority').$type<TaskPriority>().notNull().default('normal'),
    assigneeId: uuid('assignee_id').references(() => actor.id, { onDelete: 'set null' }),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => actor.id),
    estimateMinutes: integer('estimate_minutes'),
    startDate: date('start_date'),
    dueDate: date('due_date'),
    /** かんばんの並び替えで全行 UPDATE しないため double precision（技術仕様書 §7）。 */
    position: doublePrecision('position').notNull(),
    completedAt: tz('completed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('idx_task_product').on(t.productId),
    index('idx_task_feature').on(t.featureId),
    index('idx_task_assignee').on(t.assigneeId),
    index('idx_task_status').on(t.productId, t.status),
    index('idx_task_due')
      .on(t.dueDate)
      .where(sql`status NOT IN ('done','cancelled')`),
    index('idx_task_parent').on(t.parentTaskId),
    check('task_status_check', inList(t.status, TASK_STATUSES)),
    check('task_priority_check', inList(t.priority, TASK_PRIORITIES)),
    check(
      'task_estimate_positive',
      sql`${t.estimateMinutes} IS NULL OR ${t.estimateMinutes} > 0`,
    ),
    check(
      'date_order',
      sql`${t.startDate} IS NULL OR ${t.dueDate} IS NULL OR ${t.startDate} <= ${t.dueDate}`,
    ),
    check('done_has_timestamp', sql`${t.status} <> 'done' OR ${t.completedAt} IS NOT NULL`),
  ],
);

/** 先行タスク（F-14 ガント / v0.4）。手動・任意の FS のみ（機能定義書 D-05）。 */
export const taskDependency = pgTable(
  'task_dependency',
  {
    id: primaryId(),
    predecessorId: uuid('predecessor_id')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
    successorId: uuid('successor_id')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
    type: text('type').$type<DependencyType>().notNull().default('FS'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('task_dependency_pair_key').on(t.predecessorId, t.successorId),
    check('task_dependency_type_check', inList(t.type, DEPENDENCY_TYPES)),
    check('no_self_dependency', sql`${t.predecessorId} <> ${t.successorId}`),
  ],
);

/** product_id が null ならグローバルラベル。v0.1 ではテーブルのみでUIは作らない。 */
export const label = pgTable('label', {
  id: primaryId(),
  productId: uuid('product_id').references(() => product.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull().default('#888888'),
  createdAt: createdAt(),
});

export const taskLabel = pgTable(
  'task_label',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
    labelId: uuid('label_id')
      .notNull()
      .references(() => label.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.labelId] })],
);

export type Task = typeof task.$inferSelect;
export type NewTask = typeof task.$inferInsert;
