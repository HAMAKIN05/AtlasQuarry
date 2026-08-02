import { eq, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { activity, actor, appSetting } from '@/db/schema';

import type { ActivityItem } from './queries';

/**
 * 直近の活動リズム（F-16）。
 *
 * **GitHub の年間グリッドは作らない。** 3人・スマホ中心の道具で、1年分の草を見ても
 * 次の行動が変わらない。見て意味があるのは「ここ2週間、手が動いていたか」なので、
 * **直近14日**に絞る。横スクロールも要らなくなる。
 *
 * **データ源は `activity` だけ。** `work_log`（F-17）を混ぜない。混ぜると
 * 「実績を入力した日」が濃くなり、実際に手を動かした日と食い違う。
 *
 * **重みは記録時点の値をそのまま合計する**（`activity.weight`）。後から重み表を
 * 変えても過去が揺れないように、記録側が保存済み。
 */

const THRESHOLDS_SETTING_KEY = 'heatmap.thresholds';
const FALLBACK_THRESHOLDS = [1, 5, 12, 25];

/** 日付の境界は日本時間で切る。UTC で切ると、夜の作業が翌日に付く。 */
const TZ = 'Asia/Tokyo';

export const RHYTHM_DAYS = 14;

export type RhythmDay = {
  /** `YYYY-MM-DD`（日本時間） */
  date: string;
  score: number;
  /** 0〜4。0 は活動なし */
  level: number;
};

async function thresholds(): Promise<number[]> {
  const rows = await db
    .select({ value: appSetting.valueJson })
    .from(appSetting)
    .where(eq(appSetting.key, THRESHOLDS_SETTING_KEY))
    .limit(1);

  const value = rows[0]?.value;
  if (!Array.isArray(value) || value.length !== 4 || value.some((v) => typeof v !== 'number')) {
    return FALLBACK_THRESHOLDS;
  }
  return value as number[];
}

function levelOf(score: number, steps: number[]): number {
  if (score <= 0) return 0;
  return steps.filter((s) => score >= s).length;
}

/** 日本時間の「今日」から遡って `days` 日ぶんの日付を並べる（古い順）。 */
function recentDates(days: number): string[] {
  const todayJst = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  const base = Date.parse(`${todayJst}T00:00:00Z`);

  return Array.from({ length: days }, (_, i) =>
    new Date(base - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  );
}

/**
 * 直近14日の活動量。**活動が無かった日も 0 で返す**――
 * 抜けた日を詰めると、間が空いたことが見えなくなる。
 */
export async function activityRhythm(actorId?: string | null): Promise<RhythmDay[]> {
  const dates = recentDates(RHYTHM_DAYS);
  const steps = await thresholds();
  const from = `${dates[0]!}T00:00:00+09:00`;

  const rows = await db.execute(sql`
    select (a.created_at at time zone ${TZ})::date::text as day,
           sum(a.weight)::int as score
      from activity a
     where a.created_at >= ${from}::timestamptz
       ${actorId ? sql`and a.actor_id = ${actorId}` : sql``}
     group by 1
  `);

  const list = (rows as unknown as { rows: Array<{ day: string; score: number }> }).rows ?? [];
  const byDay = new Map(list.map((r) => [r.day, Number(r.score)]));

  return dates.map((date) => {
    const score = byDay.get(date) ?? 0;
    return { date, score, level: levelOf(score, steps) };
  });
}

/** その日1日ぶんの活動（グリッドを叩いたときの中身）。 */
export async function activityOnDay(date: string, actorId?: string | null): Promise<ActivityItem[]> {
  const rows = await db.execute(sql`
    select a.id, a.actor_id, ac.name as actor_name, a.entity_type, a.entity_id,
           a.action, a.diff_json, a.weight, a.created_at
      from activity a
      join actor ac on ac.id = a.actor_id
     where (a.created_at at time zone ${TZ})::date = ${date}::date
       ${actorId ? sql`and a.actor_id = ${actorId}` : sql``}
     order by a.created_at desc
     limit 200
  `);

  const list = (rows as unknown as { rows: Array<Record<string, unknown>> }).rows ?? [];

  return list.map((row) => ({
    id: row.id as string,
    actorId: row.actor_id as string,
    actorName: row.actor_name as string,
    entityType: row.entity_type as ActivityItem['entityType'],
    entityId: row.entity_id as string,
    action: row.action as ActivityItem['action'],
    diffJson: (row.diff_json as Record<string, unknown> | null) ?? null,
    weight: Number(row.weight),
    createdAt: new Date(row.created_at as string),
  }));
}

/** 絞り込みに出す人の一覧。AI も1人として並べる。 */
export async function activeActors(): Promise<Array<{ id: string; name: string; type: string }>> {
  return db
    .select({ id: actor.id, name: actor.name, type: actor.type })
    .from(actor)
    .where(eq(actor.isActive, true))
    .orderBy(actor.name);
}

/** 使っていない import を残さないための再輸出（画面側が activity の型を要る）。 */
export type { ActivityItem };
