import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { actor, attachment } from '@/db/schema';
import type { AttachmentTargetType } from '@/db/schema/enums';
import { recordActivity } from '@/domain/activity/recorder';
import type { ActorContext } from '@/domain/actor-context';
import { localStorage } from '@/infra/storage/local';
import { can } from '@/lib/auth/rbac';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';

/**
 * 添付ファイル（F-13）。
 *
 * **受け付けるものを絞る。** 何でも置ける置き場にすると、実行ファイルの受け渡しに
 * 使われかねない。3人が業務で渡すのは、画面の写真・PDF・表計算・テキストくらい。
 *
 * **中身は Web から直接読めない場所に置く。** `public/` に置くと URL を知る人が
 * 誰でも取れる。必ずこのアプリの認証を通してから返す。
 */

const MAX_BYTES = 20 * 1024 * 1024;

/** 受け付ける種類。**増やすときは、その形式を開いて危なくないかを考えること。** */
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/heic',
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

export type AttachmentItem = {
  id: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  uploaderName: string;
  createdAt: Date;
};

export async function listAttachments(
  targetType: AttachmentTargetType,
  targetId: string,
): Promise<AttachmentItem[]> {
  return db
    .select({
      id: attachment.id,
      filename: attachment.filename,
      sizeBytes: attachment.sizeBytes,
      mimeType: attachment.mimeType,
      uploaderName: actor.name,
      createdAt: attachment.createdAt,
    })
    .from(attachment)
    .innerJoin(actor, eq(actor.id, attachment.uploaderId))
    .where(and(eq(attachment.targetType, targetType), eq(attachment.targetId, targetId)))
    .orderBy(asc(attachment.createdAt));
}

export async function addAttachment(
  actorCtx: ActorContext,
  input: {
    targetType: AttachmentTargetType;
    targetId: string;
    filename: string;
    mimeType: string;
    bytes: Buffer;
  },
): Promise<AttachmentItem> {
  if (input.bytes.byteLength === 0) {
    throw new ValidationError('中身が空のファイルは付けられません');
  }
  if (input.bytes.byteLength > MAX_BYTES) {
    throw new ValidationError(`ファイルは ${MAX_BYTES / 1024 / 1024}MB までです`);
  }
  if (!ALLOWED_MIME.has(input.mimeType)) {
    throw new ValidationError('この種類のファイルは付けられません（画像・PDF・Office・テキスト）');
  }

  const { key } = await localStorage.save(input.bytes, { mimeType: input.mimeType });

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(attachment)
      .values({
        targetType: input.targetType,
        targetId: input.targetId,
        // **利用者のファイル名は表示にしか使わない。** 保存先の名前には使わない
        filename: input.filename.slice(0, 200),
        sizeBytes: input.bytes.byteLength,
        mimeType: input.mimeType,
        storageKey: key,
        uploaderId: actorCtx.id,
      })
      .returning();

    await recordActivity(tx, {
      actorId: actorCtx.id,
      entityType: input.targetType === 'task' ? 'task' : 'document',
      entityId: input.targetId,
      action: 'update',
      diff: { attached: created!.filename },
      ip: actorCtx.ip,
      userAgent: actorCtx.userAgent,
    });

    return {
      id: created!.id,
      filename: created!.filename,
      sizeBytes: created!.sizeBytes,
      mimeType: created!.mimeType,
      uploaderName: actorCtx.name,
      createdAt: created!.createdAt,
    };
  });
}

/** 中身を返す。**呼ぶ側で認証を済ませてから使うこと。** */
export async function readAttachment(
  id: string,
): Promise<{ bytes: Buffer; filename: string; mimeType: string }> {
  const [found] = await db.select().from(attachment).where(eq(attachment.id, id)).limit(1);
  if (!found) throw new NotFoundError('ファイルが見つかりません', 'ATTACHMENT_NOT_FOUND');

  const bytes = await localStorage.read(found.storageKey);
  return { bytes, filename: found.filename, mimeType: found.mimeType };
}

/** 付けた本人と管理者以上が消せる。 */
export async function deleteAttachment(actorCtx: ActorContext, id: string): Promise<void> {
  const [found] = await db.select().from(attachment).where(eq(attachment.id, id)).limit(1);
  if (!found) throw new NotFoundError('ファイルが見つかりません', 'ATTACHMENT_NOT_FOUND');

  if (found.uploaderId !== actorCtx.id && !can(actorCtx, 'comment.delete')) {
    throw new ForbiddenError();
  }

  await db.transaction(async (tx) => {
    await tx.delete(attachment).where(eq(attachment.id, id));
    await recordActivity(tx, {
      actorId: actorCtx.id,
      entityType: found.targetType === 'task' ? 'task' : 'document',
      entityId: found.targetId,
      action: 'update',
      diff: { removedAttachment: found.filename },
      ip: actorCtx.ip,
      userAgent: actorCtx.userAgent,
    });
  });

  // DB を先に消す。ファイルが残っても実害は無いが、逆だと参照だけ残る
  await localStorage.remove(found.storageKey);
}
