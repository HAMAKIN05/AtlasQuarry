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
  const active = ordered[0] ?? null;
  const queue = ordered.slice(1, 7);
  const activeProjects = projects.filter((project) => project.status === 'active' || project.status === 'planning');
  const overdue = tasks.filter((task) => task.dueDate !== null && task.dueDate < today).length;

  return (
    <div className="control-room">
      <header className="control-room-header">
        <div>
          <p className="control-room-kicker">ATLASQUARRY / WORKSPACE</p>
          <h1>いま動かすもの</h1>
          <p>迷う場所をなくし、受け取った仕事を次の一手まで進める作業台です。</p>
        </div>
        <div className="control-room-actions">
          <Link href="/search" className="control-search-link">⌕ <span>検索する</span></Link>
          {can(actor, 'task.create') && <Button asChild><Link href="/tasks?new=1">＋ タスク</Link></Button>}
        </div>
      </header>

      <div className="control-room-grid">
        <aside className="control-rail">
          <section className="control-rail-section control-inbox-rail" aria-labelledby="rail-inbox-title">
            <header className="control-rail-heading"><span className="control-rail-index">01</span><div><p>受け取る</p><h2 id="rail-inbox-title">受信箱 <b>{requests.length}</b></h2></div></header>
            {requests.length === 0 ? <p className="control-rail-empty">判断待ちはありません。</p> : (
              <div className="control-rail-list">
                {requests.slice(0, 4).map((request) => <Link key={request.id} href={`/requests/${request.id}`} className="control-inbox-row"><span className="control-unread-dot" /><span><strong>{request.title}</strong><small>{request.reporterName} · {formatRelative(request.createdAt)}</small></span></Link>)}
              </div>
            )}
            <Link href="/requests" className="control-rail-footer">受信箱を開く →</Link>
          </section>

          <section className="control-rail-section control-guide-rail" aria-label="作業台の使い方">
            <p className="control-rail-label">使い方</p>
            <ol><li><b>1</b><span>受信箱から判断する</span></li><li><b>2</b><span>作業リストを上から進める</span></li><li><b>3</b><span>プロジェクトで全体を見る</span></li></ol>
          </section>

          <Link href="/projects" className="control-projects-link"><span>プロジェクト</span><strong>{activeProjects.length}</strong><small>進行中のまとまり →</small></Link>
        </aside>

        <main className="control-stream">
          <header className="control-stream-heading"><div><p className="control-room-kicker">02 / DO</p><h2>作業リスト</h2></div><Link href="/today" className="control-text-link">すべてのタスク →</Link></header>
          {active ? <ActiveTask task={active} today={today} /> : <EmptyState title="作業リストは空です" description="タスクを追加するか、受信箱から要望を仕事に変えられます。" actionLabel={can(actor, 'task.create') ? 'タスクを追加' : '受信箱を見る'} actionHref={can(actor, 'task.create') ? '/tasks?new=1' : '/requests'} />}
          {queue.length > 0 && <div className="control-queue" aria-label="次に続くタスク">{queue.map((task, index) => <QueueRow key={task.id} task={task} index={index + 2} today={today} />)}</div>}

          <section className="control-project-strip" aria-labelledby="project-strip-title">
            <header><div><p className="control-room-kicker">03 / CONTEXT</p><h2 id="project-strip-title">プロジェクトで見る</h2></div><Link href="/projects" className="control-text-link">一覧 →</Link></header>
            <div className="control-project-list">{activeProjects.slice(0, 5).map((project) => <Link key={project.id} href={`/projects/${project.id}`} className="control-project-row"><span className="control-project-row-name">{project.name}</span><span className="control-project-row-status">{PROJECT_STATUS_LABELS[project.status]}</span><Progress done={project.progress.doneTasks} total={project.progress.totalTasks} /><span className="chevron" aria-hidden="true" /></Link>)}</div>
          </section>
        </main>

        <aside className="control-inspector" aria-label="作業状況">
          <div className="control-inspector-head"><p className="control-room-kicker">STATUS</p><h2>今日の状態</h2></div>
          <div className="control-status-big"><strong>{tasks.length}</strong><span>未完了タスク</span></div>
          <div className="control-status-list"><StatusLine label="期限超過" value={overdue} danger={overdue > 0} /><StatusLine label="作業中" value={tasks.filter((task) => task.status === 'in_progress').length} /><StatusLine label="判断待ち" value={requests.length} /></div>
          <div className="control-inspector-note"><span>TIP</span><p>{active ? '上から1件ずつ開けば、次にやることが決まります。' : 'タスクを捕まえると、ここに次の一手が表示されます。'}</p></div>
          <Link href="/today?view=activity" className="control-activity-link">チームの活動を見る →</Link>
        </aside>
      </div>
    </div>
  );
}

function ActiveTask({ task, today }: { task: TaskListItem; today: string }) {
  const late = task.dueDate !== null && task.dueDate < today;
  return <article className="control-active-task"><div className="control-active-top"><span className="control-active-badge">NEXT</span><Badge tone={task.priority === 'urgent' ? 'danger' : task.status === 'in_progress' ? 'progress' : 'neutral'}>{taskStatusLabel(task.status)}</Badge></div><Link href={`/tasks/${task.key}`} className="control-active-title">{task.title}</Link><div className="control-active-meta"><span>{task.productName}</span><span className={late ? 'is-late' : ''}>{task.dueDate ? (late ? `期限超過 · ${formatDate(task.dueDate)}` : formatDate(task.dueDate)) : '期限なし'}</span></div><div className="control-active-actions"><Button asChild><Link href={`/tasks/${task.key}`}>この仕事を開く →</Link></Button><span>作業中のタスクを一つずつ進めます</span></div></article>;
}

function QueueRow({ task, index, today }: { task: TaskListItem; index: number; today: string }) {
  const late = task.dueDate !== null && task.dueDate < today;
  return <Link href={`/tasks/${task.key}`} className="control-queue-row"><span className="control-queue-index">{String(index).padStart(2, '0')}</span><span className="control-queue-copy"><strong>{task.title}</strong><small>{task.productName} · <span className={late ? 'is-late' : ''}>{task.dueDate ? formatDate(task.dueDate) : '期限なし'}</span></small></span><Badge tone="neutral">{taskStatusLabel(task.status)}</Badge><span className="chevron" aria-hidden="true" /></Link>;
}

function StatusLine({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <div className="control-status-line"><span>{label}</span><strong className={danger ? 'is-late' : undefined}>{value}</strong></div>;
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
