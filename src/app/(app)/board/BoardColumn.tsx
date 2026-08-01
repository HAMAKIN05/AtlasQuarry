'use client';

import { useDroppable } from '@dnd-kit/core';

import type { TaskStatus } from '@/db/schema/enums';

/**
 * かんばんの1列。
 *
 * 列自体を droppable にしているのは、タスク0件の列にも落とせるようにするため
 * （受入基準 5.4「タスク0件の列で表示が崩れない」）。
 */
export function BoardColumn({
  status,
  label,
  count,
  children,
}: {
  status: TaskStatus;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      className={`board-column${isOver ? ' is-over' : ''}`}
      aria-label={`${label}（${count}件）`}
    >
      <h2 className="board-column-title">
        {label}
        <span className="board-column-count">{count}</span>
      </h2>
      <div className="board-column-body" ref={setNodeRef}>
        {children}
      </div>
    </section>
  );
}
