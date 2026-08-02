import { and, asc, desc, eq, inArray, isNull, ne, sql, type SQL } from 'drizzle-orm';

import { db, type Transaction } from '@/db/client';
import { actor, feature, product, task } from '@/db/schema';
import type { TaskPriority, TaskStatus } from '@/db/schema/enums';
import { buildDiff, recordActivities, recordActivity } from '@/domain/activity/recorder';
import { notify } from '@/domain/notification/service';
import { assertCan, can } from '@/lib/auth/rbac';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { POSITION_STEP, needsRebalance, positionBetween, rebalancedPositions } from '@/lib/position';
import type { ActorContext } from '@/domain/actor-context';

import { applyStatusChange } from './status';

/**
 * タスク（F-03）とかんばん（F-04）。
 *
 * 全ての書き込みは activity と同一トランザクションで記録する（CLAUDE.md 絶対ルール §3）。
 */

export type TaskListItem = {
  id: string;
  key: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  position: number;
  productId: string;
  productKey: string;
  productName: string;
  featureId: string | null;
  featureName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  parentTaskId: string | null;
  startDate: string | null;
  dueDate: string | null;
  completedAt: Date | null;
};

export type TaskFilter = {
  productId?: string;
  status?: TaskStatus[];
  assigneeId?: string;
  featureId?: string | null;
};

function filterConditions(filter: TaskFilter): SQL[] {
  const conditions: SQL[] = [];
  if (filter.productId) conditions.push(eq(task.productId, filter.productId));
  if (filter.status && filter.status.length > 0) conditions.push(inArray(task.status, filter.status));
  if (filter.assigneeId) conditions.push(eq(task.assigneeId, filter.assigneeId));
  // featureId: undefined = 絞らない / null = 開発項目なしのみ / 文字列 = その開発項目
  if (filter.featureId === null) conditions.push(isNull(task.featureId));
  else if (typeof filter.featureId === 'string') conditions.push(eq(task.featureId, filter.featureId));
  return conditions;
}

const LIST_COLUMNS = {
  id: task.id,
  key: task.key,
  title: task.title,
  status: task.status,
  priority: task.priority,
  position: task.position,
  productId: task.productId,
  productKey: product.key,
  /** 画面に出すのは記号ではなく名前。記号は内部の識別子 */
  productName: product.name,
  featureId: task.featureId,
  featureName: feature.name,
  assigneeId: task.assigneeId,
  assigneeName: actor.name,
  parentTaskId: task.parentTaskId,
  startDate: task.startDate,
  dueDate: task.dueDate,
  completedAt: task.completedAt,
};

export async function listTasks(filter: TaskFilter): Promise<TaskListItem[]> {
  const conditions = filterConditions(filter);

  return db
    .select(LIST_COLUMNS)
    .from(task)
    .innerJoin(product, eq(product.id, task.productId))
    .leftJoin(feature, eq(feature.id, task.featureId))
    .leftJoin(actor, eq(actor.id, task.assigneeId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(task.position), asc(task.createdAt));
}

export type TaskDetail = TaskListItem & {
  bodyMd: string | null;
  reporterId: string;
  reporterName: string;
  estimateMinutes: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function getTaskByKey(key: string): Promise<TaskDetail> {
  const rows = await db
    .select({
      ...LIST_COLUMNS,
      bodyMd: task.bodyMd,
      reporterId: task.reporterId,
      estimateMinutes: task.estimateMinutes,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    })
    .from(task)
    .innerJoin(product, eq(product.id, task.productId))
    .leftJoin(feature, eq(feature.id, task.featureId))
    .leftJoin(actor, eq(actor.id, task.assigneeId))
    .where(eq(task.key, key))
    .limit(1);

  const found = rows[0];
  if (!found) throw new NotFoundError('タスクが見つかりません', 'TASK_NOT_FOUND');

  // 起票者は担当者と同じ actor テーブルを引くため、別名を用意せず別クエリにしている
  const reporterRows = await db
    .select({ name: actor.name })
    .from(actor)
    .where(eq(actor.id, found.reporterId))
    .limit(1);

  return { ...found, reporterName: reporterRows[0]?.name ?? '不明' };
}

export type CreateTaskInput = {
  productId: string;
  featureId: string | null;
  parentTaskId: string | null;
  title: string;
  bodyMd: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  estimateMinutes: number | null;
  startDate: string | null;
  dueDate: string | null;
};

function assertDateOrder(startDate: string | null, dueDate: string | null): void {
  // DB の CHECK 制約と同じ条件。DB任せにすると 500 になるため入口で 400 にする
  if (startDate && dueDate && startDate > dueDate) {
    throw new ValidationError('開始日は期限日より後にできません', {
      fields: { startDate: ['開始日は期限日より後にできません'] },
    });
  }
}

/**
 * タスクキーを採番する。
 *
 * `UPDATE ... RETURNING` で task_seq をインクリメントする。行ロックがかかるため、
 * 同一プロダクトへの同時作成でもキーは重複しない（受入基準 5.3）。
 */
async function nextTaskKey(tx: Transaction, productId: string): Promise<string> {
  const rows = await tx
    .update(product)
    .set({ taskSeq: sql`${product.taskSeq} + 1` })
    .where(eq(product.id, productId))
    .returning({ key: product.key, seq: product.taskSeq });

  const row = rows[0];
  if (!row) throw new NotFoundError('プロダクトが見つかりません', 'PRODUCT_NOT_FOUND');
  return `${row.key}-${row.seq}`;
}

export async function createTask(actorCtx: ActorContext, input: CreateTaskInput) {
  assertCan(actorCtx, 'task.create');
  assertDateOrder(input.startDate, input.dueDate);

  return db.transaction(async (tx) => {
    if (input.featureId) {
      await assertFeatureBelongsToProduct(tx, input.featureId, input.productId);
    }
    if (input.parentTaskId) {
      await assertTaskExists(tx, input.parentTaskId);
    }

    const key = await nextTaskKey(tx, input.productId);
    const status = applyStatusChange({ status: 'backlog', completedAt: null }, input.status);

    // 同一ステータス列の末尾に置く。既存カードの position は動かさない
    const [last] = await tx
      .select({ position: task.position })
      .from(task)
      .where(and(eq(task.productId, input.productId), eq(task.status, input.status)))
      .orderBy(desc(task.position))
      .limit(1);

    const [created] = await tx
      .insert(task)
      .values({
        productId: input.productId,
        featureId: input.featureId,
        parentTaskId: input.parentTaskId,
        key,
        title: input.title,
        bodyMd: input.bodyMd,
        status: status.status,
        priority: input.priority,
        assigneeId: input.assigneeId,
        reporterId: actorCtx.id,
        estimateMinutes: input.estimateMinutes,
        startDate: input.startDate,
        dueDate: input.dueDate,
        position: last ? last.position + POSITION_STEP : POSITION_STEP,
        completedAt: status.completedAt,
      })
      .returning();

    await recordActivity(tx, {
      actorId: actorCtx.id,
      entityType: 'task',
      entityId: created!.id,
      action: 'create',
      diff: { key, title: input.title, status: status.status },
      ip: actorCtx.ip,
      userAgent: actorCtx.userAgent,
    });

    return created!;
  });
}

export type UpdateTaskInput = Partial<{
  title: string;
  bodyMd: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  featureId: string | null;
  estimateMinutes: number | null;
  startDate: string | null;
  dueDate: string | null;
}>;

export async function updateTask(actorCtx: ActorContext, id: string, input: UpdateTaskInput) {
  return db.transaction(async (tx) => {
    const before = await loadTask(tx, id);

    // agent は自分に割当済のタスクだけ更新できる。判定に担当者が要るため取得後に権限を見る
    if (!can(actorCtx, 'task.update', { assigneeId: before.assigneeId })) {
      throw new ForbiddenError();
    }

    const startDate = input.startDate !== undefined ? input.startDate : before.startDate;
    const dueDate = input.dueDate !== undefined ? input.dueDate : before.dueDate;
    assertDateOrder(startDate, dueDate);

    if (input.featureId) {
      await assertFeatureBelongsToProduct(tx, input.featureId, before.productId);
    }

    const statusChanged = input.status !== undefined && input.status !== before.status;
    const statusResult = statusChanged
      ? applyStatusChange({ status: before.status, completedAt: before.completedAt }, input.status!)
      : null;

    const patch = {
      ...input,
      ...(statusResult
        ? { status: statusResult.status, completedAt: statusResult.completedAt }
        : {}),
      updatedAt: new Date(),
    };

    const diff = buildDiff(before, patch);
    delete diff.updatedAt;
    if (Object.keys(diff).length === 0) return before;

    const [updated] = await tx.update(task).set(patch).where(eq(task.id, id)).returning();

    // ステータス変更は変更履歴としてもヒートマップとしても別扱いにする（重みが異なる）
    const entries = [];
    if (statusResult) {
      entries.push({
        actorId: actorCtx.id,
        entityType: 'task' as const,
        entityId: id,
        action: (statusResult.status === 'done' ? 'complete' : 'status_change') as
          | 'complete'
          | 'status_change',
        diff: { status: { before: before.status, after: statusResult.status } },
        ip: actorCtx.ip,
        userAgent: actorCtx.userAgent,
      });
    }

    const nonStatusDiff = { ...diff };
    delete nonStatusDiff.status;
    delete nonStatusDiff.completedAt;
    if (Object.keys(nonStatusDiff).length > 0) {
      entries.push({
        actorId: actorCtx.id,
        entityType: 'task' as const,
        entityId: id,
        action: 'update' as const,
        diff: nonStatusDiff,
        ip: actorCtx.ip,
        userAgent: actorCtx.userAgent,
      });
    }

    await recordActivities(tx, entries);

    /*
     * **通知は同じトランザクションで積む。** アプリ内はその場で書き、
     * 外（メール・Discord）はキューに入れるだけなので、外部の失敗で業務が巻き戻らない。
     * 自分の操作で自分に通知はしない。
     */
    if (input.assigneeId !== undefined && input.assigneeId && input.assigneeId !== before.assigneeId) {
      await notify(tx, {
        event: 'task.assigned',
        actorId: input.assigneeId,
        exceptActorId: actorCtx.id,
        title: 'タスクが割り当てられました',
        body: updated!.title,
        url: `/tasks/${updated!.key}`,
        targetType: 'task',
        targetId: id,
      });
    }

    if (statusResult?.status === 'done' && before.reporterId) {
      await notify(tx, {
        event: 'task.completed',
        actorId: before.reporterId,
        exceptActorId: actorCtx.id,
        title: 'タスクが完了しました',
        body: updated!.title,
        url: `/tasks/${updated!.key}`,
        targetType: 'task',
        targetId: id,
      });
    }

    return updated!;
  });
}

export async function deleteTask(actorCtx: ActorContext, id: string): Promise<void> {
  assertCan(actorCtx, 'task.delete');

  await db.transaction(async (tx) => {
    const before = await loadTask(tx, id);

    await recordActivity(tx, {
      actorId: actorCtx.id,
      entityType: 'task',
      entityId: id,
      action: 'delete',
      diff: { key: before.key, title: before.title },
      ip: actorCtx.ip,
      userAgent: actorCtx.userAgent,
    });

    await tx.delete(task).where(eq(task.id, id));
  });
}

/**
 * かんばんのドラッグ&ドロップ（F-04）。status と position を同時に更新する。
 *
 * 前後の中間値を取るため、他のカードの position は UPDATE されない（受入基準 5.4）。
 * 精度が枯渇した場合のみ、その列だけ STEP 間隔に振り直す（技術仕様書 §7.2）。
 */
export async function moveTask(
  actorCtx: ActorContext,
  id: string,
  target: { status: TaskStatus; afterId: string | null },
) {
  return db.transaction(async (tx) => {
    const before = await loadTask(tx, id);

    if (!can(actorCtx, 'task.update', { assigneeId: before.assigneeId })) {
      throw new ForbiddenError();
    }

    const column = await tx
      .select({ id: task.id, position: task.position })
      .from(task)
      .where(
        and(eq(task.productId, before.productId), eq(task.status, target.status), ne(task.id, id)),
      )
      .orderBy(asc(task.position));

    const afterIndex = target.afterId === null ? -1 : column.findIndex((t) => t.id === target.afterId);
    if (target.afterId !== null && afterIndex === -1) {
      throw new NotFoundError('移動先のタスクが見つかりません', 'TASK_NOT_FOUND');
    }

    const prev = afterIndex >= 0 ? column[afterIndex]!.position : null;
    const next = column[afterIndex + 1]?.position ?? null;
    let position = positionBetween(prev, next);

    // 隣接値の差が枯渇したら、この列だけ振り直す。放置すると並び順が壊れた状態で操作されてしまう
    const projected = [...column.map((t) => t.position)];
    projected.splice(afterIndex + 1, 0, position);
    if (needsRebalance(projected)) {
      const fresh = rebalancedPositions(projected.length);
      const ids = [...column.map((t) => t.id)];
      ids.splice(afterIndex + 1, 0, id);
      for (let i = 0; i < ids.length; i += 1) {
        await tx.update(task).set({ position: fresh[i]! }).where(eq(task.id, ids[i]!));
      }
      position = fresh[afterIndex + 1]!;
    }

    const statusChanged = target.status !== before.status;
    const statusResult = applyStatusChange(
      { status: before.status, completedAt: before.completedAt },
      target.status,
    );

    const [updated] = await tx
      .update(task)
      .set({
        status: statusResult.status,
        completedAt: statusResult.completedAt,
        position,
        updatedAt: new Date(),
      })
      .where(eq(task.id, id))
      .returning();

    if (statusChanged) {
      await recordActivity(tx, {
        actorId: actorCtx.id,
        entityType: 'task',
        entityId: id,
        action: statusResult.status === 'done' ? 'complete' : 'status_change',
        diff: { status: { before: before.status, after: statusResult.status } },
        ip: actorCtx.ip,
        userAgent: actorCtx.userAgent,
      });
    }
    // 同一列内の並べ替えだけなら activity に残さない。
    // 履歴・ヒートマップのどちらにとっても意味のある変化ではなく、記録するとノイズになる。

    return updated!;
  });
}

async function loadTask(tx: Transaction, id: string) {
  const rows = await tx.select().from(task).where(eq(task.id, id)).limit(1);
  const found = rows[0];
  if (!found) throw new NotFoundError('タスクが見つかりません', 'TASK_NOT_FOUND');
  return found;
}

async function assertTaskExists(tx: Transaction, id: string): Promise<void> {
  const rows = await tx.select({ id: task.id }).from(task).where(eq(task.id, id)).limit(1);
  if (rows.length === 0) {
    throw new NotFoundError('親タスクが見つかりません', 'TASK_NOT_FOUND');
  }
}

/** 別プロダクトの開発項目を付け替えられないようにする。 */
async function assertFeatureBelongsToProduct(
  tx: Transaction,
  featureId: string,
  productId: string,
): Promise<void> {
  const rows = await tx
    .select({ productId: feature.productId })
    .from(feature)
    .where(eq(feature.id, featureId))
    .limit(1);

  const found = rows[0];
  if (!found) throw new NotFoundError('開発項目が見つかりません', 'FEATURE_NOT_FOUND');
  if (found.productId !== productId) {
    throw new ConflictError(
      '別のプロダクトの開発項目は指定できません',
      null,
      'FEATURE_PRODUCT_MISMATCH',
    );
  }
}
