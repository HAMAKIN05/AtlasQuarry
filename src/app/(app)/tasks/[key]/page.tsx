import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { asc, eq } from 'drizzle-orm';

import { Badge, Loading, PageHeader, priorityTone, taskStatusTone } from '@/components/app-ui';
import { db } from '@/db/client';
import { actor as actorTable } from '@/db/schema';
import { listTaskTimeline } from '@/domain/activity/queries';
import { listTaskComments } from '@/domain/comment/service';
import { listFeatures } from '@/domain/product/service';
import { findRequestByTaskId } from '@/domain/request/service';
import { loadLabels } from '@/domain/setting/labels';
import { getTaskByKey } from '@/domain/task/service';
import { requireActor } from '@/lib/auth/cookies';
import type { SessionActor } from '@/lib/auth/session';
import { can } from '@/lib/auth/rbac';
import { NotFoundError } from '@/lib/errors';
import { dueLabel, formatDateFull, formatDateTime, isOverdue } from '@/lib/format';
import { ACTIVITY_ACTION_LABELS } from '@/lib/labels';
import { renderMarkdown } from '@/lib/markdown';

import { CommentForm } from './CommentForm';
import { DeleteCommentButton } from './DeleteCommentButton';
import { TaskEditor } from './TaskEditor';

type Props = { params: Promise<{ key: string }> };

export const metadata = { title: 'タスク | AtlasQuarry' };

async function loadTask(key: string) {
  try {
    return await getTaskByKey(key);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

/** S-06 タスク詳細。本文・コメント・履歴。 */
export default async function TaskDetailPage({ params }: Props) {
  const actor = await requireActor();
  const { key } = await params;

  // notFound() は Promise のコールバックからではなく本流で呼ぶ。
  // .catch() の中から投げると Next が 404 ステータスに結び付けられず 200 で返ってしまう。
  const task = await loadTask(decodeURIComponent(key));
  if (!task) notFound();

  const [labels, bodyHtml, fromRequest] = await Promise.all([
    loadLabels(),
    task.bodyMd ? renderMarkdown(task.bodyMd) : Promise.resolve(''),
    findRequestByTaskId(task.id),
  ]);

  const editable = can(actor, 'task.update', { assigneeId: task.assigneeId });
  const due = dueLabel(task.dueDate, task.status);

  return (
    <div className="flex flex-col gap-5">
      <nav className="flex flex-wrap items-center gap-3 text-sm" aria-label="現在の場所">
        <Link href={`/projects/${task.productId}`}>{task.productKey}</Link>
        <Link href={`/tasks?projectId=${task.productId}`}>タスク</Link>
      </nav>

      <PageHeader title={task.title} />
      <p className="-mt-2 font-mono text-xs text-muted-foreground">{task.key}</p>

      <div className="grid overflow-hidden rounded-lg border bg-card sm:grid-cols-2">
        <div>
          <dt>状態</dt>
          <dd>
            <Badge tone={taskStatusTone(task.status)}>{labels[`task.status.${task.status}`]}</Badge>
          </dd>
        </div>
        <div>
          <dt>優先度</dt>
          <dd>
            <Badge tone={priorityTone(task.priority)}>
              {labels[`task.priority.${task.priority}`]}
            </Badge>
          </dd>
        </div>
        <div>
          <dt>担当</dt>
          <dd>{task.assigneeName ? `${task.assigneeName}さん` : 'まだ決まっていません'}</dd>
        </div>
        <div>
          <dt>作った人</dt>
          <dd>{task.reporterName}さん</dd>
        </div>
        <div>
          <dt>開発項目</dt>
          <dd>{task.featureName ?? '—'}</dd>
        </div>
        <div>
          <dt>期限</dt>
          <dd className={isOverdue(task.dueDate, task.status) ? 'font-bold text-destructive' : undefined}>
            {due ? `${due}（${formatDateFull(task.dueDate)}）` : '—'}
          </dd>
        </div>
      </div>

      {fromRequest && (
        <p className="mb-3 text-sm text-muted-foreground">
          この作業は要望から作られました。
          <Link href={`/requests/${fromRequest.id}`}>「{fromRequest.title}」を見る</Link>
        </p>
      )}

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-base font-bold">内容</h2>
        {bodyHtml ? (
          // renderMarkdown が rehype-sanitize を通しているため、入るのは検査済みのHTMLのみ
          <div className="markdown" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
        ) : (
          <p className="text-sm text-muted-foreground">まだ書かれていません。下の「編集」から追記できます。</p>
        )}
      </section>

      {editable && (
        <Suspense fallback={<Loading />}>
          <EditorPanel task={task} canDelete={can(actor, 'task.delete')} />
        </Suspense>
      )}

      <Suspense fallback={<Loading />}>
        <CommentsPanel taskId={task.id} actor={actor} />
      </Suspense>

      <Suspense fallback={<Loading />}>
        <HistoryPanel taskId={task.id} />
      </Suspense>
    </div>
  );
}

async function EditorPanel({
  task,
  canDelete,
}: {
  task: Awaited<ReturnType<typeof getTaskByKey>>;
  canDelete: boolean;
}) {
  const [features, members] = await Promise.all([
    listFeatures(task.productId),
    db
      .select({ id: actorTable.id, name: actorTable.name })
      .from(actorTable)
      .where(eq(actorTable.isActive, true))
      .orderBy(asc(actorTable.name)),
  ]);

  return (
    <TaskEditor
      task={{
        id: task.id,
        title: task.title,
        bodyMd: task.bodyMd,
        status: task.status,
        priority: task.priority,
        assigneeId: task.assigneeId,
        featureId: task.featureId,
        startDate: task.startDate,
        dueDate: task.dueDate,
      }}
      features={features.map((f) => ({ id: f.id, name: f.name }))}
      members={members}
      canDelete={canDelete}
      projectId={task.productId}
    />
  );
}

async function CommentsPanel({ taskId, actor }: { taskId: string; actor: SessionActor }) {
  const comments = await listTaskComments(taskId);
  // コメント本文も本文と同じ経路でサニタイズする。クライアント側で Markdown を描画しない
  const commentHtml = await Promise.all(comments.map((c) => renderMarkdown(c.bodyMd)));

  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 text-base font-bold">コメント（{comments.length}）</h2>

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">まだコメントはありません。気づいたことを書いておくと後で役に立ちます。</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {comments.map((comment, index) => (
            <li key={comment.id} className="rounded-md border p-3">
              <p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-bold text-foreground">{comment.authorName}さん</span>
                <time dateTime={comment.createdAt.toISOString()}>
                  {formatDateTime(comment.createdAt)}
                </time>
                {can(actor, 'comment.delete', { authorId: comment.authorId }) && (
                  <DeleteCommentButton commentId={comment.id} />
                )}
              </p>
              {/* renderMarkdown が rehype-sanitize を通しているため、入るのは検査済みのHTMLのみ */}
              <div className="markdown" dangerouslySetInnerHTML={{ __html: commentHtml[index]! }} />
            </li>
          ))}
        </ul>
      )}

      <CommentForm taskId={taskId} />
    </section>
  );
}

async function HistoryPanel({ taskId }: { taskId: string }) {
  const timeline = await listTaskTimeline(taskId);

  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 text-base font-bold">履歴</h2>
      {timeline.length === 0 ? (
        <p className="text-sm text-muted-foreground">まだ記録がありません。</p>
      ) : (
        <ol className="flex flex-col">
          {timeline.map((item) => (
            <li key={item.id}>
              <time dateTime={item.createdAt.toISOString()}>{formatDateTime(item.createdAt)}</time>
              <span>
                <strong>{item.actorName}さん</strong>が
                {ACTIVITY_ACTION_LABELS[item.action] ?? item.action}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
