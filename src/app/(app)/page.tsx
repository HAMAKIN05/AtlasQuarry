import Link from 'next/link';

import { Dot } from '@/components/Ledger';
import { Badge, EmptyState, Progress } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import type { TaskPriority, TaskStatus } from '@/db/schema/enums';
import { listProducts } from '@/domain/product/service';
import { listRequests } from '@/domain/request/service';
import { listTasks, type TaskListItem } from '@/domain/task/service';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';
import { formatDate, formatRelative } from '@/lib/format';
import { PROJECT_STATUS_LABELS } from '@/lib/labels';

export const metadata = { title: 'ホーム | AtlasQuarry' };

const OPEN_STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'review'];
const PRIORITY_ORDER: Record<TaskPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export default async function WorkspaceHomePage() {
  const actor = await requireActor();
  const today = new Date().toISOString().slice(0, 10);
  const [tasks, projects, requests] = await Promise.all([
    listTasks({ assigneeId: actor.id, status: OPEN_STATUSES }),
    listProducts(),
    can(actor, 'request.triage') ? listRequests(['received', 'reviewing']) : Promise.resolve([]),
  ]);

  const nextTasks = [...tasks]
    .sort((a, b) => compareTasks(a, b, today))
    .slice(0, 5);
  const overdue = tasks.filter((task) => task.dueDate !== null && task.dueDate < today).length;
  const dueToday = tasks.filter((task) => task.dueDate === today).length;
  const activeProjects = projects.filter((project) => project.status === 'active' || project.status === 'planning');

  return (
    <div className="workspace-home flex flex-col gap-7">
      <header className="workspace-home-header">
        <div>
          <p className="eyebrow">仕事のハブ</p>
          <h1 className="large-title">おかえりなさい、{actor.name}さん</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            今日やること、判断が必要なこと、チームの進み具合をここから確認できます。
          </p>
        </div>
        <div className="home-actions">
          <Button asChild variant="outline">
            <Link href="/requests/new">要望を出す</Link>
          </Button>
          {can(actor, 'task.create') && (
            <Button asChild>
              <Link href="/tasks?new=1">タスクを追加</Link>
            </Button>
          )}
        </div>
      </header>

      <section className="focus-panel" aria-labelledby="focus-title">
        <div className="focus-panel-copy">
          <p className="eyebrow text-white/70">次の一手</p>
          <h2 id="focus-title">まず、自分の仕事を片づける</h2>
          <p>期限と優先度から、今見るべきタスクを並べています。</p>
          <Link href="/today" className="focus-panel-link">自分の仕事を開く <span aria-hidden="true">→</span></Link>
        </div>
        <div className="focus-metrics" aria-label="自分の仕事の状況">
          <Metric label="期限超過" value={overdue} tone={overdue > 0 ? 'danger' : 'light'} />
          <Metric label="今日まで" value={dueToday} tone="light" />
          <Metric label="未完了" value={tasks.length} tone="light" />
        </div>
      </section>

      <div className="workspace-grid">
        <section className="section-card workspace-grid-main" aria-labelledby="next-tasks-title">
          <SectionHeader
            eyebrow="MY WORK"
            title="次にやること"
            count={tasks.length}
            action={<Link href="/today" className="section-action">すべて見る →</Link>}
          />
          {nextTasks.length === 0 ? (
            <EmptyState
              title="今すぐ対応するタスクはありません"
          description="新しいタスクを追加するか、プロジェクトの予定を確認できます。"
          actionLabel={can(actor, 'task.create') ? 'タスクを追加' : 'プロジェクトを見る'}
              actionHref={can(actor, 'task.create') ? '/tasks?new=1' : '/projects'}
            />
          ) : (
            <div className="focus-list">
              {nextTasks.map((task, index) => (
                <Link key={task.id} href={`/tasks/${task.key}`} className="focus-item">
                  <span className={index === 0 ? 'focus-index focus-index-current' : 'focus-index'}>{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="focus-item-title">{task.title}</span>
                    <span className="focus-item-meta">
                      <span>{task.productName}</span>
                      <span className={task.dueDate !== null && task.dueDate < today ? 'text-destructive' : ''}>
                        {task.dueDate ? formatDate(task.dueDate) : '期限なし'}
                      </span>
                    </span>
                  </span>
                  <Badge tone={task.priority === 'urgent' ? 'danger' : task.status === 'in_progress' ? 'progress' : 'neutral'}>
                    {taskStatusLabel(task.status)}
                  </Badge>
                  <span className="chevron" aria-hidden="true" />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="section-card" aria-labelledby="decisions-title">
          <SectionHeader
            eyebrow="INBOX"
            title="判断待ち"
            count={requests.length}
            action={requests.length > 0 ? <Link href="/requests" className="section-action">受け付けを見る →</Link> : undefined}
          />
          {requests.length === 0 ? (
            <div className="section-empty">
              <span className="section-empty-icon">✓</span>
              <p>判断が必要な要望はありません。</p>
              <span>新しい相談はここに届きます。</span>
            </div>
          ) : (
            <div className="decision-list">
              {requests.slice(0, 3).map((request) => (
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
      </div>

      <section className="section-card" aria-labelledby="projects-title">
        <SectionHeader
          eyebrow="PROJECTS"
          title="プロジェクトの進み具合"
          count={activeProjects.length}
          action={<Link href="/projects" className="section-action">プロジェクトをすべて見る →</Link>}
        />
        {activeProjects.length === 0 ? (
          <EmptyState title="進行中のプロジェクトはありません" description="プロジェクトを作成すると、タスクと予定をまとめて管理できます。" actionLabel="プロジェクトを作る" actionHref="/projects/new" />
        ) : (
          <div className="project-snapshot-grid">
            {activeProjects.slice(0, 4).map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`} className="project-snapshot">
                <span className="flex items-start gap-3">
                  <Dot seed={project.key} />
                  <span className="min-w-0 flex-1">
                    <span className="project-snapshot-title">{project.name}</span>
                    <span className="project-snapshot-status">{PROJECT_STATUS_LABELS[project.status]}</span>
                  </span>
                  <span className="chevron" aria-hidden="true" />
                </span>
                <Progress className="mt-5" done={project.progress.doneTasks} total={project.progress.totalTasks} />
                <span className="project-snapshot-foot">
                  {project.nextDueDate ? `次の期限 ${formatDate(project.nextDueDate)}` : '期限なし'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function compareTasks(a: TaskListItem, b: TaskListItem, today: string) {
  const overdueA = a.dueDate !== null && a.dueDate < today;
  const overdueB = b.dueDate !== null && b.dueDate < today;
  if (overdueA !== overdueB) return overdueA ? -1 : 1;
  const dueA = a.dueDate ?? '9999-99-99';
  const dueB = b.dueDate ?? '9999-99-99';
  if (dueA !== dueB) return dueA.localeCompare(dueB);
  return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
}

function taskStatusLabel(status: TaskStatus) {
  return { backlog: '未着手', todo: '予定', in_progress: '作業中', review: '確認待ち', done: '完了', cancelled: '中止' }[status] ?? status;
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'danger' | 'light' }) {
  return (
    <div className={tone === 'danger' ? 'focus-metric focus-metric-danger' : 'focus-metric'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SectionHeader({ eyebrow, title, count, action }: { eyebrow: string; title: string; count: number; action?: React.ReactNode }) {
  return (
    <header className="section-card-header">
      <div>
        <p className="section-eyebrow">{eyebrow}</p>
        <h2>{title} <span className="section-count">{count}</span></h2>
      </div>
      {action}
    </header>
  );
}
