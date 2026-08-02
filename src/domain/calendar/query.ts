import { and, asc, eq, gte, isNotNull, lte, ne } from 'drizzle-orm';

import { db } from '@/db/client';
import { actor, product, task } from '@/db/schema';
import type { TaskPriority, TaskStatus } from '@/db/schema/enums';

/**
 * カレンダー（F-15 / S-08）。
 *
 * **期限だけを置く。** 開始日も入れると、1つのタスクが月に2回出て、
 * 「この日までに何を終わらせるか」が読めなくなる。工程の見え方はガント（F-13）の仕事。
 *
 * **取りやめたタスクは出さない。** 完了は出す――「その日に何が終わる予定だったか」を
 * 振り返るときに、消えていると数が合わない。
 */

export type CalendarEvent = {
  id: string;
  key: string;
  title: string;
  dueDate: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeName: string | null;
  projectId: string;
  projectName: string;
};

/** `2026-08` の月の初日と末日（日本時間で数える）。 */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const year = y ?? 1970;
  const mon = m ?? 1;
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/** 日本時間の今月（`YYYY-MM`）。 */
export function currentMonth(): string {
  return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 7);
}

/** 隣の月。`delta` は -1 か +1。 */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export async function monthEvents(
  month: string,
  productId?: string | null,
): Promise<CalendarEvent[]> {
  const { from, to } = monthRange(month);

  return db
    .select({
      id: task.id,
      key: task.key,
      title: task.title,
      dueDate: task.dueDate,
      status: task.status,
      priority: task.priority,
      assigneeName: actor.name,
      projectId: product.id,
      projectName: product.name,
    })
    .from(task)
    .innerJoin(product, eq(product.id, task.productId))
    .leftJoin(actor, eq(actor.id, task.assigneeId))
    .where(
      and(
        isNotNull(task.dueDate),
        gte(task.dueDate, from),
        lte(task.dueDate, to),
        ne(task.status, 'cancelled'),
        ...(productId ? [eq(task.productId, productId)] : []),
      ),
    )
    .orderBy(asc(task.dueDate), asc(task.key)) as Promise<CalendarEvent[]>;
}

export type CalendarCell = {
  /** `YYYY-MM-DD`。前後の月の埋め草は `inMonth: false` */
  date: string;
  inMonth: boolean;
  events: CalendarEvent[];
};

/**
 * 月曜始まりの6週グリッド。**行数を固定する**――
 * 月ごとに高さが変わると、月を送るたびに下の一覧の位置が動く。
 */
export function buildGrid(month: string, events: CalendarEvent[]): CalendarCell[] {
  const { from } = monthRange(month);
  const first = new Date(`${from}T00:00:00Z`);
  // 日曜=0 を月曜始まりに直す
  const offset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first.getTime() - offset * 86_400_000);

  const byDate = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const list = byDate.get(event.dueDate) ?? [];
    list.push(event);
    byDate.set(event.dueDate, list);
  }

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    return { date, inMonth: date.startsWith(month), events: byDate.get(date) ?? [] };
  });
}
