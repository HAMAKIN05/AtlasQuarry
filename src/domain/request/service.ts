import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { db, type Transaction } from '@/db/client';
import { actor, product, request, task } from '@/db/schema';
import type { RequestStatus } from '@/db/schema/enums';
import { recordActivity } from '@/domain/activity/recorder';
import { notify } from '@/domain/notification/service';
import { assertCan } from '@/lib/auth/rbac';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { POSITION_STEP } from '@/lib/position';
import type { ActorContext } from '@/domain/actor-context';

/**
 * 要望（F-07 / F-08）。
 *
 * 「こんなことができたら」を誰でも出せる場所。出したものを管理者以上が判断し、
 * 着手すると決めたものをタスクに変換する。**判断の履歴を残すのが目的**なので、
 * 見送る場合は理由を必須にしている（DB の CHECK 制約と同じ条件を入口でも弾く）。
 */

export type RequestListItem = {
  id: string;
  title: string;
  status: RequestStatus;
  reporterId: string;
  reporterName: string;
  productId: string | null;
  productName: string | null;
  convertedTaskId: string | null;
  convertedTaskKey: string | null;
  decidedAt: Date | null;
  createdAt: Date;
};

const LIST_COLUMNS = {
  id: request.id,
  title: request.title,
  status: request.status,
  reporterId: request.reporterId,
  reporterName: actor.name,
  productId: request.productId,
  productName: product.name,
  convertedTaskId: request.convertedTaskId,
  convertedTaskKey: task.key,
  decidedAt: request.decidedAt,
  createdAt: request.createdAt,
};

export async function listRequests(status?: RequestStatus[]): Promise<RequestListItem[]> {
  return db
    .select(LIST_COLUMNS)
    .from(request)
    .innerJoin(actor, eq(actor.id, request.reporterId))
    .leftJoin(product, eq(product.id, request.productId))
    .leftJoin(task, eq(task.id, request.convertedTaskId))
    .where(status && status.length > 0 ? inArray(request.status, status) : undefined)
    .orderBy(desc(request.createdAt));
}

/** ステータスごとの件数。タブに数字を出すために使う。 */
export async function countRequestsByStatus(): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: request.status, count: sql<number>`count(*)::int` })
    .from(request)
    .groupBy(request.status);

  const out: Record<string, number> = {};
  for (const row of rows) out[row.status] = row.count;
  return out;
}

export type RequestDetail = RequestListItem & {
  bodyMd: string | null;
  rejectReason: string | null;
  decidedById: string | null;
  decidedByName: string | null;
};

export async function getRequestById(id: string): Promise<RequestDetail> {
  const rows = await db
    .select({
      ...LIST_COLUMNS,
      bodyMd: request.bodyMd,
      rejectReason: request.rejectReason,
      decidedById: request.decidedBy,
    })
    .from(request)
    .innerJoin(actor, eq(actor.id, request.reporterId))
    .leftJoin(product, eq(product.id, request.productId))
    .leftJoin(task, eq(task.id, request.convertedTaskId))
    .where(eq(request.id, id))
    .limit(1);

  const found = rows[0];
  if (!found) throw new NotFoundError('要望が見つかりません', 'REQUEST_NOT_FOUND');

  // 判断した人は起票者と同じ actor テーブルなので別クエリで引く
  let decidedByName: string | null = null;
  if (found.decidedById) {
    const decider = await db
      .select({ name: actor.name })
      .from(actor)
      .where(eq(actor.id, found.decidedById))
      .limit(1);
    decidedByName = decider[0]?.name ?? null;
  }

  return { ...found, decidedByName };
}

export type CreateRequestInput = {
  title: string;
  bodyMd: string | null;
  productId: string | null;
};

export async function createRequest(actorCtx: ActorContext, input: CreateRequestInput) {
  assertCan(actorCtx, 'request.create');

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(request)
      .values({
        title: input.title,
        bodyMd: input.bodyMd,
        productId: input.productId,
        reporterId: actorCtx.id,
        source: 'web',
      })
      .returning();

    await recordActivity(tx, {
      actorId: actorCtx.id,
      entityType: 'request',
      entityId: created!.id,
      action: 'create',
      diff: { title: input.title },
      ip: actorCtx.ip,
      userAgent: actorCtx.userAgent,
    });

    /*
     * **判断できる人に知らせる。** 出しっぱなしで気づかれないのが要望の最大の失敗。
     * 出した本人には送らない。
     */
    const deciders = await tx
      .select({ id: actor.id })
      .from(actor)
      .where(and(eq(actor.isActive, true), inArray(actor.role, ['owner', 'manager'])));

    for (const d of deciders) {
      await notify(tx, {
        event: 'request.created',
        actorId: d.id,
        exceptActorId: actorCtx.id,
        title: '要望が出されました',
        body: `${actorCtx.name}さんから: ${input.title}`,
        url: `/requests/${created!.id}`,
        targetType: 'request',
        targetId: created!.id,
      });
    }

    return created!;
  });
}

export type TriageInput = {
  status: RequestStatus;
  rejectReason?: string | null;
  productId?: string | null;
};

/**
 * 要望を判断する。
 *
 * 見送る場合は理由が必須。判断した人と日時を残す。
 */
export async function triageRequest(actorCtx: ActorContext, id: string, input: TriageInput) {
  assertCan(actorCtx, 'request.triage');

  const reason = input.rejectReason?.trim() ?? null;
  if (input.status === 'rejected' && (reason === null || reason.length === 0)) {
    throw new ValidationError('見送る理由を入力してください', {
      fields: { rejectReason: ['見送る理由を入力してください'] },
    });
  }

  return db.transaction(async (tx) => {
    const before = await loadRequest(tx, id);

    /*
     * 決定者と日時は**判断が確定したときだけ**記録する。受付中へ戻したら消す。
     *
     * 以前は `received` 以外すべてを「判断済み」として扱っていたが、
     * `reviewing`（検討中）は「見たが、まだ決めていない」という印であって
     * 決定ではない。ここで決定者を刻むと、誰も決めていないのに決めた人が
     * 記録され、履歴が嘘になる。
     */
    const decided = input.status === 'accepted' || input.status === 'rejected';

    const [updated] = await tx
      .update(request)
      .set({
        status: input.status,
        rejectReason: input.status === 'rejected' ? reason : null,
        ...(input.productId !== undefined ? { productId: input.productId } : {}),
        decidedBy: decided ? actorCtx.id : null,
        decidedAt: decided ? new Date() : null,
      })
      .where(eq(request.id, id))
      .returning();

    await recordActivity(tx, {
      actorId: actorCtx.id,
      entityType: 'request',
      entityId: id,
      action: 'triage',
      diff: { status: { before: before.status, after: input.status } },
      ip: actorCtx.ip,
      userAgent: actorCtx.userAgent,
    });

    // **判断がついたら、出した人に返す。** 出して終わりにしない
    if (decided) {
      await notify(tx, {
        event: 'request.decided',
        actorId: before.reporterId,
        exceptActorId: actorCtx.id,
        title: input.status === 'rejected' ? '要望は見送りになりました' : '要望が採用されました',
        body: input.status === 'rejected' ? `${before.title}\n理由: ${reason ?? ''}` : before.title,
        url: `/requests/${id}`,
        targetType: 'request',
        targetId: id,
      });
    }

    return updated!;
  });
}

export type ConvertInput = {
  productId: string;
  featureId: string | null;
  assigneeId: string | null;
  dueDate: string | null;
};

/**
 * 要望をタスクに変換する（F-08）。
 *
 * 要望の本文をそのままタスクの本文にし、`converted_task_id` で双方向に辿れるようにする。
 * **二重変換を防ぐ。** 同じ要望から2つタスクができると、どちらが本物か分からなくなる。
 */
export async function convertRequestToTask(
  actorCtx: ActorContext,
  id: string,
  input: ConvertInput,
) {
  assertCan(actorCtx, 'request.triage');
  assertCan(actorCtx, 'task.create');

  return db.transaction(async (tx) => {
    const before = await loadRequest(tx, id);

    if (before.convertedTaskId) {
      throw new ConflictError(
        'この要望は既にタスクになっています',
        null,
        'REQUEST_ALREADY_CONVERTED',
      );
    }

    // タスクキーの採番。product.task_seq を同一トランザクションで進める
    const seqRows = await tx
      .update(product)
      .set({ taskSeq: sql`${product.taskSeq} + 1` })
      .where(eq(product.id, input.productId))
      .returning({ key: product.key, seq: product.taskSeq });

    const seq = seqRows[0];
    if (!seq) throw new NotFoundError('プロジェクトが見つかりません', 'PRODUCT_NOT_FOUND');

    const [last] = await tx
      .select({ position: task.position })
      .from(task)
      .where(and(eq(task.productId, input.productId), eq(task.status, 'todo')))
      .orderBy(desc(task.position))
      .limit(1);

    const [created] = await tx
      .insert(task)
      .values({
        productId: input.productId,
        featureId: input.featureId,
        key: `${seq.key}-${seq.seq}`,
        title: before.title,
        bodyMd: before.bodyMd,
        // 判断が済んで着手すると決めたものなので、未着手ではなく「予定」に置く
        status: 'todo',
        priority: 'normal',
        assigneeId: input.assigneeId,
        reporterId: before.reporterId,
        dueDate: input.dueDate,
        position: last ? last.position + POSITION_STEP : POSITION_STEP,
      })
      .returning();

    await tx
      .update(request)
      .set({
        convertedTaskId: created!.id,
        status: 'accepted',
        decidedBy: actorCtx.id,
        decidedAt: new Date(),
      })
      .where(eq(request.id, id));

    await recordActivity(tx, {
      actorId: actorCtx.id,
      entityType: 'request',
      entityId: id,
      action: 'triage',
      diff: { convertedTaskKey: created!.key },
      ip: actorCtx.ip,
      userAgent: actorCtx.userAgent,
    });
    await recordActivity(tx, {
      actorId: actorCtx.id,
      entityType: 'task',
      entityId: created!.id,
      action: 'create',
      diff: { key: created!.key, fromRequestId: id },
      ip: actorCtx.ip,
      userAgent: actorCtx.userAgent,
    });

    return created!;
  });
}

/** タスク詳細から「この要望から作られた」を出すために使う。 */
export async function findRequestByTaskId(taskId: string) {
  const rows = await db
    .select({ id: request.id, title: request.title })
    .from(request)
    .where(eq(request.convertedTaskId, taskId))
    .limit(1);
  return rows[0] ?? null;
}

async function loadRequest(tx: Transaction, id: string) {
  const rows = await tx.select().from(request).where(eq(request.id, id)).limit(1);
  const found = rows[0];
  if (!found) throw new NotFoundError('要望が見つかりません', 'REQUEST_NOT_FOUND');
  return found;
}
