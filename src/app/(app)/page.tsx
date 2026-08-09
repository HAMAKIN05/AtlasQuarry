import Link from 'next/link';

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

export const metadata = { title: '作業台 | AtlasQuarry' };

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

  const ordered = [...tasks].sort((a, b) => compareTasks(a, b, today));
  const focusTask = ordered[0] ?? null;
  const laterTasks = ordered.slice(1, 5);
  const activeProjects = projects.filter((project) => project.status === 'active' || project.status === 'planning');
  const overdue = tasks.filter((task) => task.dueDate !== null && task.dueDate < today).length;
  const dueToday = tasks.filter((task) => task.dueDate === today).length;
  const inProgress = tasks.filter((task) => task.status === 'in_progress').length;

  return (
    <div className="command-center">
      <header className="command-center-header">
        <div>
          <p className="command-kicker">WORK DESK / {formatDate(today)}</p>
          <h1>今日の仕事を、ここで動かす</h1>
          <p>次の一件を開き、判断待ちを片づけ、必要ならプロジェクトへ戻る。入口を一つにまとめています。</p>
        </div>
        <div className="command-account-line">
          <span className="command-avatar">{actor.name.slice(0, 1)}</span>
          <span>{actor.name}さんの作業台</span>
        </div>
      </header>

      <section className="capture-bar" aria-labelledby="capture-title">
        <div className="capture-copy">
          <span className="capture-command-mark">＋</span>
          <div>
            <h2 id="capture-title">思いついたら、ここから捕まえる</h2>
            <p>入力を迷わせないよう、目的ごとに3つだけ用意しています。</p>
          </div>
        </div>
        <div className="capture-actions">
          {can(actor, 'task.create') && <Button asChild size="sm"><Link href="/tasks?new=1">タスクを追加</Link></Button>}
          <Button asChild size="sm" variant="outline"><Link href="/requests/new">要望を出す</Link></Button>
          {can(actor, 'document.create') && <Button asChild size="sm" variant="ghost"><Link href="/projects">資料を残す</Link></Button>}
        </div>
      </section>

      <div className="command-board">
        <main className="command-main-column">
          <section className="focus-task-card" aria-labelledby="focus-task-title">
            <div className="focus-task-heading">
              <div>
                <p className="command-step">01 / NOW</p>
                <h2 id="focus-task-title">まず、これを進める</h2>
              </div>
              <Link href="/today" className="command-text-link">自分の仕事を見る →</Link>
            </div>
            {focusTask ? <FocusTask task={focusTask} today={today} /> : (
              <EmptyState
                title="今すぐ進めるタスクはありません"
                description="新しいタスクを捕まえるか、プロジェクトの予定を確認できます。"
                actionLabel={can(actor, 'task.create') ? 'タスクを追加' : 'プロジェクトを見る'}
                actionHref={can(actor, 'task.create') ? '/tasks?new=1' : '/projects'}
              />
            )}
            {laterTasks.length > 0 && (
              <div className="focus-task-next-list" aria-label="次に続くタスク">
                {laterTasks.map((task) => <CompactTask key={task.id} task={task} today={today} />)}
              </div>
            )}
          </section>

          <section className="command-projects-card" aria-labelledby="desk-projects-title">
            <div className="command-section-heading">
              <div><p className="command-step">03 / CONTEXT</p><h2 id="desk-projects-title">仕事のまとまり</h2></div>
              <Link href="/projects" className="command-text-link">すべて見る →</Link>
            </div>
            {activeProjects.length === 0 ? (
              <EmptyState title="プロジェクトはまだありません" description="仕事をまとめる場所を先に作ると、タスクと予定を一緒に管理できます。" actionLabel="プロジェクトを作る" actionHref="/projects/new" />
            ) : (
              <div className="desk-project-grid">
                {activeProjects.slice(0, 4).map((project) => (
                  <Link key={project.id} href={`/projects/${project.id}`} className="desk-project-card">
                    <span className="desk-project-name">{project.name}</span>
                    <span className="desk-project-meta">{PROJECT_STATUS_LABELS[project.status]} · {project.progress.doneTasks}/{project.progress.totalTasks}件</span>
                    <Progress className="mt-4" done={project.progress.doneTasks} total={project.progress.totalTasks} />
                    <span className="desk-project-due">{project.nextDueDate ? `次の期限 ${formatDate(project.nextDueDate)}` : '期限なし'}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </main>

        <aside className="command-side-column">
          <section className="decision-card" aria-labelledby="decision-title">
            <div className="command-section-heading">
              <div><p className="command-step">02 / DECIDE</p><h2 id="decision-title">判断待ち <span>{requests.length}</span></h2></div>
              <Link href="/requests" className="command-text-link">受信箱 →</Link>
            </div>
            {requests.length === 0 ? (
              <div className="decision-clear"><span>✓</span><p>判断待ちはありません。<small>新しい要望はここに届きます。</small></p></div>
            ) : (
              <div className="decision-stack">
                {requests.slice(0, 5).map((request) => (
                  <Link key={request.id} href={`/requests/${request.id}`} className="decision-row">
                    <span className="decision-row-dot" />
                    <span><strong>{request.title}</strong><small>{request.reporterName}さんから · {formatRelative(request.createdAt)}</small></span>
                    <span className="chevron" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="desk-pulse-card" aria-labelledby="pulse-title">
            <div className="command-section-heading"><div><p className="command-step">PULSE</p><h2 id="pulse-title">今の負荷</h2></div></div>
            <div className="desk-pulse-grid">
              <Pulse label="期限超過" value={overdue} danger={overdue > 0} />
              <Pulse label="今日まで" value={dueToday} />
              <Pulse label="作業中" value={inProgress} />
              <Pulse label="未完了" value={tasks.length} />
            </div>
            <Link href="/today" className="desk-pulse-footer">自分の仕事を整理する →</Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

function FocusTask({ task, today }: { task: TaskListItem; today: string }) {
  const late = task.dueDate !== null && task.dueDate < today;
  return (
    <Link href={`/tasks/${task.key}`} className="focus-task-main">
      <div className="focus-task-number">1</div>
      <div className="focus-task-copy">
        <span className="focus-task-title">{task.title}</span>
        <span className="focus-task-meta"><span>{task.productName}</span><span className={late ? 'is-late' : ''}>{task.dueDate ? (late ? `期限超過 · ${formatDate(task.dueDate)}` : formatDate(task.dueDate)) : '期限なし'}</span></span>
      </div>
      <Badge tone={task.priority === 'urgent' ? 'danger' : task.status === 'in_progress' ? 'progress' : 'neutral'}>{taskStatusLabel(task.status)}</Badge>
      <span className="focus-task-arrow" aria-hidden="true">開く&nbsp; →</span>
    </Link>
  );
}

function CompactTask({ task, today }: { task: TaskListItem; today: string }) {
  const late = task.dueDate !== null && task.dueDate < today;
  return <Link href={`/tasks/${task.key}`} className="focus-task-compact"><span className="compact-check" /><span className="min-w-0 flex-1"><strong>{task.title}</strong><small>{task.productName} · <span className={late ? 'is-late' : ''}>{task.dueDate ? formatDate(task.dueDate) : '期限なし'}</span></small></span><span className="chevron" aria-hidden="true" /></Link>;
}

function Pulse({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <div className={danger ? 'desk-pulse is-danger' : 'desk-pulse'}><span>{label}</span><strong>{value}</strong></div>;
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
