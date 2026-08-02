import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import type { Transaction } from '@/db/client';
import { actor, agentSession, task, workLog } from '@/db/schema';
import type { WorklogSource } from '@/db/schema/enums';
import { recordActivity } from '@/domain/activity/recorder';
import type { ActorContext } from '@/domain/actor-context';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';

/**
 * 工数（F-17）。
 *
 * **人の実績と AI の実行時間を混ぜない。** AI は人間の10倍の速さで動くことがあり、
 * 同じ「分」として足すと、見積りとの比較が意味を失う。`source` で分け、
 * 差分の計算に入れるのは `manual` だけにする。
 *
 * **未入力を 0 分にも見積り値にもしない。** 入れ忘れを 0 として集計すると
 * 「早く終わった」ように見え、逆に見積り値で埋めると差分が常に 0 になる。
 * どちらも判断を誤らせるので、**「実績なし」の件数をそのまま出す。**
 *
 * **個人の査定には使わない。** 集計はプロジェクト単位で見せ、開発者には自分の分だけ返す。
 */

/** 完了時に選ばせる選択肢。**分単位の自由入力を最初に見せない**（面倒で入れなくなる）。 */
export const QUICK_MINUTES = [15, 30, 60, 120, 240, 480] as const;

export type WorkLogItem = {
  id: string;
  actorName: string;
  minutes: number;
  workDate: string;
  note: string | null;
  source: WorklogSource;
  createdAt: Date;
};

export async function listWorkLogs(taskId: string): Promise<WorkLogItem[]> {
  return db
    .select({
      id: workLog.id,
      actorName: actor.name,
      minutes: workLog.minutes,
      workDate: workLog.workDate,
      note: workLog.note,
      source: workLog.source,
      createdAt: workLog.createdAt,
    })
    .from(workLog)
    .innerJoin(actor, eq(actor.id, workLog.actorId))
    .where(eq(workLog.taskId, taskId))
    .orderBy(desc(workLog.workDate), desc(workLog.createdAt));
}

/** 日本時間の今日。UTC で切ると、夜の作業が翌日に付く。 */
function todayJst(): string {
  return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * 実績を1件足す。**自分のぶんだけ**（他人の工数を代わりに入れさせない）。
 *
 * 記録は `activity` に残さない。工数の入力自体は「作業した」ことではなく
 * 「作業を申告した」ことなので、活動リズム（F-16）の濃淡を動かすべきではない。
 */
export async function addWorkLog(
  actorCtx: ActorContext,
  input: { taskId: string; minutes: number; workDate?: string | null; note?: string | null },
): Promise<{ id: string }> {
  if (!Number.isInteger(input.minutes) || input.minutes <= 0 || input.minutes > 1440) {
    throw new ValidationError('作業時間は1〜1440分で入れてください', {
      fields: { minutes: ['1〜1440分で入れてください'] },
    });
  }

  const [found] = await db.select({ id: task.id }).from(task).where(eq(task.id, input.taskId)).limit(1);
  if (!found) throw new NotFoundError('タスクが見つかりません', 'TASK_NOT_FOUND');

  const [created] = await db
    .insert(workLog)
    .values({
      actorId: actorCtx.id,
      taskId: input.taskId,
      minutes: input.minutes,
      workDate: input.workDate ?? todayJst(),
      note: input.note?.trim() || null,
      source: 'manual',
    })
    .returning({ id: workLog.id });

  return { id: created!.id };
}

export async function deleteWorkLog(actorCtx: ActorContext, id: string): Promise<void> {
  const [found] = await db
    .select({ actorId: workLog.actorId })
    .from(workLog)
    .where(eq(workLog.id, id))
    .limit(1);

  if (!found) throw new NotFoundError('記録が見つかりません', 'WORKLOG_NOT_FOUND');
  // **自分の記録だけ消せる。** 他人の実績を消せると、集計の根拠が黙って変わる
  if (found.actorId !== actorCtx.id) throw new ForbiddenError('自分の記録だけ消せます');

  await db.delete(workLog).where(eq(workLog.id, id));
}

/* ------------------------------------------------------------------ *
 * AI の作業セッション（MCP から使う）
 * ------------------------------------------------------------------ */

/** 開いたままのセッションを閉じてから開く。**同時に2本開かせない。** */
export async function startAgentWork(
  agentId: string,
  taskId: string | null,
): Promise<{ sessionId: string }> {
  return db.transaction(async (tx) => {
    await closeOpenSessions(tx, agentId);

    const [created] = await tx
      .insert(agentSession)
      .values({ agentId, taskId })
      .returning({ id: agentSession.id });

    return { sessionId: created!.id };
  });
}

async function closeOpenSessions(tx: Transaction, agentId: string): Promise<void> {
  await tx
    .update(agentSession)
    .set({ endedAt: new Date() })
    .where(and(eq(agentSession.agentId, agentId), isNull(agentSession.endedAt)));
}

/**
 * セッションを閉じ、対応するタスクに `source='agent'` の実績を1件だけ作る。
 *
 * **二重終了で二重計上しない。** すでに閉じているセッションには何もしない。
 */
export async function endAgentWork(
  agentId: string,
  summary: string | null,
): Promise<{ minutes: number | null }> {
  return db.transaction(async (tx) => {
    const [open] = await tx
      .select({ id: agentSession.id, taskId: agentSession.taskId, startedAt: agentSession.startedAt })
      .from(agentSession)
      .where(and(eq(agentSession.agentId, agentId), isNull(agentSession.endedAt)))
      .orderBy(desc(agentSession.startedAt))
      .limit(1);

    if (!open) return { minutes: null };

    const endedAt = new Date();
    await tx
      .update(agentSession)
      .set({ endedAt, summary: summary?.slice(0, 2000) ?? null })
      .where(eq(agentSession.id, open.id));

    if (!open.taskId) return { minutes: null };

    // 1分未満は記録しない（work_log の CHECK が minutes > 0）
    const minutes = Math.round((endedAt.getTime() - open.startedAt.getTime()) / 60_000);
    if (minutes < 1) return { minutes: 0 };

    await tx.insert(workLog).values({
      actorId: agentId,
      taskId: open.taskId,
      minutes: Math.min(minutes, 1440),
      workDate: todayJst(),
      note: summary?.slice(0, 500) ?? null,
      source: 'agent',
    });

    return { minutes };
  });
}

/* ------------------------------------------------------------------ *
 * 集計
 * ------------------------------------------------------------------ */

export type EffortRow = {
  taskId: string;
  key: string;
  title: string;
  assigneeName: string | null;
  estimateMinutes: number | null;
  humanMinutes: number;
  agentMinutes: number;
};

export type EffortSummary = {
  rows: EffortRow[];
  /** 見積りも実績もあるタスクだけの合計。**ここだけが比較できる** */
  comparable: { count: number; estimate: number; actual: number };
  /** 完了しているのに実績が入っていないタスクの件数 */
  missingActual: number;
  /** 実績はあるが見積りが無いタスクの件数 */
  missingEstimate: number;
  agentMinutes: number;
};

/**
 * プロジェクトの工数（完了タスクのみ）。
 *
 * **途中のタスクは入れない。** 進行中のタスクは実績が増え続けるので、
 * 見積りと比べても「まだ足りていない」以上のことが分からない。
 */
export async function effortSummary(
  productId: string,
  options: { actorId?: string | null } = {},
): Promise<EffortSummary> {
  const rows = await db.execute(sql`
    select t.id::text as task_id, t.key, t.title, t.estimate_minutes,
           a.name as assignee_name,
           coalesce(sum(w.minutes) filter (where w.source = 'manual'), 0)::int as human_minutes,
           coalesce(sum(w.minutes) filter (where w.source = 'agent'), 0)::int  as agent_minutes
      from task t
      left join actor a on a.id = t.assignee_id
      left join work_log w on w.task_id = t.id
     where t.product_id = ${productId}
       and t.status = 'done'
       ${options.actorId ? sql`and t.assignee_id = ${options.actorId}` : sql``}
     group by t.id, t.key, t.title, t.estimate_minutes, a.name
     order by t.key
  `);

  const list = ((rows as unknown as { rows: Array<Record<string, unknown>> }).rows ?? []).map(
    (row): EffortRow => ({
      taskId: row.task_id as string,
      key: row.key as string,
      title: row.title as string,
      assigneeName: (row.assignee_name as string | null) ?? null,
      estimateMinutes: (row.estimate_minutes as number | null) ?? null,
      humanMinutes: Number(row.human_minutes),
      agentMinutes: Number(row.agent_minutes),
    }),
  );

  const comparableRows = list.filter((r) => r.estimateMinutes !== null && r.humanMinutes > 0);

  return {
    rows: list,
    comparable: {
      count: comparableRows.length,
      estimate: comparableRows.reduce((s, r) => s + (r.estimateMinutes ?? 0), 0),
      actual: comparableRows.reduce((s, r) => s + r.humanMinutes, 0),
    },
    missingActual: list.filter((r) => r.humanMinutes === 0).length,
    missingEstimate: list.filter((r) => r.estimateMinutes === null && r.humanMinutes > 0).length,
    agentMinutes: list.reduce((s, r) => s + r.agentMinutes, 0),
  };
}

/** 「1時間30分」の形。**分だけで出さない**（240分が直感的に読めない）。 */
export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return '0分';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}
