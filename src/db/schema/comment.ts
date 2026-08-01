import { sql } from 'drizzle-orm';
import { bigint, check, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, inList, primaryId } from './_columns';
import {
  ATTACHMENT_TARGET_TYPES,
  COMMENT_TARGET_TYPES,
  type AttachmentTargetType,
  type CommentTargetType,
} from './enums';
import { actor } from './actor';

/**
 * ポリモーフィック参照のため target_id に外部キー制約は張れない（DB設計書 §3.5）。
 * 対象削除時のクリーンアップはアプリケーション側で行う。
 */
export const comment = pgTable(
  'comment',
  {
    id: primaryId(),
    targetType: text('target_type').$type<CommentTargetType>().notNull(),
    targetId: uuid('target_id').notNull(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => actor.id),
    bodyMd: text('body_md').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('idx_comment_target').on(t.targetType, t.targetId, t.createdAt),
    check('comment_target_type_check', inList(t.targetType, COMMENT_TARGET_TYPES)),
  ],
);

/** 添付ファイル（F-13 / v0.3）。v0.1 ではテーブルのみ。 */
export const attachment = pgTable(
  'attachment',
  {
    id: primaryId(),
    targetType: text('target_type').$type<AttachmentTargetType>().notNull(),
    targetId: uuid('target_id').notNull(),
    filename: text('filename').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    mimeType: text('mime_type').notNull(),
    storageKey: text('storage_key').notNull().unique(),
    uploaderId: uuid('uploader_id')
      .notNull()
      .references(() => actor.id),
    createdAt: createdAt(),
  },
  (t) => [
    index('idx_attachment_target').on(t.targetType, t.targetId),
    check('attachment_target_type_check', inList(t.targetType, ATTACHMENT_TARGET_TYPES)),
    check('attachment_size_positive', sql`${t.sizeBytes} > 0`),
  ],
);

export type Comment = typeof comment.$inferSelect;
export type NewComment = typeof comment.$inferInsert;
