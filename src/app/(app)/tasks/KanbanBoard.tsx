'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { useLabels } from '@/components/LabelsProvider';
import type { TaskStatus } from '@/db/schema/enums';
import type { TaskListItem } from '@/domain/task/service';
import { ApiError, api } from '@/lib/api/client';
import { BOARD_COLUMNS } from '@/lib/labels';

import { BoardColumn } from './BoardColumn';
import { TaskCard } from './TaskCard';

type Props = {
  /** 絞り込み後の、画面に出すタスク。 */
  tasks: TaskListItem[];
  /** 絞り込み前の全件。移動結果を書き戻すために必要。 */
  allTasks: TaskListItem[];
  onTasksChange: (tasks: TaskListItem[]) => void;
};

/**
 * かんばん（F-04）。
 *
 * DnD の結果はまず手元の state に反映し、その後 API を叩く。失敗したら元に戻す。
 * サーバー応答を待ってから動かすと、通信の往復ぶんカードが指に追従しない。
 */
export function KanbanBoard({ tasks, allTasks, onTasksChange }: Props) {
  const router = useRouter();
  const labels = useLabels();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    // スマホでのDnD（受入基準 5.4）。長押ししてから動かす方式にして、
    // 縦スクロールとドラッグの取り違えを防ぐ
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const columns = useMemo(() => {
    const grouped = new Map<TaskStatus, TaskListItem[]>();
    for (const status of BOARD_COLUMNS) grouped.set(status, []);
    for (const task of tasks) grouped.get(task.status)?.push(task);
    for (const list of grouped.values()) list.sort((a, b) => a.position - b.position);
    return grouped;
  }, [tasks]);

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const moved = tasks.find((t) => t.id === active.id);
    if (!moved) return;

    // ドロップ先が列そのものなら末尾、カードなら「そのカードの位置」に挿入する
    const overId = String(over.id);
    const overTask = tasks.find((t) => t.id === overId);
    const targetStatus = (overTask?.status ?? (overId as TaskStatus)) as TaskStatus;
    if (!BOARD_COLUMNS.includes(targetStatus)) return;

    const column = (columns.get(targetStatus) ?? []).filter((t) => t.id !== moved.id);
    const insertAt = overTask ? column.findIndex((t) => t.id === overTask.id) : column.length;
    const afterId = insertAt <= 0 ? null : column[insertAt - 1]!.id;

    if (targetStatus === moved.status && afterId === null && column.length === 0) return;

    const snapshot = allTasks;
    onTasksChange(allTasks.map((t) => (t.id === moved.id ? { ...t, status: targetStatus } : t)));
    setError(null);

    try {
      const updated = await api.patch<{
        id: string;
        status: TaskStatus;
        position: number;
        completedAt: string | null;
      }>(`/tasks/${moved.id}/position`, { status: targetStatus, afterId });

      onTasksChange(
        allTasks.map((t) =>
          t.id === moved.id
            ? {
                ...t,
                status: updated.status,
                position: updated.position,
                completedAt: updated.completedAt ? new Date(updated.completedAt) : null,
              }
            : t,
        ),
      );
      // 他の列の position が振り直された可能性があるので、サーバーの並びを取り直す
      router.refresh();
    } catch (err) {
      onTasksChange(snapshot);
      setError(err instanceof ApiError ? err.message : '移動できませんでした');
    }
  }

  return (
    <>
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      <p className="hint hint-mobile">
        カード左の持ち手を長押ししてから動かすと、状態を変えられます。
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="board">
          {BOARD_COLUMNS.map((status) => {
            const items = columns.get(status) ?? [];
            return (
              <BoardColumn
                key={status}
                status={status}
                label={labels[`task.status.${status}`]}
                count={items.length}
              >
                <SortableContext
                  items={items.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {items.length === 0 ? (
                    <p className="board-empty">ここにドラッグ</p>
                  ) : (
                    items.map((task) => <TaskCard key={task.id} task={task} />)
                  )}
                </SortableContext>
              </BoardColumn>
            );
          })}
        </div>

        <DragOverlay>{activeTask ? <TaskCard task={activeTask} overlay /> : null}</DragOverlay>
      </DndContext>
    </>
  );
}
