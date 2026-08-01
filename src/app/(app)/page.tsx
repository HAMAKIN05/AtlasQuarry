import Link from 'next/link';
import { Suspense } from 'react';

import {
  Chip,
  EmptyState,
  Loading,
  PageHeader,
  Progress,
  Section,
  priorityTone,
  taskStatusTone,
} from '@/components/ui';
import { listProducts } from '@/domain/product/service';
import { listRequests } from '@/domain/request/service';
import { listTasks, type TaskListItem } from '@/domain/task/service';
import { loadLabels } from '@/domain/setting/labels';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';
import { dueLabel, isOverdue } from '@/lib/format';
import { ROLE_LABELS, type Labels } from '@/lib/labels';

export const metadata = { title: 'ホーム | AtlasQuarry' };

/**
 * ホーム。**役割ごとに出す順番を変える**（v0.1スコープ §3）。
 *
 * 経営者と管理者はまず「自分の判断を待っているもの」、開発者はまず「自分がやること」。
 * 全員に同じものを見せると、どちらにとっても要らない情報が上に来る。
 */
export default async function HomePage() {
  const actor = await requireActor();
  const canTriage = can(actor, 'request.triage');
  const developerFirst = actor.role === 'developer' || actor.role === 'agent';

  return (
    <div className="page">
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

async function PendingRequests() {
  const [requests, labels] = await Promise.all([
    listRequests(['received', 'reviewing']),
    loadLabels(),
  ]);

  return (
    <Section
      title={`判断を待っている要望（${requests.length}）`}
      action={
        requests.length > 0 ? (
          <Link href="/requests" className="btn-quiet">
            すべて見る
          </Link>
        ) : undefined
      }
    >
      {requests.length === 0 ? (
        <EmptyState
          title="判断待ちはありません"
          description="新しい要望が出されると、ここに並びます。"
          actionLabel="要望を見る"
          actionHref="/requests"
        />
      ) : (
        <ul className="rows">
          {requests.slice(0, 5).map((r) => (
            <li key={r.id}>
              <Link href={`/requests/${r.id}`} className="row">
                <span className="row-main">{r.title}</span>
                <span className="row-sub">{r.reporterName}さんから</span>
                <Chip tone={r.status === 'received' ? 'warn' : 'progress'}>
                  {labels[`request.status.${r.status}`]}
                </Chip>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

async function AcceptedRequests() {
  const requests = await listRequests(['accepted']);
  const notYetTask = requests.filter((r) => r.convertedTaskId === null);

  if (notYetTask.length === 0) return null;

  return (
    <Section title={`着手が決まった要望（${notYetTask.length}）`}>
      <p className="hint">やると決まったものです。タスクにすると担当と期限を決められます。</p>
      <ul className="rows">
        {notYetTask.slice(0, 5).map((r) => (
          <li key={r.id}>
            <Link href={`/requests/${r.id}`} className="row">
              <span className="row-main">{r.title}</span>
              <span className="row-sub">{r.reporterName}さんから</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
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
    <Section
      title={`自分のタスク（${tasks.length}）`}
      action={
        tasks.length > 0 ? (
          <Link href="/tasks" className="btn-quiet">
            すべて見る
          </Link>
        ) : undefined
      }
    >
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
            <p className="alert">期限を過ぎたタスクが {overdue.length} 件あります。</p>
          )}
          <ul className="rows">
            {[...overdue, ...rest].slice(0, 8).map((t) => (
              <TaskRow key={t.id} task={t} labels={labels} />
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

function TaskRow({ task, labels }: { task: TaskListItem; labels: Labels }) {
  const due = dueLabel(task.dueDate, task.status);

  return (
    <li>
      <Link href={`/tasks/${task.key}`} className="row">
        <span className="row-key">{task.key}</span>
        <span className="row-main">{task.title}</span>
        <Chip tone={taskStatusTone(task.status)}>{labels[`task.status.${task.status}`]}</Chip>
        {task.priority !== 'normal' && (
          <Chip tone={priorityTone(task.priority)}>
            {labels[`task.priority.${task.priority}`]}
          </Chip>
        )}
        {due && (
          <span className={`row-due${isOverdue(task.dueDate, task.status) ? ' is-late' : ''}`}>
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
    <Section
      title="プロジェクトの進み具合"
      action={
        projects.length > 0 ? (
          <Link href="/projects" className="btn-quiet">
            すべて見る
          </Link>
        ) : undefined
      }
    >
      {projects.length === 0 ? (
        <EmptyState
          title="プロジェクトがまだありません"
          description="内製化する対象ごとに作ります。たとえば「日報自動化」「SNS分析」のような単位です。"
          actionLabel="プロジェクトを作る"
          actionHref="/projects"
        />
      ) : (
        <ul className="rows">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className="row row-block">
                <span className="row-main">{p.name}</span>
                <Progress done={p.progress.doneTasks} total={p.progress.totalTasks} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
