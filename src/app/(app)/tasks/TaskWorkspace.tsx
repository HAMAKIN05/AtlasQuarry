'use client';

import { ColumnsIcon, ListIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { TaskCheck } from '@/components/TaskCheck';
import { useLabels } from '@/components/LabelsProvider';
import { EmptyState } from '@/components/app-ui';
import type { TaskListItem } from '@/domain/task/service';
import { dueLabel, isOverdue } from '@/lib/format';

import { KanbanBoard } from './KanbanBoard';
import { NewTaskForm } from './NewTaskForm';
import { TaskStatusMenu } from './TaskStatusMenu';

type Option = { id: string; name: string };

type Props = {
  projects: Array<{ id: string; key: string; name: string }>;
  projectId: string;
  initialTasks: TaskListItem[];
  initialView: 'list' | 'board';
  features: Option[];
  members: Option[];
  /** ログインしている本人。「自分」を示すのに使う */
  currentActorId: string;
  /**
   * 開いたときの担当の絞り込み。
   * サーバー側で「自分の担当が1件でもあるか」を見て決める。**無い人には全員を渡す。**
   * 常に自分で固定すると、担当が付いていない経営者・管理者は毎回空の画面を見ることになる。
   */
  initialAssigneeId: string;
  /** プロジェクト詳細の開発項目から来たときの絞り込み。`?featureId=` を受ける */
  initialFeatureId: string;
};

/**
 * タスク画面。
 *
 * **「検索・分析する画面」ではなく「自分の作業リスト」にした。**
 *
 * 以前はプロジェクト・担当・開発項目・完了表示・表示切替を横一列に並べていた。
 * これは多人数向け SaaS の閲覧画面の作法で、3人のチームがスマホで開くと
 * **タスクを始める前に操作盤を読まされる。**
 *
 * いまは既定が「自分の担当」。それ以外の絞り込みは畳んであり、必要な人だけ開く。
 * かんばんは残す（一度消えたときに「かんばんが無い」と指摘された。使われている）。
 */
export function TaskWorkspace({
  projects,
  projectId,
  initialTasks,
  initialView,
  features,
  members,
  currentActorId,
  initialAssigneeId,
  initialFeatureId,
}: Props) {
  const router = useRouter();
  const labels = useLabels();
  const [tasks, setTasks] = useState(initialTasks);
  const [view, setView] = useState<'list' | 'board'>(initialView);
  // 既定は自分（担当が無い人は全員）。**開いた瞬間に自分の仕事が見えるのが普通**
  const [assigneeId, setAssigneeId] = useState(initialAssigneeId);
  /*
   * プロジェクト詳細の開発項目から `?featureId=…` で来る。**受け取っていなかった。**
   * 「この開発項目のタスクを見る」を押したのに、プロジェクト全体のタスクに着地していた。
   * 押した結果と着地が食い違うのは、遷移そのものへの不信になる。
   */
  const [featureId, setFeatureId] = useState(initialFeatureId);
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
  const filtered = assigneeId !== '' || featureId !== '' || showClosed;

  function replaceTask(id: string, patch: Partial<TaskListItem>) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">タスク</h1>
          {/*
            プロジェクトの切替だけは常に出す。タスクは必ずどれかに属していて、
            いまどれを見ているかが分からないと一覧の意味が変わってしまう。
          */}
          <select
            aria-label="プロジェクト"
            className="!min-h-11 !w-auto !border-0 !bg-transparent !px-1 text-base font-semibold"
            value={projectId}
            onChange={(e) => router.push(`/tasks?projectId=${e.target.value}&view=${view}`)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {/*
            **一覧とかんばんを同格の主操作として並べない。**
            紫のセグメントで2つ並べると「まずどちらで見るか決めろ」という画面になる。
            この画面の主操作はタスクを追加すること・進めることで、表示形式の選択ではない。
            かんばんは残す（消したときに指摘されている）が、**いま出ていない方へ行く
            控えめな1本のボタン**にする。
          */}
          <button
            type="button"
            onClick={() => setView(view === 'list' ? 'board' : 'list')}
            className="inline-flex min-h-11 items-center gap-1.5 px-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {view === 'list' ? (
              <>
                <ColumnsIcon className="size-4" aria-hidden="true" />
                かんばんで見る
              </>
            ) : (
              <>
                <ListIcon className="size-4" aria-hidden="true" />
                一覧で見る
              </>
            )}
          </button>

          <NewTaskForm
            productId={projectId}
            features={features}
            members={members}
            onCreated={(task) => setTasks((prev) => [...prev, task])}
          />
        </div>
      </header>

      {/*
        絞り込みは畳んでおく。**開いた人の8割は自分の担当だけを見たい。**
        開いているかどうかが分かるよう、絞り込み中は要約を summary に出す。
      */}
      <details className="border-y border-border">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm text-muted-foreground select-none">
          <span className="font-semibold">絞り込み</span>
          <span>
            {assigneeId === ''
              ? '全員'
              : assigneeId === currentActorId
                ? '自分の担当'
                : (members.find((m) => m.id === assigneeId)?.name ?? '担当者')}
            {featureId && ` / ${features.find((f) => f.id === featureId)?.name ?? '開発項目'}`}
            {showClosed && ' / 終わったものも表示'}
          </span>
        </summary>

        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 pb-3">
          <label className="flex min-w-0 flex-1 basis-40 flex-col gap-1.5">
            <span className="text-sm font-semibold text-muted-foreground">担当</span>
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">全員</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === currentActorId ? `${m.name}（自分）` : m.name}
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
        </div>
      </details>

      {visible.length === 0 ? (
        <EmptyState
          title={tasks.length === 0 ? 'まだタスクがありません' : '条件に合うタスクがありません'}
          description={
            tasks.length === 0
              ? `${project?.name ?? 'このプロジェクト'}の最初のタスクを追加するか、要望から作れます。`
              : filtered
                ? '絞り込みを開いて条件を外すと表示されます。'
                : '絞り込みを外すと表示されます。'
          }
          actionLabel={tasks.length === 0 ? '要望を見る' : undefined}
          actionHref={tasks.length === 0 ? '/requests' : undefined}
        />
      ) : view === 'board' ? (
        <KanbanBoard tasks={visible} allTasks={tasks} onTasksChange={setTasks} />
      ) : (
        <ul aria-label="タスク一覧">
          {visible.map((t) => {
            const due = dueLabel(t.dueDate, t.status);
            const late = isOverdue(t.dueDate, t.status);

            return (
              <li key={t.id}>
                <div className="row-link">
                  <TaskCheck
                    taskId={t.id}
                    status={t.status}
                    title={t.title}
                    onDone={(next) => replaceTask(t.id, { status: next })}
                  />

                  {/*
                    **行に出すのはタイトル・期限・相手だけ。**
                    タスクキー、通常の優先度、状態バッジは詳細へ退避した。
                    日本語のスマホ画面では、小さなバッジが増えるほど情報が多いのではなく
                    読みにくく見える。
                  */}
                  <Link href={`/tasks/${t.key}`} className="min-w-0 flex-1 basis-40 hover:underline">
                    {t.title}
                  </Link>

                  {t.priority === 'urgent' && (
                    <span className="shrink-0 text-xs font-bold text-destructive">
                      {labels['task.priority.urgent']}
                    </span>
                  )}
                  {assigneeId === '' && t.assigneeName && (
                    <span className="shrink-0 text-xs text-muted-foreground">{t.assigneeName}</span>
                  )}
                  {due && (
                    <span
                      className={
                        late
                          ? 'tabular shrink-0 text-xs font-bold text-destructive'
                          : 'tabular shrink-0 text-xs text-muted-foreground'
                      }
                    >
                      {due}
                    </span>
                  )}

                  {/*
                    状態を変えるのに、かんばんへ切り替えて長押しドラッグ、を必須にしない。
                    一覧からも明示的に選べるようにする（ドラッグは覚えないと使えない）。
                  */}
                  <TaskStatusMenu
                    taskId={t.id}
                    status={t.status}
                    onChanged={(next) => replaceTask(t.id, { status: next })}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
