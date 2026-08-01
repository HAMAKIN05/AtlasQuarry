import { and, asc, eq } from 'drizzle-orm';

import { db, type Transaction } from '@/db/client';
import { actor, comment, task } from '@/db/schema';
import { recordActivity } from '@/domain/activity/recorder';
import { assertCan, can } from '@/lib/auth/rbac';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import type { ActorContext } from '@/domain/actor-context';

/**
 * コメント（F-05）。
 *
 * v0.1 で対象にするのはタスクのみ。要望・ドキュメントはスコープ外のため、
 * target_type は 'task' 固定で扱う。
 */

export type CommentItem = {
  id: string;
  bodyMd: string;
  authorId: string;
  authorName: string;
  createdAt: Date;
};

export async function listTaskComments(taskId: string): Promise<CommentItem[]> {
  return db
    .select({
      id: comment.id,
      bodyMd: comment.bodyMd,
      authorId: comment.authorId,
      authorName: actor.name,
      createdAt: comment.createdAt,
    })
    .from(comment)
    .innerJoin(actor, eq(actor.id, comment.authorId))
    .where(and(eq(comment.targetType, 'task'), eq(comment.targetId, taskId)))
    .orderBy(asc(comment.createdAt));
}

export async function createTaskComment(
  actorCtx: ActorContext,
  taskId: string,
  bodyMd: string,
): Promise<CommentItem> {
  assertCan(actorCtx, 'comment.create');

  const body = bodyMd.trim();
  if (body.length === 0) {
    // 空白だけのコメントも空として弾く（受入基準 5.5）
    throw new ValidationError('コメントを入力してください');
  }

  return db.transaction(async (tx) => {
    await assertTaskExists(tx, taskId);

    const [created] = await tx
      .insert(comment)
      .values({ targetType: 'task', targetId: taskId, authorId: actorCtx.id, bodyMd: body })
      .returning();

    // タイムラインに出すのはコメント自身ではなく activity。エンティティはタスク側で引く
    await recordActivity(tx, {
      actorId: actorCtx.id,
      entityType: 'task',
      entityId: taskId,
      action: 'comment',
      diff: { commentId: created!.id },
      ip: actorCtx.ip,
      userAgent: actorCtx.userAgent,
    });

    return {
      id: created!.id,
      bodyMd: created!.bodyMd,
      authorId: created!.authorId,
      authorName: actorCtx.name,
      createdAt: created!.createdAt,
    };
  });
}

/** 投稿者本人と manager 以上が削除できる（受入基準 5.5）。 */
export async function deleteComment(actorCtx: ActorContext, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(comment).where(eq(comment.id, id)).limit(1);
    const found = rows[0];
    if (!found) throw new NotFoundError('コメントが見つかりません', 'COMMENT_NOT_FOUND');

    if (!can(actorCtx, 'comment.delete', { authorId: found.authorId })) {
      throw new ForbiddenError();
    }

    await recordActivity(tx, {
      actorId: actorCtx.id,
      entityType: 'comment',
      entityId: id,
      action: 'delete',
      diff: { targetType: found.targetType, targetId: found.targetId },
      ip: actorCtx.ip,
      userAgent: actorCtx.userAgent,
    });

    await tx.delete(comment).where(eq(comment.id, id));
  });
}

async function assertTaskExists(tx: Transaction, id: string): Promise<void> {
  const rows = await tx.select({ id: task.id }).from(task).where(eq(task.id, id)).limit(1);
  if (rows.length === 0) {
    throw new NotFoundError('タスクが見つかりません', 'TASK_NOT_FOUND');
  }
}
