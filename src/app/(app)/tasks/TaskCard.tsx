'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Link from 'next/link';

import { Chip, priorityTone } from '@/components/ui';
import { useLabels } from '@/components/LabelsProvider';
import type { TaskListItem } from '@/domain/task/service';
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

  return (
    <article className="tcard" ref={overlay ? undefined : setNodeRef} style={style}>
      <button
        type="button"
        className="tcard-grip"
        aria-label={`${task.key} を移動`}
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">⠿</span>
      </button>

      <Link href={`/tasks/${task.key}`} className="tcard-body">
        <span className="tcard-key">{task.key}</span>
        <span className="tcard-title">{task.title}</span>
      </Link>

      <div className="tcard-meta">
        {task.priority !== 'normal' && (
          <Chip tone={priorityTone(task.priority)}>{labels[`task.priority.${task.priority}`]}</Chip>
        )}
        {task.assigneeName && <span className="tcard-who">{task.assigneeName}</span>}
        {due && (
          <span className={`tcard-due${isOverdue(task.dueDate, task.status) ? ' is-late' : ''}`}>
            {due}
          </span>
        )}
      </div>
    </article>
  );
}
