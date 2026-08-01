import { and, asc, eq, isNull, max, min, sql } from 'drizzle-orm';

import { db, type Transaction } from '@/db/client';
import { feature, product, task } from '@/db/schema';
import type { FeatureStatus, ProductStatus } from '@/db/schema/enums';
import { recordActivity, buildDiff } from '@/domain/activity/recorder';
import { assertCan } from '@/lib/auth/rbac';
import { ConflictError, NotFoundError } from '@/lib/errors';
import { POSITION_STEP, positionBetween } from '@/lib/position';
import type { ActorContext } from '@/domain/actor-context';

/**
 * プロダクト・開発項目（F-02）。
 *
 * 画面表示名は「開発項目」。DB上の英語名（feature）を画面に出さない（CLAUDE.md UI規約）。
 * 全ての書き込みは activity と同一トランザクションで記録する。
 */

/** 開発項目の進捗と日付。原則タスクから導出する（機能定義書 §6.3）。 */
export type FeatureProgress = {
  totalTasks: number;
  doneTasks: number;
  /** 0〜1。タスク0件なら 0（ゼロ除算にしない）。 */
  ratio: number;
  /** feature 側に値があればそちらが優先。無ければ配下タスクの MIN / MAX。 */
  startDate: string | null;
  dueDate: string | null;
};

export type FeatureWithProgress = {
  id: string;
  productId: string;
  name: string;
  description: string | null;
  status: FeatureStatus;
  position: number;
  progress: FeatureProgress;
};

export type ProductSummary = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: ProductStatus;
  ownerId: string;
  progress: { totalTasks: number; doneTasks: number; ratio: number };
  /** 未完了タスクのうち最も近い期限。無ければ null。 */
  nextDueDate: string | null;
};

function ratioOf(done: number, total: number): number {
  // タスク0件の開発項目で進捗率がエラーにならないこと（受入基準 5.2）
  return total === 0 ? 0 : done / total;
}

export async function listProducts(): Promise<ProductSummary[]> {
  const rows = await db
    .select({
      id: product.id,
      key: product.key,
      name: product.name,
      description: product.description,
      status: product.status,
      ownerId: product.ownerId,
      totalTasks: sql<number>`count(${task.id})::int`,
      doneTasks: sql<number>`count(*) filter (where ${task.status} = 'done')::int`,
      nextDueDate: sql<string | null>`min(${task.dueDate}) filter (where ${task.status} not in ('done','cancelled'))`,
    })
    .from(product)
    .leftJoin(task, eq(task.productId, product.id))
    .groupBy(product.id)
    .orderBy(asc(product.key));

  return rows.map(({ totalTasks, doneTasks, nextDueDate, ...rest }) => ({
    ...rest,
    progress: { totalTasks, doneTasks, ratio: ratioOf(doneTasks, totalTasks) },
    nextDueDate,
  }));
}

export async function getProductById(id: string) {
  const rows = await db.select().from(product).where(eq(product.id, id)).limit(1);
  const found = rows[0];
  if (!found) throw new NotFoundError('プロダクトが見つかりません', 'PRODUCT_NOT_FOUND');
  return found;
}

export type CreateProductInput = {
  key: string;
  name: string;
  description: string | null;
  ownerId: string;
};

export async function createProduct(actor: ActorContext, input: CreateProductInput) {
  assertCan(actor, 'product.create');

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: product.id })
      .from(product)
      .where(eq(product.key, input.key))
      .limit(1);
    if (existing.length > 0) {
      throw new ConflictError('そのキーは既に使われています', null, 'PRODUCT_KEY_TAKEN');
    }

    const [created] = await tx
      .insert(product)
      .values({
        key: input.key,
        name: input.name,
        description: input.description,
        ownerId: input.ownerId,
      })
      .returning();

    await recordActivity(tx, {
      actorId: actor.id,
      entityType: 'product',
      entityId: created!.id,
      action: 'create',
      diff: { key: input.key, name: input.name },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return created!;
  });
}

export type UpdateProductInput = Partial<{
  name: string;
  description: string | null;
  status: ProductStatus;
  ownerId: string;
}>;

export async function updateProduct(
  actor: ActorContext,
  id: string,
  input: UpdateProductInput,
) {
  assertCan(actor, 'product.update');

  return db.transaction(async (tx) => {
    const before = await loadProduct(tx, id);
    const diff = buildDiff(before, input);
    if (Object.keys(diff).length === 0) return before;

    const [updated] = await tx
      .update(product)
      .set(input)
      .where(eq(product.id, id))
      .returning();

    await recordActivity(tx, {
      actorId: actor.id,
      entityType: 'product',
      entityId: id,
      action: 'update',
      diff,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return updated!;
  });
}

export async function deleteProduct(actor: ActorContext, id: string): Promise<void> {
  assertCan(actor, 'product.delete');

  await db.transaction(async (tx) => {
    const before = await loadProduct(tx, id);

    // activity は物理削除しない。削除の事実を先に記録してから本体を消す
    await recordActivity(tx, {
      actorId: actor.id,
      entityType: 'product',
      entityId: id,
      action: 'delete',
      diff: { key: before.key, name: before.name },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    await tx.delete(product).where(eq(product.id, id));
  });
}

async function loadProduct(tx: Transaction, id: string) {
  const rows = await tx.select().from(product).where(eq(product.id, id)).limit(1);
  const found = rows[0];
  if (!found) throw new NotFoundError('プロダクトが見つかりません', 'PRODUCT_NOT_FOUND');
  return found;
}

/**
 * 開発項目一覧。進捗と日付はタスクから導出する。
 *
 * feature 側に日付が入っていればそちらを優先する（まだタスクを切っていない予定段階のため）。
 */
export async function listFeatures(productId: string): Promise<FeatureWithProgress[]> {
  const rows = await db
    .select({
      id: feature.id,
      productId: feature.productId,
      name: feature.name,
      description: feature.description,
      status: feature.status,
      position: feature.position,
      startDate: feature.startDate,
      dueDate: feature.dueDate,
      totalTasks: sql<number>`count(${task.id})::int`,
      doneTasks: sql<number>`count(*) filter (where ${task.status} = 'done')::int`,
      derivedStart: min(task.startDate),
      derivedDue: max(task.dueDate),
    })
    .from(feature)
    .leftJoin(task, eq(task.featureId, feature.id))
    .where(eq(feature.productId, productId))
    .groupBy(feature.id)
    .orderBy(asc(feature.position));

  return rows.map((row) => ({
    id: row.id,
    productId: row.productId,
    name: row.name,
    description: row.description,
    status: row.status,
    position: row.position,
    progress: {
      totalTasks: row.totalTasks,
      doneTasks: row.doneTasks,
      ratio: ratioOf(row.doneTasks, row.totalTasks),
      startDate: row.startDate ?? row.derivedStart ?? null,
      dueDate: row.dueDate ?? row.derivedDue ?? null,
    },
  }));
}

export type CreateFeatureInput = {
  productId: string;
  name: string;
  description: string | null;
  startDate: string | null;
  dueDate: string | null;
};

export async function createFeature(actor: ActorContext, input: CreateFeatureInput) {
  assertCan(actor, 'feature.create');

  return db.transaction(async (tx) => {
    // 末尾に追加する。既存行の position は動かさない
    const [last] = await tx
      .select({ position: feature.position })
      .from(feature)
      .where(eq(feature.productId, input.productId))
      .orderBy(sql`${feature.position} desc`)
      .limit(1);

    const [created] = await tx
      .insert(feature)
      .values({
        productId: input.productId,
        name: input.name,
        description: input.description,
        startDate: input.startDate,
        dueDate: input.dueDate,
        position: last ? last.position + POSITION_STEP : POSITION_STEP,
      })
      .returning();

    await recordActivity(tx, {
      actorId: actor.id,
      entityType: 'feature',
      entityId: created!.id,
      action: 'create',
      diff: { name: input.name, productId: input.productId },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return created!;
  });
}

export type UpdateFeatureInput = Partial<{
  name: string;
  description: string | null;
  status: FeatureStatus;
  startDate: string | null;
  dueDate: string | null;
}>;

export async function updateFeature(actor: ActorContext, id: string, input: UpdateFeatureInput) {
  assertCan(actor, 'feature.update');

  return db.transaction(async (tx) => {
    const before = await loadFeature(tx, id);
    const diff = buildDiff(before, input);
    if (Object.keys(diff).length === 0) return before;

    const [updated] = await tx.update(feature).set(input).where(eq(feature.id, id)).returning();

    await recordActivity(tx, {
      actorId: actor.id,
      entityType: 'feature',
      entityId: id,
      action: 'update',
      diff,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return updated!;
  });
}

export async function deleteFeature(actor: ActorContext, id: string): Promise<void> {
  assertCan(actor, 'feature.delete');

  await db.transaction(async (tx) => {
    const before = await loadFeature(tx, id);

    await recordActivity(tx, {
      actorId: actor.id,
      entityType: 'feature',
      entityId: id,
      action: 'delete',
      diff: { name: before.name },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    await tx.delete(feature).where(eq(feature.id, id));
  });
}

/**
 * 並び替え。前後の中間値を取るため、他行の position は UPDATE しない（技術仕様書 §7）。
 *
 * `afterId` は移動先の直前に来る開発項目。先頭へ移すときは null。
 */
export async function moveFeature(
  actor: ActorContext,
  id: string,
  afterId: string | null,
): Promise<void> {
  assertCan(actor, 'feature.update');

  await db.transaction(async (tx) => {
    const target = await loadFeature(tx, id);

    const siblings = await tx
      .select({ id: feature.id, position: feature.position })
      .from(feature)
      .where(and(eq(feature.productId, target.productId), sql`${feature.id} <> ${id}`))
      .orderBy(asc(feature.position));

    const afterIndex = afterId === null ? -1 : siblings.findIndex((s) => s.id === afterId);
    if (afterId !== null && afterIndex === -1) {
      throw new NotFoundError('移動先の開発項目が見つかりません', 'FEATURE_NOT_FOUND');
    }

    const prev = afterIndex >= 0 ? siblings[afterIndex]!.position : null;
    const next = siblings[afterIndex + 1]?.position ?? null;

    await tx
      .update(feature)
      .set({ position: positionBetween(prev, next) })
      .where(eq(feature.id, id));
  });
}

async function loadFeature(tx: Transaction, id: string) {
  const rows = await tx.select().from(feature).where(eq(feature.id, id)).limit(1);
  const found = rows[0];
  if (!found) throw new NotFoundError('開発項目が見つかりません', 'FEATURE_NOT_FOUND');
  return found;
}

/** 開発項目に紐づかないタスクがあるかの判定に使う（S-04 の「その他」表示用）。 */
export async function countUnassignedTasks(productId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(task)
    .where(and(eq(task.productId, productId), isNull(task.featureId)));
  return rows[0]?.count ?? 0;
}
