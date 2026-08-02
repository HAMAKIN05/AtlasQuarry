import type { TaskListItem } from '@/domain/task/service';

/**
 * 「まとまり」＝**子タスクを持つタスク**。
 *
 * **開発項目（feature）という別概念をやめた。** プロジェクトの下に開発項目があり、
 * しかも開発項目に入らないタスクも許していたので、構造そのものが例外を含んでいた
 * （「これは開発項目か、タスクか」を毎回判定させられる）。
 *
 * 代わりに、既にある親子関係（`parent_task_id`）をそのまま使う。
 * **画面には「親タスク」という技術用語を出さず「まとまり」と呼ぶ。**
 * Jira / Backlog の親子を、Asana / Todoist 並みに軽く見せる形。
 *
 * まとまりの期間と進捗は**子から導出する**（開発項目のときと同じ規則）。
 *   - 期間: 子の開始日の最小 〜 期限の最大
 *   - 進捗: 完了した子 / 子の総数
 *
 * **1階層まで。** 孫は作らせない。3人の規模で階層を深くすると、どこに何があるか
 * 分からなくなる。
 */

export type TaskGroup = {
  parent: TaskListItem;
  children: TaskListItem[];
  startDate: string | null;
  dueDate: string | null;
  done: number;
  total: number;
};

export type GroupedTasks = {
  /** 子を持つタスクと、その子 */
  groups: TaskGroup[];
  /** どのまとまりにも属さず、子も持たないタスク */
  loose: TaskListItem[];
};

function minOf(values: Array<string | null>): string | null {
  const present = values.filter((v): v is string => v !== null);
  return present.length === 0 ? null : present.reduce((a, b) => (a < b ? a : b));
}

function maxOf(values: Array<string | null>): string | null {
  const present = values.filter((v): v is string => v !== null);
  return present.length === 0 ? null : present.reduce((a, b) => (a > b ? a : b));
}

export function groupTasks(tasks: TaskListItem[]): GroupedTasks {
  const childrenOf = new Map<string, TaskListItem[]>();
  for (const task of tasks) {
    if (!task.parentTaskId) continue;
    const list = childrenOf.get(task.parentTaskId) ?? [];
    list.push(task);
    childrenOf.set(task.parentTaskId, list);
  }

  const groups: TaskGroup[] = [];
  const loose: TaskListItem[] = [];

  for (const task of tasks) {
    if (task.parentTaskId) continue; // 子は親の下に出す
    const children = childrenOf.get(task.id);
    if (!children || children.length === 0) {
      loose.push(task);
      continue;
    }
    groups.push({
      parent: task,
      children,
      // まとまり自身に日付が入っていればそれを優先し、無ければ子から導く
      startDate: task.startDate ?? minOf(children.map((c) => c.startDate)),
      dueDate: task.dueDate ?? maxOf(children.map((c) => c.dueDate)),
      done: children.filter((c) => c.status === 'done').length,
      total: children.length,
    });
  }

  return { groups, loose };
}

/** そのタスクが属するまとまりの名前。無ければ null。 */
export function parentTitleOf(
  task: TaskListItem,
  all: TaskListItem[],
): string | null {
  if (!task.parentTaskId) return null;
  return all.find((t) => t.id === task.parentTaskId)?.title ?? null;
}
