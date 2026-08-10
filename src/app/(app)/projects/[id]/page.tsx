import { ColumnsIcon } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { GanttChart } from '@/components/GanttChart';
import { MobileSchedule } from '@/components/MobileSchedule';
import { Badge, EmptyState, Loading, taskStatusTone, BackLink } from '@/components/app-ui';
import { getProductById } from '@/domain/product/service';
import { loadLabels } from '@/domain/setting/labels';
import { DOCUMENT_TYPE_LABELS, listDocuments, type DocumentListItem } from '@/domain/document/service';
import { groupTasks } from '@/domain/task/grouping';
import { effortSummary, formatMinutes } from '@/domain/worklog/service';
import { listTasks, type TaskListItem } from '@/domain/task/service';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';
import { NotFoundError } from '@/lib/errors';
import { dueLabel, formatDate, isOverdue } from '@/lib/format';
import { PROJECT_STATUS_LABELS, type Labels } from '@/lib/labels';
import { cn } from '@/lib/cn';

import { NewDocButton } from './NewDocButton';

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
  /* **資料はタブを増やさず、プロジェクトの中の見方にする**（下部タブは4本のまま） */
  { key: 'docs', label: '資料' },
  /* 工数は案件単位でだけ見せる。**全社横断の集計画面は作らない**（査定に使われる） */
  { key: 'effort', label: '工数' },
] as const;

/**
 * プロジェクトホーム。**この案件の親画面はここ1つ。**
 *
 * 見方を `概要 / タスク / 予定` の3つに固定する。以前は開発項目の一覧が本体で、
 * タスクもガントも別の場所にあり、案件の全体像を見る場所が無かった。
 */
export default async function ProjectHomePage({ params, searchParams }: Props) {
  const actor = await requireActor();
  const canEditDocs = can(actor, 'document.edit');
  const { id } = await params;
  const { view } = await searchParams;
  const current = VIEWS.find((v) => v.key === view)?.key ?? 'overview';

  const project = await loadProject(id);
  if (!project) notFound();

  const canCreateTask = can(actor, 'task.create');

  return (
    <div className="project-workspace">
      <BackLink href="/projects" label="プロジェクト一覧" />

      <header className="project-cockpit">
        <div className="project-cockpit-copy">
          <div className="project-cockpit-kicker">
            <span className="tabular">{project.key}</span>
            <span className="project-status-label">{PROJECT_STATUS_LABELS[project.status]}</span>
          </div>
          <h1>{project.name}</h1>
          <p>{project.description ?? 'このプロジェクトの状況・仕事・資料をここで確認できます。'}</p>
        </div>
        <div className="project-primary-actions">
          <Link href={`/tasks?projectId=${project.id}&view=board`} className="primary-action">
            <ColumnsIcon className="size-4" aria-hidden="true" />
            かんばんを開く
          </Link>
          {canCreateTask && (
            <Link href={`/tasks?projectId=${project.id}&new=1`} className="secondary-action">タスクを追加</Link>
          )}
        </div>
      </header>

      <nav className="project-nav" aria-label="このプロジェクトの見方">
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

      {current === 'docs' && (
        <Suspense fallback={<Loading />}>
          <ProjectDocs projectId={project.id} canEdit={canEditDocs} />
        </Suspense>
      )}

      {current === 'effort' && (
        <Suspense fallback={<Loading />}>
          <Effort
            projectId={project.id}
            /* 開発者には自分の分だけ返す。**他人の工数を見せない** */
            actorId={can(actor, 'worklog.viewAll') ? null : actor.id}
          />
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
          description="このプロジェクトのタスクを、ここからすぐに追加できます。"
          actionLabel="タスクを追加"
          actionHref={`/tasks?projectId=${projectId}&new=1`}
        />
      ) : (
        <GroupedTaskList tasks={open} labels={labels} />
      )}

      {/*
        書き出し（F-19 / F-21）。**画面の下に置く。**
        毎日押すものではないので、上に置くと主な操作の邪魔になる。
      */}
      <div className="flex flex-wrap gap-2">
        <a href={`/api/v1/projects/${projectId}/export?format=md`} className="chip">
          文書にまとめて保存
        </a>
        <a href={`/api/v1/projects/${projectId}/export?format=csv`} className="chip">
          Excel用に保存
        </a>
      </div>
    </div>
  );
}

/**
 * 工数（F-17）。**完了したタスクだけ**を比べる。
 *
 * 進行中のタスクは実績が増え続けるので、見積りと比べても
 * 「まだ足りていない」以上のことが分からない。
 *
 * **入っていないものを数で出す。** 未入力を 0 分として集計すると
 * 「早く終わった」ように見え、見積り値で埋めると差分が常に 0 になる。
 */
async function Effort({ projectId, actorId }: { projectId: string; actorId: string | null }) {
  const summary = await effortSummary(projectId, { actorId });

  if (summary.rows.length === 0) {
    return (
      <EmptyState
        title="完了したタスクがまだありません"
        description="タスクを完了にするときに作業時間を入れると、見積りとの差がここに出ます。"
      />
    );
  }

  const diff = summary.comparable.actual - summary.comparable.estimate;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-2">
        <div className="card">
          <span className="text-[13px] text-muted-foreground">見積り</span>
          <span className="mt-1 block text-[17px] font-bold">
            {formatMinutes(summary.comparable.estimate)}
          </span>
        </div>
        <div className="card">
          <span className="text-[13px] text-muted-foreground">実績</span>
          <span className="mt-1 block text-[17px] font-bold">
            {formatMinutes(summary.comparable.actual)}
          </span>
        </div>
        <div className="card">
          <span className="text-[13px] text-muted-foreground">差</span>
          <span
            className={cn('mt-1 block text-[17px] font-bold', diff > 0 && 'text-destructive')}
          >
            {diff === 0 ? '—' : `${diff > 0 ? '+' : '-'}${formatMinutes(Math.abs(diff))}`}
          </span>
        </div>
      </div>

      <p className="px-1 text-[13px] text-muted-foreground">
        比べられるのは、見積りと実績が両方あるタスク {summary.comparable.count}件です。
        {summary.missingActual > 0 && ` 実績が入っていないものが ${summary.missingActual}件。`}
        {summary.missingEstimate > 0 && ` 見積りが無いものが ${summary.missingEstimate}件。`}
        {summary.comparable.count < 5 && ' 件数が少ないので、傾向の判断には足りません。'}
      </p>

      {summary.agentMinutes > 0 && (
        <p className="px-1 text-[13px] text-muted-foreground">
          このほかに AI の実行時間が {formatMinutes(summary.agentMinutes)} あります。
          <strong>上の比較には入れていません。</strong>
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="band-heading">
          完了したタスク<span className="count">{summary.rows.length}</span>
        </h2>
        <div className="card-list">
          {summary.rows.map((row) => (
            <Link key={row.taskId} href={`/tasks/${row.key}`} className="card block">
              <span className="block text-[15px] break-words">{row.title}</span>
              <span className="stack-meta mt-1">
                <span>{row.assigneeName ? `${row.assigneeName}さん` : '担当なし'}</span>
                <span>
                  見積 {row.estimateMinutes ? formatMinutes(row.estimateMinutes) : '—'}
                </span>
                <span>実績 {row.humanMinutes ? formatMinutes(row.humanMinutes) : '未記録'}</span>
                {row.agentMinutes > 0 && <span>AI {formatMinutes(row.agentMinutes)}</span>}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

async function ProjectSchedule({ projectId }: { projectId: string }) {
  const tasks = await listTasks({ productId: projectId });
  const today = new Date().toISOString().slice(0, 10);
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
      <MobileSchedule rows={rows} projectId={projectId} today={today} />
      <div className="hidden lg:block">
        <GanttChart rows={rows} today={today} />
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
        description="このプロジェクトのタスクを、ここからすぐに追加できます。"
        actionLabel="タスクを追加"
        actionHref={`/tasks?projectId=${projectId}&new=1`}
      />
    );
  }

  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  const closed = tasks.length - open.length;

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/tasks?projectId=${projectId}&view=board`} className="kanban-entry-card">
        <span className="kanban-entry-card-icon" aria-hidden="true">
          <ColumnsIcon className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <strong>かんばんで見る</strong>
          <span>タスクを状態ごとの列で並べ替え、進み具合を更新できます。</span>
        </span>
        <span className="chevron" aria-hidden="true" />
      </Link>
      <GroupedTaskList tasks={open} labels={labels} />

      {closed > 0 && (
        <Link
          href={`/tasks?projectId=${projectId}`}
          className="px-1 py-2 text-sm font-semibold text-primary"
        >
          終わったもの {closed} 件を含めて見る
        </Link>
      )}

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


/** 資料（F-11 / F-23）。**階層は1段まで**なので、親ごとに畳んで出す。 */
async function ProjectDocs({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const docs = await listDocuments(projectId);

  if (docs.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          title="資料はまだありません"
          description="仕様・覚え書き・議事録を、このプロジェクトの中に置けます。"
        />
        {canEdit && <NewDocButton projectId={projectId} />}
      </div>
    );
  }

  const parents = docs.filter((d) => d.parentId === null);
  const childrenOf = (id: string) => docs.filter((d) => d.parentId === id);

  return (
    <div className="flex flex-col gap-5">
      <div className="card-list">
        {parents.map((d) => (
          <div key={d.id} className="flex flex-col gap-2">
            <DocCard doc={d} />
            {childrenOf(d.id).length > 0 && (
              <div className="card-list pl-4">
                {childrenOf(d.id).map((c) => (
                  <DocCard key={c.id} doc={c} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {canEdit && <NewDocButton projectId={projectId} />}
    </div>
  );
}

function DocCard({ doc }: { doc: DocumentListItem }) {
  return (
    <Link href={`/docs/${doc.id}`} className="card flex items-center gap-3">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="card-title">{doc.title}</span>
        <span className="stack-meta">
          <Badge tone="neutral">{DOCUMENT_TYPE_LABELS[doc.type]}</Badge>
          {doc.type === 'minutes' && doc.meetingDate && <span>{formatDate(doc.meetingDate)}</span>}
          {doc.type === 'minutes' && !doc.isConfirmed && <Badge tone="warn">下書き</Badge>}
        </span>
      </span>
      <span className="chevron" aria-hidden="true" />
    </Link>
  );
}
