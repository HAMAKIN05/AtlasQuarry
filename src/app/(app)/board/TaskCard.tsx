'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Link from 'next/link';

import type { TaskListItem } from '@/domain/task/service';
import { TASK_PRIORITY_LABELS, formatDate, isOverdue } from '@/lib/format';

/**
 * かんばんのカード。
 *
 * ドラッグのハンドルをカード全体ではなく専用ボタンにしているのは、
 * カード内のリンク（タスク詳細への遷移）をタップで開けるようにするため。
 */
export function TaskCard({ task, overlay = false }: { task: TaskListItem; overlay?: boolean }) {
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

  return (
    <article className="task-card" ref={overlay ? undefined : setNodeRef} style={style}>
      <button
        type="button"
        className="task-card-handle"
        aria-label={`${task.key} を移動`}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>

      <Link href={`/tasks/${task.key}`} className="task-card-link">
        <span className="task-key">{task.key}</span>
        <span className="task-title">{task.title}</span>
      </Link>

      <p className="task-card-meta">
        <span className="task-priority">{TASK_PRIORITY_LABELS[task.priority]}</span>
        {task.assigneeName && <span className="task-assignee">{task.assigneeName}</span>}
        {task.dueDate && (
          <span className={`task-due${isOverdue(task.dueDate, task.status) ? ' is-overdue' : ''}`}>
            {formatDate(task.dueDate)}
          </span>
        )}
      </p>
      {task.featureName && <p className="task-card-feature">{task.featureName}</p>}
    </article>
  );
}
