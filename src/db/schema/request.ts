import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, inList, primaryId, tz } from './_columns';
import {
  REQUEST_SOURCES,
  REQUEST_STATUSES,
  type RequestSource,
  type RequestStatus,
} from './enums';
import { actor } from './actor';
import { product } from './product';
import { task } from './task';

/** 要望フロー（F-07 / F-08 / v0.2）。v0.1 ではテーブルのみ作り、画面・API・ロジックは作らない。 */
export const request = pgTable(
  'request',
  {
    id: primaryId(),
    productId: uuid('product_id').references(() => product.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    bodyMd: text('body_md'),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => actor.id),
    source: text('source').$type<RequestSource>().notNull().default('web'),
    sourceRef: text('source_ref'),
    status: text('status').$type<RequestStatus>().notNull().default('received'),
    convertedTaskId: uuid('converted_task_id').references(() => task.id, { onDelete: 'set null' }),
    decidedBy: uuid('decided_by').references(() => actor.id),
    decidedAt: tz('decided_at'),
    rejectReason: text('reject_reason'),
    createdAt: createdAt(),
  },
  (t) => [
    index('idx_request_status').on(t.status),
    index('idx_request_product').on(t.productId),
    check('request_source_check', inList(t.source, REQUEST_SOURCES)),
    check('request_status_check', inList(t.status, REQUEST_STATUSES)),
    check(
      'rejected_needs_reason',
      sql`${t.status} <> 'rejected' OR ${t.rejectReason} IS NOT NULL`,
    ),
  ],
);

export type Request = typeof request.$inferSelect;
