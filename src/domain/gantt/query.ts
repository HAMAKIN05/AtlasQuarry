import type { TaskStatus } from '@/db/schema/enums';
import { listFeatures, listProducts } from '@/domain/product/service';
import { listTasks } from '@/domain/task/service';

/**
 * ガント（F-14、帯まで）。
 *
 * 開発項目 → その配下タスク、の順に並べた行を返す。開発項目の期間は
 * 機能定義書 §6.3 のとおり「feature 側に値があればそちら、無ければ配下タスクの MIN / MAX」。
 * この導出は listFeatures が既にやっているので、ここでは並べ替えと形の統一だけを行う。
 *
 * **依存線は扱わない**（v0.4。D-05 のとおり依存関係の入力は手動・任意で、
 * 入力する動機が生まれる前に線だけ作っても使われない）。
 */

export type GanttRow = {
  kind: 'feature' | 'task';
  id: string;
  /** タスクなら PRD-12。開発項目は null。 */
  key: string | null;
  label: string;
  /** どちらも null なら期間未設定。帯は描かない。 */
  startDate: string | null;
  dueDate: string | null;
  status: TaskStatus | null;
  /** 開発項目の進捗。タスク行では null。 */
  progress: { done: number; total: number } | null;
  /** タスク詳細への遷移先。開発項目は null。 */
  href: string | null;
};

export type GanttData = {
  rows: GanttRow[];
  /** 帯が1本もない（＝全部が期間未設定）かどうか。表示側の出し分けに使う。 */
  hasAnyPeriod: boolean;
};

/**
 * ホーム用。**進行中のプロジェクトだけ**を対象に、行数を絞ったガントを返す。
 *
 * ログイン直後に全体の状況が見えることが目的なので、細かい粒度より
 * 「どのプロジェクトがいつまでか」が分かることを優先する。行が多すぎると
 * ホームがガントで埋まるため、開発項目の行を主体にして上限を設ける。
 */
export async function getHomeGantt(limitRows = 14): Promise<
  Array<{ productId: string; productName: string; rows: GanttRow[] }>
> {
  const products = await listProducts();
  const active = products.filter((p) => p.status === 'active' || p.status === 'planning');

  const out: Array<{ productId: string; productName: string; rows: GanttRow[] }> = [];

  for (const product of active) {
    const { rows } = await getGanttData(product.id);
    // 期間が入っている行だけに絞る。帯が出ない行はホームでは意味がない
    const dated = rows.filter((r) => r.startDate !== null || r.dueDate !== null);
    if (dated.length === 0) continue;
    out.push({ productId: product.id, productName: product.name, rows: dated.slice(0, limitRows) });
  }

  return out;
}

export async function getGanttData(productId: string): Promise<GanttData> {
  const [features, tasks] = await Promise.all([
    listFeatures(productId),
    listTasks({ productId }),
  ]);

  const rows: GanttRow[] = [];

  for (const feature of features) {
    rows.push({
      kind: 'feature',
      id: feature.id,
      key: null,
      label: feature.name,
      startDate: feature.progress.startDate,
      dueDate: feature.progress.dueDate,
      status: null,
      progress: { done: feature.progress.doneTasks, total: feature.progress.totalTasks },
      href: null,
    });

    for (const task of tasks.filter((t) => t.featureId === feature.id)) {
      rows.push(taskRow(task));
    }
  }

  // 開発項目に属さないタスク。数が少なくても出さないと全体像がずれる
  const loose = tasks.filter((t) => t.featureId === null);
  if (loose.length > 0) {
    rows.push({
      kind: 'feature',
      id: 'unassigned',
      key: null,
      label: '開発項目に入っていないタスク',
      startDate: minOf(loose.map((t) => t.startDate)),
      dueDate: maxOf(loose.map((t) => t.dueDate)),
      status: null,
      progress: {
        done: loose.filter((t) => t.status === 'done').length,
        total: loose.length,
      },
      href: null,
    });
    for (const task of loose) rows.push(taskRow(task));
  }

  return {
    rows,
    hasAnyPeriod: rows.some((r) => r.startDate !== null || r.dueDate !== null),
  };
}

function taskRow(task: {
  id: string;
  key: string;
  title: string;
  startDate: string | null;
  dueDate: string | null;
  status: TaskStatus;
}): GanttRow {
  return {
    kind: 'task',
    id: task.id,
    key: task.key,
    label: task.title,
    startDate: task.startDate,
    dueDate: task.dueDate,
    status: task.status,
    progress: null,
    href: `/tasks/${task.key}`,
  };
}

function minOf(values: Array<string | null>): string | null {
  const present = values.filter((v): v is string => v !== null);
  return present.length === 0 ? null : present.reduce((a, b) => (a < b ? a : b));
}

function maxOf(values: Array<string | null>): string | null {
  const present = values.filter((v): v is string => v !== null);
  return present.length === 0 ? null : present.reduce((a, b) => (a > b ? a : b));
}
