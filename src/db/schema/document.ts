import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  pgTable,
  text,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { createdAt, inList, primaryId, tz, updatedAt } from './_columns';
import {
  DECISION_SOURCES,
  DOCUMENT_TYPES,
  type DecisionSource,
  type DocumentType,
} from './enums';
import { actor } from './actor';
import { product } from './product';

/** ドキュメント・議事録（F-11 / F-23 / v0.3）。v0.1 ではテーブルのみ。 */
export const document = pgTable(
  'document',
  {
    id: primaryId(),
    productId: uuid('product_id').references(() => product.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => document.id, {
      onDelete: 'cascade',
    }),
    type: text('type').$type<DocumentType>().notNull(),
    title: text('title').notNull(),
    bodyMd: text('body_md').notNull().default(''),
    position: doublePrecision('position').notNull(),
    meetingDate: date('meeting_date'),
    isConfirmed: boolean('is_confirmed').notNull().default(false),
    /** 排他ロック（技術仕様書 §9）。リアルタイム共同編集は行わない。 */
    lockedBy: uuid('locked_by').references(() => actor.id, { onDelete: 'set null' }),
    lockedAt: tz('locked_at'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => actor.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('idx_document_parent').on(t.parentId),
    index('idx_document_product').on(t.productId),
    index('idx_document_type').on(t.type),
    check('document_type_check', inList(t.type, DOCUMENT_TYPES)),
    check(
      'minutes_only_fields',
      sql`${t.type} = 'minutes' OR (${t.meetingDate} IS NULL AND ${t.isConfirmed} = false)`,
    ),
  ],
);

export const documentRevision = pgTable(
  'document_revision',
  {
    id: primaryId(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => document.id, { onDelete: 'cascade' }),
    bodyMd: text('body_md').notNull(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => actor.id),
    createdAt: createdAt(),
  },
  (t) => [index('idx_revision_document').on(t.documentId, t.createdAt.desc())],
);

/**
 * `/decide` で拾った決定事項のバッファ（機能定義書 §6.2）。
 * 議事録本文へ自動追記せず、人間が確認してからマージする。
 */
export const decisionNote = pgTable(
  'decision_note',
  {
    id: primaryId(),
    documentId: uuid('document_id').references(() => document.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    source: text('source').$type<DecisionSource>().notNull(),
    sourceRef: text('source_ref'),
    authorId: uuid('author_id')
      .notNull()
      .references(() => actor.id),
    isMerged: boolean('is_merged').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('idx_decision_unmerged').on(t.isMerged, t.createdAt.desc()),
    check('decision_note_source_check', inList(t.source, DECISION_SOURCES)),
  ],
);
