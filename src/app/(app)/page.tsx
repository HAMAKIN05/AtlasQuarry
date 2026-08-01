import { AlertTriangleIcon, ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

import { GanttChart, GanttLegend } from '@/components/GanttChart';
import { TaskCheck } from '@/components/TaskCheck';
import {
  Alert,
  Badge,
  EmptyState,
  Loading,
  PageHeader,
  Progress,
  priorityTone,
  taskStatusTone,
} from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { getHomeGantt } from '@/domain/gantt/query';
import { listProducts } from '@/domain/product/service';
import { listRequests } from '@/domain/request/service';
import { loadLabels } from '@/domain/setting/labels';
import { listTasks, type TaskListItem } from '@/domain/task/service';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';
import { dueLabel, isOverdue } from '@/lib/format';
import { ROLE_LABELS, type Labels } from '@/lib/labels';

export const metadata = { title: 'ホーム | AtlasQuarry' };

/**
 * ホーム。**ログインした直後に必要な情報がここで揃うこと**が目的。
 *
 * 並び順は役割で変える（v0.1スコープ §3）。経営者と管理者はまず「自分の判断を
 * 待っているもの」と全体の進み具合、開発者はまず「自分がやること」。
 * 全員に同じ順で見せると、どちらにとっても要らない情報が上に来る。
 */
export default async function HomePage() {
  const actor = await requireActor();
  const canTriage = can(actor, 'request.triage');
  const developerFirst = actor.role === 'developer' || actor.role === 'agent';

  return (
    <div className="flex flex-col gap-9">
      <PageHeader
        title={`こんにちは、${actor.name}さん`}
        description={`${ROLE_LABELS[actor.role]}として使っています。やることと、判断が必要なものをまとめています。`}
      />
      <Suspense fallback={<Loading label="状況をまとめています" />}>
        <HomeSummary actorId={actor.id} canTriage={canTriage} />
      </Suspense>

      {developerFirst ? (
        <>
          <Suspense fallback={<Loading />}>
            <MyTasks actorId={actor.id} />
          </Suspense>
          <Suspense fallback={<Loading />}>
            <ScheduleSection />
          </Suspense>
          <Suspense fallback={<Loading />}>
            <AcceptedRequests />
          </Suspense>
        </>
      ) : (
        <>
          {canTriage && (
            <Suspense fallback={<Loading />}>
              <PendingRequests />
            </Suspense>
          )}
          <Suspense fallback={<Loading />}>
            <ScheduleSection />
          </Suspense>
          <Suspense fallback={<Loading />}>
            <ProjectOverview />
          </Suspense>
          <Suspense fallback={<Loading />}>
            <MyTasks actorId={actor.id} />
          </Suspense>
        </>
      )}
    </div>
  );
}

/** 数値を最初に置き、読む順番を「状況 → 個別の仕事」に固定する。 */
async function HomeSummary({ actorId, canTriage }: { actorId: string; canTriage: boolean }) {
  const [myTasks, projects, pendingRequests] = await Promise.all([
    listTasks({ assigneeId: actorId, status: ['backlog', 'todo', 'in_progress', 'review'] }),
    listProducts(),
    canTriage ? listRequests(['received', 'reviewing']) : Promise.resolve([]),
  ]);
  const overdue = myTasks.filter((task) => isOverdue(task.dueDate, task.status)).length;
  const done = projects.reduce((sum, project) => sum + project.progress.doneTasks, 0);
  const total = projects.reduce((sum, project) => sum + project.progress.totalTasks, 0);

  return (
    <section aria-label="現在の状況" className="summary-strip">
      <Link href="/tasks" className="summary-metric hover:bg-raised" data-tone={overdue > 0 ? 'danger' : undefined}>
        <span className="summary-label">自分のタスク</span>
        <span className="summary-number">{myTasks.length}</span>
        <span className="text-sm text-muted-foreground">{overdue > 0 ? `うち期限超過 ${overdue}` : '期限超過なし'}</span>
      </Link>
      <Link href="/projects" className="summary-metric hover:bg-raised">
        <span className="summary-label">全体の進み</span>
        <span className="summary-number">{total === 0 ? '—' : `${Math.round((done / total) * 100)}%`}</span>
        <span className="text-sm text-muted-foreground">{total === 0 ? 'タスクなし' : `${done}/${total} 件が完了`}</span>
      </Link>
      <Link href="/requests" className="summary-metric hover:bg-raised" data-tone={pendingRequests.length > 0 ? 'accent' : undefined}>
        <span className="summary-label">判断待ち</span>
        <span className="summary-number">{canTriage ? pendingRequests.length : '—'}</span>
        <span className="text-sm text-muted-foreground">{canTriage ? '要望の判断が必要' : '要望画面で確認'}</span>
      </Link>
    </section>
  );
}

/**
 * 動いているプロジェクトの予定。
 *
 * ホームから飛ばずに全体の時間軸が見えるようにする。プロジェクトごとに分けて出し、
 * 詳細は各プロジェクトのガントへ送る。
 */
async function ScheduleSection() {
  const charts = await getHomeGantt();

  if (charts.length === 0) {
    return (
      <section className="content-section">
        <div className="section-heading"><div><h2>予定</h2></div></div>
        <EmptyState title="予定はまだありません" description="タスクに開始日と期限を入れると、ここに時間軸が出ます。" actionLabel="タスクを見る" actionHref="/tasks" />
      </section>
    );
  }

  return (
    <section className="content-section">
      <div className="section-heading">
        <div><h2>予定</h2></div>
        <GanttLegend />
      </div>
      {charts.map((chart) => (
        <div key={chart.productId} className="border-b border-border pb-5 last:border-b-0">
          <div className="mb-2 flex min-h-11 items-center justify-between gap-3">
            <h3 className="font-semibold">{chart.productName}</h3>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/projects/${chart.productId}?view=gantt`}>
                詳しく見る
                <ArrowRightIcon />
              </Link>
            </Button>
          </div>
          <div className="overflow-hidden">
            <GanttChart rows={chart.rows} compact />
          </div>
        </div>
      ))}
    </section>
  );
}

async function PendingRequests() {
  const [requests, labels] = await Promise.all([
    listRequests(['received', 'reviewing']),
    loadLabels(),
  ]);

  return (
    <section className="content-section">
      <div className="section-heading">
        <div><h2>判断を待つ要望 <span className="tabular font-mono text-primary">{requests.length}</span></h2></div>
        {requests.length > 0 && (
          <Button asChild variant="ghost" size="sm">
            <Link href="/requests">
              すべて見る
              <ArrowRightIcon />
            </Link>
          </Button>
        )}
      </div>
        {requests.length === 0 ? (
          /*
           * **ここは0件が正常な状態**なので、空状態に見出し・説明・ボタンの塊を置くと
           * ホームの一番上を「何も無いこと」が占める。要望画面への導線は上の要約帯と
           * ナビにあるので、ここは1行で足りる。
           */
          <p className="empty-inline">
            いまは判断待ちの要望はありません。新しく出されると、ここに並びます。
          </p>
        ) : (
          <ul>
            {requests.slice(0, 5).map((r) => (
              <li key={r.id}>
                <Link
                  href={`/requests/${r.id}`}
                  className="row-link"
                >
                  <span className="min-w-0 flex-1 basis-48 font-semibold">{r.title}</span>
                  <Badge tone={r.status === 'received' ? 'warn' : 'progress'}>
                    {labels[`request.status.${r.status}`]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{r.reporterName}さんから</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

async function AcceptedRequests() {
  const requests = await listRequests(['accepted']);
  const notYetTask = requests.filter((r) => r.convertedTaskId === null);
  if (notYetTask.length === 0) return null;

  return (
    <section className="content-section">
      <div className="section-heading"><div><h2>着手が決まった要望 <span className="tabular font-mono text-primary">{notYetTask.length}</span></h2></div></div>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          やると決まったものです。タスクにすると担当と期限を決められます。
        </p>
        <ul>
          {notYetTask.slice(0, 5).map((r) => (
            <li key={r.id}>
              <Link
                href={`/requests/${r.id}`}
                className="row-link"
              >
                <span className="min-w-0 flex-1 basis-48 font-semibold">{r.title}</span>
                <span className="text-xs text-muted-foreground">{r.reporterName}さんから</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

async function MyTasks({ actorId }: { actorId: string }) {
  const [tasks, labels] = await Promise.all([
    listTasks({ assigneeId: actorId, status: ['backlog', 'todo', 'in_progress', 'review'] }),
    loadLabels(),
  ]);

  const overdue = tasks.filter((t) => isOverdue(t.dueDate, t.status));
  const rest = tasks.filter((t) => !isOverdue(t.dueDate, t.status));

  return (
    <section className="content-section">
      <div className="section-heading">
        <div><h2>自分のタスク <span className="tabular font-mono text-primary">{tasks.length}</span></h2></div>
        {tasks.length > 0 && (
          <Button asChild variant="ghost" size="sm">
            <Link href="/tasks">
              すべて見る
              <ArrowRightIcon />
            </Link>
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-3">
        {tasks.length === 0 ? (
          <EmptyState
            title="担当しているタスクはありません"
            description="タスクは要望から作るか、タスク画面で直接追加できます。"
            actionLabel="タスクを見る"
            actionHref="/tasks"
          />
        ) : (
          <>
            {overdue.length > 0 && (
              <Alert tone="error" className="flex items-center gap-2">
                <AlertTriangleIcon className="size-4 shrink-0" />
                期限を過ぎたタスクが {overdue.length} 件あります。
              </Alert>
            )}
            <ul>
              {[...overdue, ...rest].slice(0, 8).map((t) => (
                <TaskRow key={t.id} task={t} labels={labels} />
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

function TaskRow({ task, labels }: { task: TaskListItem; labels: Labels }) {
  const due = dueLabel(task.dueDate, task.status);
  const late = isOverdue(task.dueDate, task.status);

  return (
    <li>
      <Link href={`/tasks/${task.key}`} className="row-link">
        <TaskCheck taskId={task.id} status={task.status} title={task.title} />
        <span className="tabular shrink-0 font-mono text-xs text-muted-foreground">{task.key}</span>
        <span className="min-w-0 flex-1 basis-40 font-semibold">{task.title}</span>
        <Badge tone={taskStatusTone(task.status)}>{labels[`task.status.${task.status}`]}</Badge>
        {task.priority !== 'normal' && (
          <Badge tone={priorityTone(task.priority)}>
            {labels[`task.priority.${task.priority}`]}
          </Badge>
        )}
        {due && (
          <span
            className={
              late ? 'tabular shrink-0 text-xs font-bold text-destructive' : 'tabular shrink-0 text-xs text-muted-foreground'
            }
          >
            {due}
          </span>
        )}
      </Link>
    </li>
  );
}

async function ProjectOverview() {
  const projects = await listProducts();

  return (
    <section className="content-section">
      <div className="section-heading">
        <div><h2>プロジェクトの進み具合</h2></div>
        {projects.length > 0 && (
          <Button asChild variant="ghost" size="sm">
            <Link href="/projects">
              すべて見る
              <ArrowRightIcon />
            </Link>
          </Button>
        )}
      </div>
        {projects.length === 0 ? (
          <EmptyState
            title="プロジェクトがまだありません"
            description="内製化する対象ごとに作ります。たとえば「日報自動化」「SNS分析」のような単位です。"
            actionLabel="プロジェクトを作る"
            actionHref="/projects"
          />
        ) : (
          <ul>
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="flex min-h-14 flex-col gap-1 border-b border-border px-1 py-3 last:border-b-0 hover:bg-raised sm:flex-row sm:items-center sm:gap-5"
                >
                  <span className="font-semibold sm:w-1/3">{p.name}</span>
                  <Progress className="w-full sm:flex-1" done={p.progress.doneTasks} total={p.progress.totalTasks} />
                </Link>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
