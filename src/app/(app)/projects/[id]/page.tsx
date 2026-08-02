import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { GanttChart } from '@/components/GanttChart';
import { MobileSchedule } from '@/components/MobileSchedule';
import { Badge, EmptyState, Loading, PageHeader, taskStatusTone, BackLink } from '@/components/app-ui';
import { getProductById } from '@/domain/product/service';
import { loadLabels } from '@/domain/setting/labels';
import { groupTasks } from '@/domain/task/grouping';
import { listTasks, type TaskListItem } from '@/domain/task/service';
import { requireActor } from '@/lib/auth/cookies';
import { NotFoundError } from '@/lib/errors';
import { dueLabel, formatDate, isOverdue } from '@/lib/format';
import type { Labels } from '@/lib/labels';
import { cn } from '@/lib/cn';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
};

export const metadata = { title: 'プロジェクト | AtlasQuarry' };

async function loadProject(id: string) {
  try {
    return await getProductById(id);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

const VIEWS = [
  { key: 'overview', label: '概要' },
  { key: 'tasks', label: 'タスク' },
  { key: 'schedule', label: '予定' },
] as const;

/**
 * プロジェクトホーム。**この案件の親画面はここ1つ。**
 *
 * 見方を `概要 / タスク / 予定` の3つに固定する。以前は開発項目の一覧が本体で、
 * タスクもガントも別の場所にあり、案件の全体像を見る場所が無かった。
 */
export default async function ProjectHomePage({ params, searchParams }: Props) {
  await requireActor();
  const { id } = await params;
  const { view } = await searchParams;
  const current = VIEWS.find((v) => v.key === view)?.key ?? 'overview';

  const project = await loadProject(id);
  if (!project) notFound();

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/" label="プロジェクト" />

      <PageHeader title={project.name} description={project.description ?? undefined} />

      <nav className="-mx-1 flex max-w-full gap-2 overflow-x-auto px-1 py-1" aria-label="この案件の見方">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={v.key === 'overview' ? `/projects/${project.id}` : `/projects/${project.id}?view=${v.key}`}
            className={cn('chip shrink-0')}
            aria-current={current === v.key ? 'page' : undefined}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {current === 'overview' && (
        <Suspense fallback={<Loading />}>
          <Overview projectId={project.id} />
        </Suspense>
      )}

      {current === 'tasks' && (
        <Suspense fallback={<Loading />}>
          <ProjectTasks projectId={project.id} />
        </Suspense>
      )}

      {current === 'schedule' && (
        <Suspense fallback={<Loading />}>
          <ProjectSchedule projectId={project.id} />
        </Suspense>
      )}
    </div>
  );
}

/**
 * 概要。**この案件でいま何が起きているか**を数字で先に出す。
 * 数字は押せる（該当のタスクへ行く）。見て終わりの数字は置かない。
 */
async function Overview({ projectId }: { projectId: string }) {
  const [tasks, labels] = await Promise.all([listTasks({ productId: projectId }), loadLabels()]);
  const today = new Date().toISOString().slice(0, 10);

  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  const late = open.filter((t) => t.dueDate !== null && t.dueDate < today).length;
  const dueToday = open.filter((t) => t.dueDate === today).length;
  const unassigned = open.filter((t) => !t.assigneeName).length;

  const to = `/projects/${projectId}?view=tasks`;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-2">
        <Link href={to} className="card">
          <span className="text-[13px] text-muted-foreground">遅れ</span>
          <span className={cn('stat-value mt-1 block', late > 0 && 'text-destructive')}>{late}</span>
        </Link>
        <Link href={to} className="card">
          <span className="text-[13px] text-muted-foreground">今日まで</span>
          <span className="stat-value mt-1 block">{dueToday}</span>
        </Link>
        <Link href={to} className="card">
          <span className="text-[13px] text-muted-foreground">未割当</span>
          <span className="stat-value mt-1 block">{unassigned}</span>
        </Link>
      </div>

      {open.length === 0 ? (
        <EmptyState
          title="動いているタスクはありません"
          description="右下の「＋」から追加できます。押した時点でこのプロジェクトが入ります。"
        />
      ) : (
        <GroupedTaskList tasks={open} labels={labels} />
      )}
    </div>
  );
}

async function ProjectSchedule({ projectId }: { projectId: string }) {
  const tasks = await listTasks({ productId: projectId });
  const rows = tasks
    .filter((t) => t.startDate !== null || t.dueDate !== null)
    .map((t) => ({
      kind: 'task' as const,
      id: t.id,
      key: t.key,
      label: t.title,
      startDate: t.startDate,
      dueDate: t.dueDate,
      status: t.status,
      featureId: t.featureId,
      assigneeName: t.assigneeName,
      progress: null,
      href: `/tasks/${t.key}`,
    }));

  if (rows.length === 0) {
    return (
      <EmptyState
        title="予定に出せるタスクがありません"
        description="タスクに開始日か期限を入れると、ここに時系列で並びます。"
      />
    );
  }

  return (
    <>
      <MobileSchedule rows={rows} projectId={projectId} />
      <div className="hidden lg:block">
        <GanttChart rows={rows} />
      </div>
    </>
  );
}

/** まとまりごとに束ねた一覧。概要とタスクの両方から使う。 */
function GroupedTaskList({ tasks, labels }: { tasks: TaskListItem[]; labels: Labels }) {
  const { groups, loose } = groupTasks(tasks);

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.parent.id} className="flex flex-col gap-2">
          <h2 className="band-heading">
            <Link href={`/tasks/${g.parent.key}`} className="text-foreground">
              {g.parent.title}
            </Link>
            <span className="count">
              {g.done}/{g.total}
            </span>
            {g.dueDate && <span className="ml-auto font-normal">〜{formatDate(g.dueDate)}</span>}
          </h2>
          <div className="card-list">
            {g.children.map((t) => (
              <TaskCard key={t.id} task={t} labels={labels} />
            ))}
          </div>
        </section>
      ))}

      {loose.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="band-heading">
            {groups.length > 0 ? 'まとまりに入っていない' : 'タスク'}
            <span className="count">{loose.length}</span>
          </h2>
          <div className="card-list">
            {loose.map((t) => (
              <TaskCard key={t.id} task={t} labels={labels} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

async function ProjectTasks({ projectId }: { projectId: string }) {
  const [tasks, labels] = await Promise.all([listTasks({ productId: projectId }), loadLabels()]);

  if (tasks.length === 0) {
    return (
      <EmptyState
        title="このプロジェクトのタスクはまだありません"
        description="右下の「＋」から追加できます。押した時点でこのプロジェクトが入ります。"
      />
    );
  }

  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  const closed = tasks.length - open.length;

  return (
    <div className="flex flex-col gap-5">
      <GroupedTaskList tasks={open} labels={labels} />

      {closed > 0 && (
        <Link
          href={`/tasks?projectId=${projectId}`}
          className="px-1 py-2 text-sm font-semibold text-primary"
        >
          終わったもの {closed} 件を含めて見る
        </Link>
      )}

      <Link href={`/tasks?projectId=${projectId}&view=board`} className="chip self-start">
        かんばんで見る
      </Link>
    </div>
  );
}

function TaskCard({ task, labels }: { task: TaskListItem; labels: Labels }) {
  const due = dueLabel(task.dueDate, task.status);
  return (
    <Link href={`/tasks/${task.key}`} className="card flex items-center gap-3">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="card-title">{task.title}</span>
        <span className="stack-meta">
          <Badge tone={taskStatusTone(task.status)}>{labels[`task.status.${task.status}`]}</Badge>
          {task.assigneeName && <span>{task.assigneeName}</span>}
          {due && <span data-late={isOverdue(task.dueDate, task.status) || undefined}>{due}</span>}
        </span>
      </span>
      <span className="chevron" aria-hidden="true" />
    </Link>
  );
}
