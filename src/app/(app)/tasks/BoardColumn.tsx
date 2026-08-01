'use client';

import { useDroppable } from '@dnd-kit/core';

import type { TaskStatus } from '@/db/schema/enums';
import { cn } from '@/lib/cn';

/** ステータスごとの点の色。かんばんの列頭と凡例で意味を合わせる。 */
const DOT: Record<string, string> = {
  in_progress: 'bg-primary',
  review: 'bg-warning',
  done: 'bg-success',
};

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
      aria-label={`${label}（${count}件）`}
      className={cn(
        'flex w-[78vw] max-w-68 shrink-0 flex-col rounded-lg border bg-raised lg:w-auto lg:flex-1 lg:basis-0 lg:min-w-52',
        isOver && 'border-primary bg-primary-soft',
      )}
    >
      <h2 className="flex items-center gap-2 p-3 text-sm font-semibold">
        <span
          aria-hidden="true"
          className={cn('size-2 rounded-full', DOT[status] ?? 'bg-subtle')}
        />
        {label}
        <span className="tabular ml-auto text-muted-foreground">{count}</span>
      </h2>
      <div ref={setNodeRef} className="flex min-h-32 flex-1 flex-col gap-2 px-2 pb-2">
        {children}
      </div>
    </section>
  );
}
