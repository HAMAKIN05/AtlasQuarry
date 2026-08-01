import Link from 'next/link';
import { Suspense } from 'react';

import { PanelFallback } from '@/components/Fallbacks';
import { listRecentActivity } from '@/domain/activity/queries';
import { listTasks } from '@/domain/task/service';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';
import {
  ACTIVITY_ACTION_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  formatDate,
  formatRelative,
  isOverdue,
} from '@/lib/format';

export const metadata = { title: 'ダッシュボード | AtlasQuarry' };

/** S-02 ダッシュボード。自分のタスク、期限超過、直近アクティビティ。 */
export default async function DashboardPage() {
  const actor = await requireActor();

  return (
    <div className="page">
      <h1 className="page-title">ダッシュボード</h1>

      <Suspense fallback={<PanelFallback label="自分のタスク" />}>
        <MyTaskPanels actorId={actor.id} />
      </Suspense>

      {/* 全件閲覧の権限がない場合は直近アクティビティを出さない（機能定義書 §3.2） */}
      {can(actor, 'activity.viewAll') && (
        <Suspense fallback={<PanelFallback label="直近のアクティビティ" />}>
          <RecentActivityPanel />
        </Suspense>
      )}
    </div>
  );
}

async function MyTaskPanels({ actorId }: { actorId: string }) {
  const myTasks = await listTasks({
    assigneeId: actorId,
    status: ['backlog', 'todo', 'in_progress', 'review'],
  });
  const overdue = myTasks.filter((t) => isOverdue(t.dueDate, t.status));

  return (
    <>
      <section className="panel" aria-labelledby="overdue-heading">
        <h2 id="overdue-heading" className="panel-title">
          期限超過（{overdue.length}）
        </h2>
        {overdue.length === 0 ? (
          <p className="empty">期限を過ぎたタスクはありません。</p>
        ) : (
          <ul className="task-list">
            {overdue.map((task) => (
              <li key={task.id}>
                <Link href={`/tasks/${task.key}`}>
                  <span className="task-key">{task.key}</span>
                  <span className="task-title">{task.title}</span>
                  <span className="task-due is-overdue">{formatDate(task.dueDate)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="mytasks-heading">
        <h2 id="mytasks-heading" className="panel-title">
          自分のタスク（{myTasks.length}）
        </h2>
        {myTasks.length === 0 ? (
          <p className="empty">担当しているタスクはありません。</p>
        ) : (
          <ul className="task-list">
            {myTasks.map((task) => (
              <li key={task.id}>
                <Link href={`/tasks/${task.key}`}>
                  <span className="task-key">{task.key}</span>
                  <span className="task-title">{task.title}</span>
                  <span className="task-status">{TASK_STATUS_LABELS[task.status]}</span>
                  <span className="task-priority">{TASK_PRIORITY_LABELS[task.priority]}</span>
                  <span
                    className={`task-due${isOverdue(task.dueDate, task.status) ? ' is-overdue' : ''}`}
                  >
                    {formatDate(task.dueDate)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

async function RecentActivityPanel() {
  const { items } = await listRecentActivity(10, 0);

  return (
    <section className="panel" aria-labelledby="activity-heading">
      <h2 id="activity-heading" className="panel-title">
        直近のアクティビティ
      </h2>
      {items.length === 0 ? (
        <p className="empty">まだ記録がありません。</p>
      ) : (
        <ul className="activity-list">
          {items.map((item) => (
            <li key={item.id}>
              <span className="activity-actor">{item.actorName}</span>
              <span className="activity-action">
                {ACTIVITY_ACTION_LABELS[item.action] ?? item.action}
              </span>
              <time className="activity-time" dateTime={item.createdAt.toISOString()}>
                {formatRelative(item.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
