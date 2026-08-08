import Link from 'next/link';

import { Badge, EmptyState } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import type { TaskPriority, TaskStatus } from '@/db/schema/enums';
import { listRequests } from '@/domain/request/service';
import { listTasks, type TaskListItem } from '@/domain/task/service';
import type { FeedRange, FeedTarget } from '@/domain/activity/feed';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';
import { formatDate, formatRelative } from '@/lib/format';
import { cn } from '@/lib/cn';

import { ActivityView } from './ActivityView';
import { TaskStatusMenu } from '../tasks/TaskStatusMenu';

export const metadata = { title: '自分の仕事 | AtlasQuarry' };

const OPEN_STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'review'];
const PRIORITY_ORDER: Record<TaskPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; filter?: string; range?: string; target?: string; day?: string }>;
}) {
  const actor = await requireActor();
  const q = await searchParams;

  if (q.view === 'activity') {
    return (
      <div className="flex flex-col gap-7">
        <WorkHeader actorName={actor.name} active="activity" />
        <ActivityView range={(q.range as FeedRange) ?? 'week'} target={(q.target as FeedTarget) ?? 'all'} day={q.day ?? null} />
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const [tasks, requests] = await Promise.all([
    listTasks({ assigneeId: actor.id, status: OPEN_STATUSES }),
    can(actor, 'request.triage') ? listRequests(['received', 'reviewing']) : Promise.resolve([]),
  ]);
  const sorted = [...tasks].sort((a, b) => compareTasks(a, b, today));
  const filter = q.filter === 'upcoming' || q.filter === 'all' ? q.filter : 'attention';
  const visible = sorted.filter((task) => {
    if (filter === 'all') return true;
    if (filter === 'upcoming') return task.dueDate === null || task.dueDate > today;
    return task.dueDate !== null && task.dueDate <= today || task.status === 'in_progress' || task.status === 'review';
  });
  const overdue = tasks.filter((task) => task.dueDate !== null && task.dueDate < today).length;
  const dueToday = tasks.filter((task) => task.dueDate === today).length;
  const inProgress = tasks.filter((task) => task.status === 'in_progress').length;

  return (
    <div className="my-work-page flex flex-col gap-7">
      <WorkHeader actorName={actor.name} active="work" />

      <section className="work-hero" aria-labelledby="work-hero-title">
        <div>
          <p className="eyebrow">今日の作業キュー</p>
          <h2 id="work-hero-title">迷ったら、上から1件ずつ進める</h2>
          <p>期限、状態、優先度をもとに、今見るべき順番で並べています。</p>
        </div>
        <div className="work-hero-stats">
          <WorkStat label="期限超過" value={overdue} danger={overdue > 0} />
          <WorkStat label="今日まで" value={dueToday} />
          <WorkStat label="作業中" value={inProgress} />
        </div>
      </section>

      <div className="work-layout">
        <section className="section-card work-queue" aria-labelledby="queue-title">
          <header className="section-card-header">
            <div>
              <p className="section-eyebrow">QUEUE</p>
              <h2 id="queue-title">自分のタスク <span className="section-count">{tasks.length}</span></h2>
            </div>
            <Button asChild size="sm">
              <Link href="/tasks?new=1">タスクを追加</Link>
            </Button>
          </header>
          <nav className="work-filter" aria-label="タスクの絞り込み">
            <FilterLink href="/today?filter=attention" active={filter === 'attention'}>要対応 {overdue + dueToday}</FilterLink>
            <FilterLink href="/today?filter=upcoming" active={filter === 'upcoming'}>これから</FilterLink>
            <FilterLink href="/today?filter=all" active={filter === 'all'}>すべて {tasks.length}</FilterLink>
          </nav>
          {visible.length === 0 ? (
            <EmptyState
              title={filter === 'attention' ? '今日対応するタスクはありません' : '表示できるタスクはありません'}
              description="次の期限を確認するか、新しいタスクを追加できます。"
              actionLabel="案件を確認する"
              actionHref="/projects"
            />
          ) : (
            <div className="work-task-list">
              {visible.map((task, index) => (
                <TaskQueueRow key={task.id} task={task} today={today} first={index === 0 && filter === 'attention'} />
              ))}
            </div>
          )}
        </section>

        <aside className="work-sidebar">
          <section className="section-card" aria-labelledby="work-inbox-title">
            <header className="section-card-header">
              <div>
                <p className="section-eyebrow">INBOX</p>
                <h2 id="work-inbox-title">判断待ち <span className="section-count">{requests.length}</span></h2>
              </div>
              <Link href="/requests" className="section-action">一覧 →</Link>
            </header>
            {requests.length === 0 ? (
              <div className="section-empty">判断が必要な要望はありません。</div>
            ) : (
              <div className="decision-list">
                {requests.slice(0, 4).map((request) => (
                  <Link key={request.id} href={`/requests/${request.id}`} className="decision-item">
                    <span className="decision-dot" />
                    <span className="min-w-0 flex-1">
                      <span className="decision-title">{request.title}</span>
                      <span className="decision-meta">{request.reporterName}さんから ・ {formatRelative(request.createdAt)}</span>
                    </span>
                    <span className="chevron" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="next-step-card">
            <span className="next-step-number">?</span>
            <div>
              <p className="section-eyebrow">次に迷ったら</p>
              <h2>案件からタスクを探す</h2>
              <p>担当や期限がまだ決まっていない仕事は、案件のタスク一覧から整理できます。</p>
              <Link href="/projects" className="section-action">案件を見る →</Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function WorkHeader({ actorName, active }: { actorName: string; active: 'work' | 'activity' }) {
  return (
    <header className="workspace-home-header">
      <div>
        <p className="eyebrow">{active === 'work' ? '自分の仕事' : 'チームの動き'}</p>
        <h1 className="large-title">{active === 'work' ? `${actorName}さんの仕事` : '活動'}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {active === 'work' ? '今日やることを決めて、止まっている仕事を前に進めます。' : '誰が何を動かしたかを、日付と対象からたどれます。'}
        </p>
      </div>
      <nav className="view-switcher" aria-label="自分の仕事の表示">
        <Link href="/today" className={cn(active === 'work' && 'view-switcher-active')}>自分の仕事</Link>
        <Link href="/today?view=activity" className={cn(active === 'activity' && 'view-switcher-active')}>活動を見る</Link>
      </nav>
    </header>
  );
}

function TaskQueueRow({ task, today, first }: { task: TaskListItem; today: string; first: boolean }) {
  const late = task.dueDate !== null && task.dueDate < today;
  return (
    <div className={first ? 'task-queue-row task-queue-row-first' : 'task-queue-row'}>
      <Link href={`/tasks/${task.key}`} className="task-queue-main">
        <span className={first ? 'focus-index focus-index-current' : 'focus-index'}>{first ? '→' : ' '}</span>
        <span className="min-w-0 flex-1">
          <span className="task-queue-title">{task.title}</span>
          <span className="task-queue-meta">
            <span>{task.productName}</span>
            <span className={late ? 'text-destructive' : ''}>{task.dueDate ? (late ? `期限超過 ${formatDate(task.dueDate)}` : formatDate(task.dueDate)) : '期限なし'}</span>
          </span>
        </span>
      </Link>
      <Badge tone={task.priority === 'urgent' ? 'danger' : task.status === 'in_progress' ? 'progress' : 'neutral'}>{taskStatusLabel(task.status)}</Badge>
      <TaskStatusMenu taskId={task.id} status={task.status} />
    </div>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return <Link href={href} className={cn('work-filter-link', active && 'work-filter-link-active')} aria-current={active ? 'page' : undefined}>{children}</Link>;
}

function WorkStat({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <div className="work-stat"><span>{label}</span><strong className={danger ? 'text-destructive' : ''}>{value}</strong></div>;
}

function compareTasks(a: TaskListItem, b: TaskListItem, today: string) {
  const lateA = a.dueDate !== null && a.dueDate < today;
  const lateB = b.dueDate !== null && b.dueDate < today;
  if (lateA !== lateB) return lateA ? -1 : 1;
  const date = (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99');
  if (date !== 0) return date;
  return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
}

function taskStatusLabel(status: TaskStatus) {
  return { backlog: '未着手', todo: '予定', in_progress: '作業中', review: '確認待ち', done: '完了', cancelled: '中止' }[status] ?? status;
}
