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
    <section className={`bcol${isOver ? ' is-over' : ''}`} aria-label={`${label}（${count}件）`}>
      <h2 className="bcol-head">
        <span className={`bcol-dot bcol-dot-${status}`} aria-hidden="true" />
        {label}
        <span className="bcol-count">{count}</span>
      </h2>
      <div className="bcol-body" ref={setNodeRef}>
        {children}
      </div>
    </section>
  );
}
