import { AlertTriangleIcon, ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

import { GanttChart } from '@/components/GanttChart';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className="flex flex-col gap-5">
      <PageHeader
        title={`こんにちは、${actor.name}さん`}
        description={`${ROLE_LABELS[actor.role]}として使っています。やることと、判断が必要なものをまとめています。`}
      />

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
      <Card>
        <CardHeader>
          <CardTitle>予定</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <EmptyState
            title="帯で見せられる予定がまだありません"
            description="タスクに開始日と期限を入れると、ここに進行中プロジェクトの予定が並びます。"
            actionLabel="タスクを見る"
            actionHref="/tasks"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {charts.map((chart) => (
        <Card key={chart.productId}>
          <CardHeader>
            <CardTitle>{chart.productName}の予定</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/projects/${chart.productId}?view=gantt`}>
                詳しく見る
                <ArrowRightIcon />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-3">
            <GanttChart rows={chart.rows} compact />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function PendingRequests() {
  const [requests, labels] = await Promise.all([
    listRequests(['received', 'reviewing']),
    loadLabels(),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>判断を待っている要望（{requests.length}）</CardTitle>
        {requests.length > 0 && (
          <Button asChild variant="ghost" size="sm">
            <Link href="/requests">
              すべて見る
              <ArrowRightIcon />
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="pt-3">
        {requests.length === 0 ? (
          <EmptyState
            title="判断待ちはありません"
            description="新しい要望が出されると、ここに並びます。"
            actionLabel="要望を見る"
            actionHref="/requests"
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {requests.slice(0, 5).map((r) => (
              <li key={r.id}>
                <Link
                  href={`/requests/${r.id}`}
                  className="flex min-h-13 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border p-3 hover:bg-muted"
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
      </CardContent>
    </Card>
  );
}

async function AcceptedRequests() {
  const requests = await listRequests(['accepted']);
  const notYetTask = requests.filter((r) => r.convertedTaskId === null);
  if (notYetTask.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>着手が決まった要望（{notYetTask.length}）</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pt-3">
        <p className="text-sm text-muted-foreground">
          やると決まったものです。タスクにすると担当と期限を決められます。
        </p>
        <ul className="flex flex-col gap-2">
          {notYetTask.slice(0, 5).map((r) => (
            <li key={r.id}>
              <Link
                href={`/requests/${r.id}`}
                className="flex min-h-13 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border p-3 hover:bg-muted"
              >
                <span className="min-w-0 flex-1 basis-48 font-semibold">{r.title}</span>
                <span className="text-xs text-muted-foreground">{r.reporterName}さんから</span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader>
        <CardTitle>自分のタスク（{tasks.length}）</CardTitle>
        {tasks.length > 0 && (
          <Button asChild variant="ghost" size="sm">
            <Link href="/tasks">
              すべて見る
              <ArrowRightIcon />
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-3">
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
            <ul className="flex flex-col gap-2">
              {[...overdue, ...rest].slice(0, 8).map((t) => (
                <TaskRow key={t.id} task={t} labels={labels} />
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TaskRow({ task, labels }: { task: TaskListItem; labels: Labels }) {
  const due = dueLabel(task.dueDate, task.status);
  const late = isOverdue(task.dueDate, task.status);

  return (
    <li>
      <Link
        href={`/tasks/${task.key}`}
        className="flex min-h-13 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border p-3 hover:bg-muted"
      >
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
    <Card>
      <CardHeader>
        <CardTitle>プロジェクトの進み具合</CardTitle>
        {projects.length > 0 && (
          <Button asChild variant="ghost" size="sm">
            <Link href="/projects">
              すべて見る
              <ArrowRightIcon />
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="pt-3">
        {projects.length === 0 ? (
          <EmptyState
            title="プロジェクトがまだありません"
            description="内製化する対象ごとに作ります。たとえば「日報自動化」「SNS分析」のような単位です。"
            actionLabel="プロジェクトを作る"
            actionHref="/projects"
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="flex flex-col gap-2 rounded-md border p-3 hover:bg-muted"
                >
                  <span className="font-semibold">{p.name}</span>
                  <Progress done={p.progress.doneTasks} total={p.progress.totalTasks} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
