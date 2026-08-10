import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { activity, actor, document as documentTable, product, request, task } from '@/db/schema';
import type { ActivityAction, EntityType } from '@/db/schema/enums';

/**
 * activity の閲覧（F-20 の画面は v1.0 だが、タスク詳細のタイムライン S-06 は v0.1 で必要）。
 *
 * **読み取り専用。** activity への UPDATE / DELETE は書かない（DB設計書 §3.6）。
 */

export type ActivityItem = {
  id: string;
  actorId: string;
  actorName: string;
  entityType: EntityType;
  entityId: string;
  action: ActivityAction;
  diffJson: Record<string, unknown> | null;
  weight: number;
  createdAt: Date;
  targetTitle?: string | null;
};

const COLUMNS = {
  id: activity.id,
  actorId: activity.actorId,
  actorName: actor.name,
  entityType: activity.entityType,
  entityId: activity.entityId,
  action: activity.action,
  diffJson: activity.diffJson,
  weight: activity.weight,
  createdAt: activity.createdAt,
};

/** タスク詳細のタイムライン（S-06）。古い順に並べる。 */
export async function listTaskTimeline(taskId: string): Promise<ActivityItem[]> {
  const rows = await db
    .select({ ...COLUMNS, targetTitle: sql<string | null>`coalesce(${task.title}, ${documentTable.title}, ${request.title}, ${product.name})` })
    .from(activity)
    .innerJoin(actor, eq(actor.id, activity.actorId))
    .leftJoin(task, and(eq(activity.entityType, 'task'), eq(task.id, activity.entityId)))
    .leftJoin(documentTable, and(eq(activity.entityType, 'document'), eq(documentTable.id, activity.entityId)))
    .leftJoin(request, and(eq(activity.entityType, 'request'), eq(request.id, activity.entityId)))
    .leftJoin(product, and(eq(activity.entityType, 'product'), eq(product.id, activity.entityId)))
    .where(and(eq(activity.entityType, 'task'), eq(activity.entityId, taskId)))
    .orderBy(activity.createdAt);

  return rows;
}

/** 直近のアクティビティ（S-02 ダッシュボード）。 */
export async function listRecentActivity(
  limit: number,
  offset: number,
): Promise<{ items: ActivityItem[]; total: number }> {
  const items = await db
    .select(COLUMNS)
    .from(activity)
    .innerJoin(actor, eq(actor.id, activity.actorId))
    .orderBy(desc(activity.createdAt))
    .limit(limit)
    .offset(offset);

  const totals = await db.select({ count: sql<number>`count(*)::int` }).from(activity);

  return { items, total: totals[0]?.count ?? 0 };
}
