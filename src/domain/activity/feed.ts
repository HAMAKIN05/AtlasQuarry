import { sql } from 'drizzle-orm';

import { db } from '@/db/client';
import type { ActivityAction, EntityType } from '@/db/schema/enums';

/**
 * 活動の一覧（F-20）。
 *
 * **役割で隠さない。** 3人しかいない組織で、誰が何をしたかを見せない理由がない。
 * 隠すと「誰かが何かを変えたが分からない」という状態が生まれ、確認の手間が増える。
 *
 * **1行で読み切れるようにする。** `entity_type` や `action` の英語を出さず、
 * 「◯◯さんが『予約画面』を完了にした」の形に組み立ててから返す。
 *
 * **対象の名前は JOIN で引く。** `diff_json` に題名を入れて回すと、
 * 題名を変えたときに履歴の表記が食い違う。
 */

export type FeedItem = {
  id: string;
  actorName: string;
  entityType: EntityType;
  entityId: string;
  action: ActivityAction;
  /** 対象の名前（消えていれば null） */
  targetTitle: string | null;
  /** 対象へのリンク（辿れなければ null） */
  href: string | null;
  diffJson: Record<string, unknown> | null;
  createdAt: Date;
};

export const FEED_RANGES = [
  { key: 'today', label: '今日', days: 1 },
  { key: 'week', label: '7日', days: 7 },
  { key: 'month', label: '30日', days: 30 },
] as const;

export type FeedRange = (typeof FEED_RANGES)[number]['key'];

export const FEED_TARGETS = [
  { key: 'all', label: 'すべて', types: null },
  { key: 'task', label: 'タスク', types: ['task'] },
  { key: 'document', label: '資料', types: ['document'] },
  { key: 'request', label: '要望', types: ['request'] },
] as const;

export type FeedTarget = (typeof FEED_TARGETS)[number]['key'];

const ACTION_LABELS: Record<ActivityAction, string> = {
  create: '作成',
  update: '更新',
  delete: '削除',
  status_change: '状態を変更',
  comment: 'コメント',
  triage: '判断',
  complete: '完了',
};

const ENTITY_LABELS: Record<EntityType, string> = {
  task: 'タスク',
  product: 'プロジェクト',
  feature: 'まとまり',
  request: '要望',
  document: '資料',
  comment: 'コメント',
  actor: 'メンバー',
};

/** 「◯◯さんが『△△』を完了にした」の文を組み立てる。 */
export function describeFeedItem(item: FeedItem): string {
  const what = item.targetTitle ? `「${item.targetTitle}」` : ENTITY_LABELS[item.entityType];
  const verb = ACTION_LABELS[item.action] ?? item.action;

  if (item.action === 'status_change') return `${what}の状態を変えた`;
  if (item.action === 'comment') return `${what}にコメントした`;
  if (item.action === 'complete') return `${what}を完了にした`;
  if (item.action === 'create') return `${what}を作った`;
  if (item.action === 'delete') return `${what}を消した`;
  if (item.action === 'update') return `${what}を直した`;
  if (item.action === 'triage') return `${what}を判断した`;
  return `${what}を${verb}`;
}

/** 日本時間の日付境界。UTC で切ると夜の作業が翌日に付く。 */
const TZ = 'Asia/Tokyo';

export async function listFeed(options: {
  range: FeedRange;
  target: FeedTarget;
  /** 特定の日だけ見る（ヒートマップの1日を叩いたとき）。`range` より優先する */
  day?: string | null;
  limit?: number;
}): Promise<FeedItem[]> {
  const days = FEED_RANGES.find((r) => r.key === options.range)?.days ?? 7;
  const types = FEED_TARGETS.find((t) => t.key === options.target)?.types ?? null;
  const limit = options.limit ?? 100;

  const period = options.day
    ? sql`(a.created_at at time zone ${TZ})::date = ${options.day}::date`
    : sql`(a.created_at at time zone ${TZ})::date > (now() at time zone ${TZ})::date - ${days}::int`;

  const rows = await db.execute(sql`
    select a.id, ac.name as actor_name, a.entity_type, a.entity_id, a.action,
           a.diff_json, a.created_at,
           coalesce(t.title, d.title, r.title, p.name) as target_title,
           t.key as task_key
      from activity a
      join actor ac on ac.id = a.actor_id
      left join task t     on a.entity_type = 'task'     and t.id = a.entity_id
      left join document d on a.entity_type = 'document' and d.id = a.entity_id
      left join request r  on a.entity_type = 'request'  and r.id = a.entity_id
      left join product p  on a.entity_type = 'product'  and p.id = a.entity_id
     where ${period}
       ${types ? sql`and a.entity_type in (${sql.join(types.map((t) => sql`${t}`), sql`, `)})` : sql``}
     order by a.created_at desc
     limit ${limit}
  `);

  const list = (rows as unknown as { rows: Array<Record<string, unknown>> }).rows ?? [];

  return list.map((row) => {
    const entityType = row.entity_type as EntityType;
    const entityId = row.entity_id as string;
    const taskKey = row.task_key as string | null;

    return {
      id: row.id as string,
      actorName: row.actor_name as string,
      entityType,
      entityId,
      action: row.action as ActivityAction,
      targetTitle: (row.target_title as string | null) ?? null,
      href: linkTo(entityType, entityId, taskKey),
      diffJson: (row.diff_json as Record<string, unknown> | null) ?? null,
      createdAt: new Date(row.created_at as string),
    };
  });
}

/** 消えた対象へはリンクしない（`target_title` が null になっているもの）。 */
function linkTo(entityType: EntityType, entityId: string, taskKey: string | null): string | null {
  if (entityType === 'task') return taskKey ? `/tasks/${taskKey}` : null;
  if (entityType === 'document') return `/docs/${entityId}`;
  if (entityType === 'request') return `/requests/${entityId}`;
  if (entityType === 'product') return `/projects/${entityId}`;
  return null;
}
