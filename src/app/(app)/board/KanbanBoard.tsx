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
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import type { TaskStatus } from '@/db/schema/enums';
import type { TaskListItem } from '@/domain/task/service';
import { ApiError, api } from '@/lib/api/client';
import { BOARD_COLUMNS, TASK_STATUS_LABELS } from '@/lib/format';

import { BoardColumn } from './BoardColumn';
import { TaskCard } from './TaskCard';
import { NewTaskForm } from './NewTaskForm';

type Option = { id: string; name: string };

type Props = {
  products: Array<{ id: string; key: string; name: string }>;
  productId: string;
  initialTasks: TaskListItem[];
  features: Option[];
  members: Option[];
  initialFilters: { assigneeId?: string; priority?: string; featureId?: string };
};

/**
 * かんばんボード（F-04）。
 *
 * DnD の結果はまず手元の state に反映し、その後 API を叩く。失敗したら元に戻す。
 * サーバー応答を待ってから動かすと、通信の往復ぶんカードが指に追従しない。
 */
export function KanbanBoard({
  products,
  productId,
  initialTasks,
  features,
  members,
  initialFilters,
}: Props) {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskListItem[]>(initialTasks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState(initialFilters);

  const sensors = useSensors(
    // スマホでのDnD（受入基準 5.4）。長押ししてから動かす方式にして、
    // 縦スクロールとドラッグの取り違えを防ぐ
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const visible = useMemo(
    () =>
      tasks.filter((task) => {
        if (filters.assigneeId && task.assigneeId !== filters.assigneeId) return false;
        if (filters.priority && task.priority !== filters.priority) return false;
        if (filters.featureId && task.featureId !== filters.featureId) return false;
        return true;
      }),
    [tasks, filters],
  );

  const columns = useMemo(() => {
    const grouped = new Map<TaskStatus, TaskListItem[]>();
    for (const status of BOARD_COLUMNS) grouped.set(status, []);
    for (const task of visible) {
      grouped.get(task.status)?.push(task);
    }
    for (const list of grouped.values()) list.sort((a, b) => a.position - b.position);
    return grouped;
  }, [visible]);

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

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

    const snapshot = tasks;
    // 楽観更新。position はサーバーの返り値で上書きする
    setTasks((prev) =>
      prev.map((t) => (t.id === moved.id ? { ...t, status: targetStatus } : t)),
    );
    setError(null);

    try {
      const updated = await api.patch<{ id: string; status: TaskStatus; position: number; completedAt: string | null }>(
        `/tasks/${moved.id}/position`,
        { status: targetStatus, afterId },
      );
      setTasks((prev) =>
        prev.map((t) =>
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
      setTasks(snapshot);
      setError(err instanceof ApiError ? err.message : '移動に失敗しました');
    }
  }

  return (
    <>
      <div className="board-toolbar">
        <label className="field field-inline">
          <span className="field-label">プロダクト</span>
          <select
            value={productId}
            onChange={(e) => router.push(`/board?productId=${e.target.value}`)}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.key} {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field field-inline">
          <span className="field-label">担当者</span>
          <select
            value={filters.assigneeId ?? ''}
            onChange={(e) => setFilters({ ...filters, assigneeId: e.target.value || undefined })}
          >
            <option value="">すべて</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field field-inline">
          <span className="field-label">優先度</span>
          <select
            value={filters.priority ?? ''}
            onChange={(e) => setFilters({ ...filters, priority: e.target.value || undefined })}
          >
            <option value="">すべて</option>
            <option value="urgent">至急</option>
            <option value="high">高</option>
            <option value="normal">中</option>
            <option value="low">低</option>
          </select>
        </label>

        <label className="field field-inline">
          <span className="field-label">開発項目</span>
          <select
            value={filters.featureId ?? ''}
            onChange={(e) => setFilters({ ...filters, featureId: e.target.value || undefined })}
          >
            <option value="">すべて</option>
            {features.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <NewTaskForm
        productId={productId}
        features={features}
        members={members}
        onCreated={(task) => setTasks((prev) => [...prev, task])}
      />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="board">
          {BOARD_COLUMNS.map((status) => {
            const items = columns.get(status) ?? [];
            return (
              <BoardColumn key={status} status={status} label={TASK_STATUS_LABELS[status]} count={items.length}>
                <SortableContext items={items.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  {items.length === 0 ? (
                    <p className="empty empty-column">タスクなし</p>
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

      <p className="board-hint">
        <Link href="/products">プロダクト一覧へ</Link>
      </p>
    </>
  );
}
