'use client';

import { ColumnsIcon, ListIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { Badge, EmptyState, PageHeader, priorityTone, taskStatusTone } from '@/components/app-ui';
import { useLabels } from '@/components/LabelsProvider';
import type { TaskListItem } from '@/domain/task/service';
import { cn } from '@/lib/cn';
import { dueLabel, isOverdue } from '@/lib/format';

import { TaskCheck } from '@/components/TaskCheck';

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

      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-y border-border py-3">
        <label className="flex min-w-0 flex-1 basis-40 flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted-foreground">プロジェクト</span>
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

        <label className="flex min-w-0 flex-1 basis-40 flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted-foreground">担当</span>
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
          <label className="flex min-w-0 flex-1 basis-40 flex-col gap-1.5">
            <span className="text-sm font-semibold text-muted-foreground">開発項目</span>
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

        <label className="inline-flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
          />
          終わったものも表示
        </label>

        {/*
          切替が見えないと、かんばんの存在に気づけない（実際に「かんばんが無い」と言われた）。
          選択中を塗りで示し、アイコンを添えて何の切替かを一目で分かるようにする。
        */}
        <div
          className="ml-auto inline-flex border border-border bg-raised p-0.5"
          role="group"
          aria-label="表示の切り替え"
        >
          {(
            [
              { key: 'list', label: '一覧', Icon: ListIcon },
              { key: 'board', label: 'かんばん', Icon: ColumnsIcon },
            ] as const
          ).map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => setView(key)}
              className={cn(
                'inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-sm transition-colors',
                view === key
                  ? 'bg-primary font-semibold text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          ))}
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
        <section className="content-section" aria-label="タスク一覧">
          <div className="section-heading">
            <div><h2>表示中 <span className="tabular font-mono text-primary">{visible.length}</span></h2></div>
          </div>
        <ul>
          {visible.map((t) => {
            const due = dueLabel(t.dueDate, t.status);
            return (
              <li key={t.id}>
                <Link href={`/tasks/${t.key}`} className="row-link">
                  <TaskCheck
                    taskId={t.id}
                    status={t.status}
                    title={t.title}
                    onDone={(next) =>
                      setTasks((prev) =>
                        prev.map((x) => (x.id === t.id ? { ...x, status: next } : x)),
                      )
                    }
                  />
                  <span className="tabular shrink-0 font-mono text-xs text-muted-foreground">{t.key}</span>
                  <span className="min-w-0 flex-1 basis-40 font-semibold">{t.title}</span>
                  <Badge tone={taskStatusTone(t.status)}>{labels[`task.status.${t.status}`]}</Badge>
                  {t.priority !== 'normal' && (
                    <Badge tone={priorityTone(t.priority)}>
                      {labels[`task.priority.${t.priority}`]}
                    </Badge>
                  )}
                  {t.assigneeName && <span className="text-xs text-muted-foreground">{t.assigneeName}</span>}
                  {due && (
                    <span className={isOverdue(t.dueDate, t.status) ? 'tabular shrink-0 text-xs font-bold text-destructive' : 'tabular shrink-0 text-xs text-muted-foreground'}>
                      {due}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        </section>
      )}
    </>
  );
}
