'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { Chip, EmptyState, PageHeader, priorityTone, taskStatusTone } from '@/components/ui';
import { useLabels } from '@/components/LabelsProvider';
import type { TaskListItem } from '@/domain/task/service';
import { dueLabel, isOverdue } from '@/lib/format';

import { KanbanBoard } from './KanbanBoard';
import { NewTaskForm } from './NewTaskForm';

type Option = { id: string; name: string };

type Props = {
  projects: Array<{ id: string; key: string; name: string }>;
  projectId: string;
  initialTasks: TaskListItem[];
  initialView: 'list' | 'board';
  features: Option[];
  members: Option[];
};

/**
 * タスク画面。一覧とかんばんの切り替え、絞り込み、追加をまとめて持つ。
 *
 * タスクの実体は1つなので state もここで持ち、どちらの表示でも同じものを見せる。
 */
export function TaskWorkspace({
  projects,
  projectId,
  initialTasks,
  initialView,
  features,
  members,
}: Props) {
  const router = useRouter();
  const labels = useLabels();
  const [tasks, setTasks] = useState(initialTasks);
  const [view, setView] = useState<'list' | 'board'>(initialView);
  const [assigneeId, setAssigneeId] = useState('');
  const [featureId, setFeatureId] = useState('');
  const [showClosed, setShowClosed] = useState(false);

  const visible = useMemo(
    () =>
      tasks.filter((t) => {
        if (assigneeId && t.assigneeId !== assigneeId) return false;
        if (featureId && t.featureId !== featureId) return false;
        if (!showClosed && (t.status === 'done' || t.status === 'cancelled')) return false;
        return true;
      }),
    [tasks, assigneeId, featureId, showClosed],
  );

  const project = projects.find((p) => p.id === projectId);

  return (
    <>
      <PageHeader
        title="タスク"
        description="やること一覧です。カードをドラッグして状態を変えられます。"
        action={
          <NewTaskForm
            productId={projectId}
            features={features}
            members={members}
            onCreated={(task) => setTasks((prev) => [...prev, task])}
          />
        }
      />

      <div className="toolbar">
        <label className="field field-inline">
          <span className="field-label">プロジェクト</span>
          <select
            value={projectId}
            onChange={(e) => router.push(`/tasks?projectId=${e.target.value}&view=${view}`)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field field-inline">
          <span className="field-label">担当</span>
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">全員</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        {features.length > 0 && (
          <label className="field field-inline">
            <span className="field-label">開発項目</span>
            <select value={featureId} onChange={(e) => setFeatureId(e.target.value)}>
              <option value="">すべて</option>
              {features.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="check">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
          />
          終わったものも表示
        </label>

        <div className="viewswitch" role="group" aria-label="表示の切り替え">
          <button
            type="button"
            className="viewswitch-btn"
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
          >
            一覧
          </button>
          <button
            type="button"
            className="viewswitch-btn"
            aria-pressed={view === 'board'}
            onClick={() => setView('board')}
          >
            ボード
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={tasks.length === 0 ? 'まだタスクがありません' : '条件に合うタスクがありません'}
          description={
            tasks.length === 0
              ? `${project?.name ?? 'このプロジェクト'}の最初のタスクを追加するか、要望から作れます。`
              : '絞り込みを外すと表示されます。'
          }
          actionLabel={tasks.length === 0 ? '要望を見る' : undefined}
          actionHref={tasks.length === 0 ? '/requests' : undefined}
        />
      ) : view === 'board' ? (
        <KanbanBoard tasks={visible} allTasks={tasks} onTasksChange={setTasks} />
      ) : (
        <ul className="rows">
          {visible.map((t) => {
            const due = dueLabel(t.dueDate, t.status);
            return (
              <li key={t.id}>
                <Link href={`/tasks/${t.key}`} className="row">
                  <span className="row-key">{t.key}</span>
                  <span className="row-main">{t.title}</span>
                  <Chip tone={taskStatusTone(t.status)}>{labels[`task.status.${t.status}`]}</Chip>
                  {t.priority !== 'normal' && (
                    <Chip tone={priorityTone(t.priority)}>
                      {labels[`task.priority.${t.priority}`]}
                    </Chip>
                  )}
                  {t.assigneeName && <span className="row-sub">{t.assigneeName}</span>}
                  {due && (
                    <span className={`row-due${isOverdue(t.dueDate, t.status) ? ' is-late' : ''}`}>
                      {due}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
