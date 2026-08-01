'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVerticalIcon } from 'lucide-react';
import Link from 'next/link';

import { Badge, priorityTone } from '@/components/app-ui';
import { useLabels } from '@/components/LabelsProvider';
import type { TaskListItem } from '@/domain/task/service';
import { cn } from '@/lib/cn';
import { dueLabel, isOverdue } from '@/lib/format';

/**
 * かんばんのカード。
 *
 * ドラッグのハンドルをカード全体ではなく専用ボタンにしているのは、
 * カード内のリンク（タスク詳細への遷移）をタップで開けるようにするため。
 */
export function TaskCard({ task, overlay = false }: { task: TaskListItem; overlay?: boolean }) {
  const labels = useLabels();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = overlay
    ? undefined
    : {
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      };

  const due = dueLabel(task.dueDate, task.status);
  const late = isOverdue(task.dueDate, task.status);

  return (
    <article
      ref={overlay ? undefined : setNodeRef}
      style={style}
      className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-2 gap-y-1 rounded-md border bg-surface p-2"
    >
      <button
        type="button"
        aria-label={`${task.key} を移動`}
        {...attributes}
        {...listeners}
        // touch-none がないと、ドラッグ中にブラウザのスクロールへ横取りされる
        className="row-span-2 grid min-h-11 w-7 cursor-grab touch-none place-items-center rounded text-muted-foreground hover:bg-hover active:cursor-grabbing"
      >
        <GripVerticalIcon className="size-4" aria-hidden="true" />
      </button>

      <Link href={`/tasks/${task.key}`} className="flex flex-col gap-px">
        <span className="tabular font-mono text-[0.7rem] text-muted-foreground">{task.key}</span>
        <span className="text-sm leading-snug font-semibold">{task.title}</span>
      </Link>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {task.priority !== 'normal' && (
          <Badge tone={priorityTone(task.priority)}>{labels[`task.priority.${task.priority}`]}</Badge>
        )}
        {task.assigneeName && (
          <span className="text-xs text-muted-foreground">{task.assigneeName}</span>
        )}
        {due && (
          <span
            className={cn(
              'tabular text-xs',
              late ? 'font-bold text-destructive' : 'text-muted-foreground',
            )}
          >
            {due}
          </span>
        )}
      </div>
    </article>
  );
}
