'use client';

import { ColumnsIcon, ListIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { TaskCheck } from '@/components/TaskCheck';
import { Band, Dot, Hero, Row, Stack } from '@/components/Ledger';
import { useLabels } from '@/components/LabelsProvider';
import { EmptyState } from '@/components/app-ui';
import type { TaskStatus } from '@/db/schema/enums';
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
  /** 他の画面の「タスクを追加」から来たか。来ていれば追加フォームを開いて始める */
  startAdding: boolean;
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
/**
 * 行のわき。**プロジェクト → 相手 → 期限**の順で固定する。
 * 並びが毎回同じであることが、説明文よりも早く読み方を伝える。
 */
function TaskMeta({ task, showAssignee }: { task: TaskListItem; showAssignee?: boolean }) {
  const due = dueLabel(task.dueDate, task.status);
  const late = isOverdue(task.dueDate, task.status);

  return (
    <>
      {/* **記号ではなく名前を出す。** 記号は内部の識別子で、読んでも意味がない */}
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <Dot seed={task.productKey} />
        <span className="min-w-0 truncate">{task.productName}</span>
      </span>
      {showAssignee && task.assigneeName && <span>{task.assigneeName}</span>}
      {due && <span data-late={late || undefined}>{due}</span>}
    </>
  );
}

/**
 * 段の定義。**この並びが、そのまま「次に何をするか」の順。**
 * 未着手を「次に進める」と呼ぶのは、状態名ではなく次の行動で読ませるため。
 */
const BANDS = [
  { key: 'next', label: '次に進める', statuses: ['todo', 'backlog'] as TaskStatus[] },
  { key: 'doing', label: '進行中', statuses: ['in_progress'] as TaskStatus[] },
  { key: 'wait', label: '待ち', statuses: ['review'] as TaskStatus[] },
] as const;

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
  startAdding,
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

  /* 完了は段に混ぜず、畳んだまま帳面の末尾に置く */
  const doneTasks = useMemo(
    () => visible.filter((t) => t.status === 'done' || t.status === 'cancelled'),
    [visible],
  );

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
            一覧とかんばんを同格の主操作としては並べない（この画面の主操作は
            タスクを追加すること・進めることで、表示形式の選択ではない）。
            ただし **灰色の文字にしたら見つけられなくなった**（「かんばんどこいった？」）。
            主操作より弱く、しかし**押せると分かる形**にする。丸い札にして、
            いま出ていない方の名前を出す。
          */}
          <button
            type="button"
            onClick={() => setView(view === 'list' ? 'board' : 'list')}
            className="chip shrink-0"
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
            projectName={project?.name ?? ''}
            defaultOpen={startAdding}
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
        /*
         * **状態はバッジではなく段で示す。**
         * 「次に進める」「進行中」「待ち」「完了」の順に上から積む。どの段に載っているかが
         * そのまま状態なので、行ごとに色付きのバッジを読ませる必要がない。
         * 完了は畳んだ状態から始める（済んだものが場所を取らないように）。
         */
        <div className="flex flex-col">
          {BANDS.map(({ key, label, statuses }) => {
            const rows = visible.filter((t) => statuses.includes(t.status));
            if (rows.length === 0) return null;

            // 「次に進める」は先頭の1件だけを大きく出す。残りは進行中に混ぜない
            const isNext = key === 'next';
            const [head, ...rest] = rows;

            return (
              <Band key={key} label={label} count={rows.length}>
                {isNext && head && (
                  <Hero
                    href={`/tasks/${head.key}`}
                    title={head.title}
                    meta={<TaskMeta task={head} showAssignee />}
                  />
                )}
                <Stack>
                  {(isNext ? rest : rows).map((t, i, arr) => (
                    <Row
                      key={t.id}
                      lead={
                        <TaskCheck
                          taskId={t.id}
                          status={t.status}
                          title={t.title}
                          onDone={(next) => replaceTask(t.id, { status: next })}
                        />
                      }
                      href={`/tasks/${t.key}`}
                      title={t.title}
                      meta={<TaskMeta task={t} showAssignee={assigneeId === ''} />}
                      trailing={
                        <TaskStatusMenu
                          taskId={t.id}
                          status={t.status}
                          onChanged={(next) => replaceTask(t.id, { status: next })}
                        />
                      }
                    />
                  ))}
                </Stack>
              </Band>
            );
          })}

          {/* 完了は畳んでおく。開けば同じ帳面の続きとして出る */}
          {doneTasks.length > 0 && (
            <details className="band">
              <summary className="band-heading cursor-pointer list-none select-none">
                完了<span className="count">{doneTasks.length}</span>
              </summary>
              <Stack>
                {doneTasks.map((t, i, arr) => (
                  <Row
                    key={t.id}
                    lead={
                      <TaskCheck
                        taskId={t.id}
                        status={t.status}
                        title={t.title}
                        onDone={(next) => replaceTask(t.id, { status: next })}
                      />
                    }
                    href={`/tasks/${t.key}`}
                    title={t.title}
                    meta={<TaskMeta task={t} showAssignee={assigneeId === ''} />}
                  />
                ))}
              </Stack>
            </details>
          )}
        </div>
      )}

    </>
  );
}
