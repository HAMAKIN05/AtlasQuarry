import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { PanelFallback } from '@/components/Fallbacks';

import { asc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { actor as actorTable } from '@/db/schema';
import { listTaskTimeline } from '@/domain/activity/queries';
import { listTaskComments } from '@/domain/comment/service';
import { listFeatures } from '@/domain/product/service';
import { getTaskByKey } from '@/domain/task/service';
import { requireActor } from '@/lib/auth/cookies';
import type { SessionActor } from '@/lib/auth/session';
import { can } from '@/lib/auth/rbac';
import { NotFoundError } from '@/lib/errors';
import {
  ACTIVITY_ACTION_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  formatDate,
  formatDateTime,
  isOverdue,
} from '@/lib/format';
import { renderMarkdown } from '@/lib/markdown';

import { CommentForm } from './CommentForm';
import { DeleteCommentButton } from './DeleteCommentButton';
import { TaskEditor } from './TaskEditor';

type Props = { params: Promise<{ key: string }> };

async function loadTask(key: string) {
  try {
    return await getTaskByKey(key);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

export const metadata = { title: 'タスク | AtlasQuarry' };

/** S-06 タスク詳細。本文・コメント・タイムライン。 */
export default async function TaskDetailPage({ params }: Props) {
  const { key } = await params;

  // 認証を先に済ませる。存在判定を先にすると、未認証でもキーの有無を 404 の差で探れてしまう
  const actor = await requireActor();

  // notFound() は Promise のコールバックからではなく本流で呼ぶ。
  // .catch() の中から投げると Next が 404 ステータスに結び付けられず 200 で返ってしまう。
  const task = await loadTask(decodeURIComponent(key));
  if (!task) notFound();

  const bodyHtml = task.bodyMd ? await renderMarkdown(task.bodyMd) : '';
  const editable = can(actor, 'task.update', { assigneeId: task.assigneeId });

  return (
    <div className="page">
      <nav aria-label="パンくず" className="breadcrumb">
        <Link href={`/products/${task.productId}`}>{task.productKey}</Link>
        <Link href={`/board?productId=${task.productId}`}>かんばん</Link>
      </nav>

      <h1 className="page-title">
        <span className="task-key">{task.key}</span> {task.title}
      </h1>

      <dl className="task-meta">
        <div>
          <dt>ステータス</dt>
          <dd>{TASK_STATUS_LABELS[task.status]}</dd>
        </div>
        <div>
          <dt>優先度</dt>
          <dd>{TASK_PRIORITY_LABELS[task.priority]}</dd>
        </div>
        <div>
          <dt>担当者</dt>
          <dd>{task.assigneeName ?? '未割当'}</dd>
        </div>
        <div>
          <dt>起票者</dt>
          <dd>{task.reporterName}</dd>
        </div>
        <div>
          <dt>開発項目</dt>
          <dd>{task.featureName ?? '—'}</dd>
        </div>
        <div>
          <dt>期間</dt>
          <dd className={isOverdue(task.dueDate, task.status) ? 'is-overdue' : undefined}>
            {formatDate(task.startDate)} 〜 {formatDate(task.dueDate)}
          </dd>
        </div>
        <div>
          <dt>完了日時</dt>
          <dd>{formatDateTime(task.completedAt)}</dd>
        </div>
      </dl>

      <section className="panel" aria-labelledby="body-heading">
        <h2 id="body-heading" className="panel-title">
          本文
        </h2>
        {bodyHtml ? (
          // renderMarkdown が rehype-sanitize を通しているため、ここで入るのは検査済みのHTMLのみ
          <div className="markdown" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
        ) : (
          <p className="empty">本文はまだありません。</p>
        )}
      </section>

      {editable && (
        <Suspense fallback={<PanelFallback label="編集" />}>
          <EditorPanel task={task} canDelete={can(actor, 'task.delete')} />
        </Suspense>
      )}

      <Suspense fallback={<PanelFallback label="コメント" />}>
        <CommentsPanel taskId={task.id} actor={actor} />
      </Suspense>

      <Suspense fallback={<PanelFallback label="タイムライン" />}>
        <TimelinePanel taskId={task.id} />
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
      productId={task.productId}
    />
  );
}

async function CommentsPanel({
  taskId,
  actor,
}: {
  taskId: string;
  actor: SessionActor;
}) {
  const comments = await listTaskComments(taskId);
  // コメント本文も本文と同じ経路でサニタイズする。クライアント側で Markdown を描画しない
  const commentHtml = await Promise.all(comments.map((c) => renderMarkdown(c.bodyMd)));

  return (
    <section className="panel" aria-labelledby="comments-heading">
      <h2 id="comments-heading" className="panel-title">
        コメント（{comments.length}）
      </h2>

      {comments.length === 0 ? (
        <p className="empty">まだコメントはありません。</p>
      ) : (
        <ul className="comment-list">
          {comments.map((comment, index) => (
            <li key={comment.id} className="comment">
              <p className="comment-head">
                <span className="comment-author">{comment.authorName}</span>
                <time dateTime={comment.createdAt.toISOString()}>
                  {formatDateTime(comment.createdAt)}
                </time>
                {can(actor, 'comment.delete', { authorId: comment.authorId }) && (
                  <DeleteCommentButton commentId={comment.id} />
                )}
              </p>
              {/* renderMarkdown が rehype-sanitize を通しているため、入るのは検査済みのHTMLのみ */}
              <div
                className="markdown comment-body"
                dangerouslySetInnerHTML={{ __html: commentHtml[index]! }}
              />
            </li>
          ))}
        </ul>
      )}

      <CommentForm taskId={taskId} />
    </section>
  );
}

async function TimelinePanel({ taskId }: { taskId: string }) {
  const timeline = await listTaskTimeline(taskId);

  return (
    <section className="panel" aria-labelledby="timeline-heading">
      <h2 id="timeline-heading" className="panel-title">
        タイムライン
      </h2>
      {timeline.length === 0 ? (
        <p className="empty">まだ記録がありません。</p>
      ) : (
        <ol className="timeline">
          {timeline.map((item) => (
            <li key={item.id}>
              <time dateTime={item.createdAt.toISOString()}>{formatDateTime(item.createdAt)}</time>
              <span className="timeline-actor">{item.actorName}</span>
              <span className="timeline-action">
                {ACTIVITY_ACTION_LABELS[item.action] ?? item.action}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
