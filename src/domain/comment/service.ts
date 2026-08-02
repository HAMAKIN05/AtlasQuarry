import { and, asc, eq } from 'drizzle-orm';

import { db, type Transaction } from '@/db/client';
import { actor, comment, task } from '@/db/schema';
import { recordActivity } from '@/domain/activity/recorder';
import { notify } from '@/domain/notification/service';
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

    /*
     * **メンションと、関わっている人への通知。**
     * 「@名前」で名前を呼ばれた人と、そのタスクの担当・作成者に届ける。
     * 自分の書き込みで自分には通知しない。
     */
    const [t] = await tx
      .select({ key: task.key, title: task.title, assigneeId: task.assigneeId, reporterId: task.reporterId })
      .from(task)
      .where(eq(task.id, taskId))
      .limit(1);

    if (t) {
      const url = `/tasks/${t.key}`;
      const preview = body.length > 80 ? `${body.slice(0, 80)}…` : body;

      const mentioned = await resolveMentions(tx, body);
      for (const actorId of mentioned) {
        await notify(tx, {
          event: 'comment.mentioned',
          actorId,
          exceptActorId: actorCtx.id,
          title: `${actorCtx.name}さんがあなたを呼んでいます`,
          body: `${t.title}\n${preview}`,
          url,
          targetType: 'task',
          targetId: taskId,
        });
      }

      // 呼ばれた人には二重に送らない
      const others = [t.assigneeId, t.reporterId].filter(
        (id): id is string => !!id && !mentioned.includes(id),
      );
      for (const actorId of new Set(others)) {
        await notify(tx, {
          event: 'comment.created',
          actorId,
          exceptActorId: actorCtx.id,
          title: 'コメントが付きました',
          body: `${t.title}\n${preview}`,
          url,
          targetType: 'task',
          targetId: taskId,
        });
      }
    }

    return {
      id: created!.id,
      bodyMd: created!.bodyMd,
      authorId: created!.authorId,
      authorName: actorCtx.name,
      createdAt: created!.createdAt,
    };
  });
}

/**
 * 本文から「@名前」を拾って、実在するメンバーの id に変える（F-05 メンション）。
 *
 * **表示名で書かせる。** 3人なので、ID やハンドルを覚えさせる意味がない。
 * 前方一致ではなく完全一致にする（「@田中」で「田中太郎」と「田中花子」の両方を
 * 拾うと、呼んでいない人に届く）。
 */
async function resolveMentions(tx: Transaction, body: string): Promise<string[]> {
  const names = [...body.matchAll(/@([^\s@、。]+)/g)].map((m) => m[1]!);
  if (names.length === 0) return [];

  const members = await tx
    .select({ id: actor.id, name: actor.name })
    .from(actor)
    .where(eq(actor.isActive, true));

  const hit = new Set<string>();
  for (const name of names) {
    const found = members.find((m) => m.name === name);
    if (found) hit.add(found.id);
  }
  return [...hit];
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
