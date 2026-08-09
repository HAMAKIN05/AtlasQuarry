import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { asc, eq } from 'drizzle-orm';

import { Badge, Loading, priorityTone, taskStatusTone } from '@/components/app-ui';
import { db } from '@/db/client';
import { actor as actorTable } from '@/db/schema';
import { listTaskTimeline } from '@/domain/activity/queries';
import { listWorkLogs } from '@/domain/worklog/service';
import { listTaskComments } from '@/domain/comment/service';
import { findRequestByTaskId } from '@/domain/request/service';
import { loadLabels } from '@/domain/setting/labels';
import { getTaskByKey, listTasks } from '@/domain/task/service';
import { requireActor } from '@/lib/auth/cookies';
import type { SessionActor } from '@/lib/auth/session';
import { can } from '@/lib/auth/rbac';
import { NotFoundError } from '@/lib/errors';
import { dueLabel, formatDateFull, formatDateTime, isOverdue } from '@/lib/format';
import { ACTIVITY_ACTION_LABELS } from '@/lib/labels';
import { renderMarkdown } from '@/lib/markdown';

import { Attachments } from '@/components/Attachments';
import { listAttachments } from '@/domain/attachment/service';

import { TaskStatusMenu } from '../TaskStatusMenu';
import { WorkLogPanel } from './WorkLogPanel';

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
    <div className="task-workspace">
      <nav className="task-breadcrumb" aria-label="現在の場所">
        <Link href="/today">自分の仕事</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/projects/${task.productId}`}>{task.productName}</Link>
      </nav>

      <header className="task-cockpit">
        <div className="task-cockpit-copy">
          <p className="eyebrow">Task <span className="tabular">{task.key}</span></p>
          <h1>{task.title}</h1>
          <p>この仕事の状態・担当・期限を確認し、必要な情報をここに集めます。</p>
        </div>
        {editable && (
          <div className="task-cockpit-actions">
            <span className="task-action-label">状態を変更</span>
            <TaskStatusMenu taskId={task.id} status={task.status} />
          </div>
        )}
      </header>

      <dl className="task-summary-grid" aria-label="タスクの概要">
        <div className="task-summary-item"><dt>状態</dt><dd><Badge tone={taskStatusTone(task.status)}>{labels[`task.status.${task.status}`]}</Badge></dd></div>
        <div className="task-summary-item"><dt>優先度</dt><dd><Badge tone={priorityTone(task.priority)}>{labels[`task.priority.${task.priority}`]}</Badge></dd></div>
        <div className="task-summary-item"><dt>担当</dt><dd>{task.assigneeName ? `${task.assigneeName}さん` : '担当未定'}</dd></div>
        <div className="task-summary-item"><dt>登録者</dt><dd>{task.reporterName}さん</dd></div>
        <div className="task-summary-item"><dt>プロジェクト</dt><dd><Link href={`/projects/${task.productId}`} className="text-primary">{task.productName}</Link></dd></div>
        <div className="task-summary-item"><dt>期限</dt><dd className={isOverdue(task.dueDate, task.status) ? 'font-bold text-destructive' : undefined}>{due ? `${due} ・ ${formatDateFull(task.dueDate)}` : '期限なし'}</dd></div>
      </dl>

      {fromRequest && (
        <Link href={`/requests/${fromRequest.id}`} className="task-origin">
          <span>このタスクのきっかけ</span>
          <strong>{fromRequest.title}</strong>
          <span className="chevron" aria-hidden="true" />
        </Link>
      )}

      {/*
        **まとまり（親子）をここで見せる。**
        開発項目という別概念をやめ、既にある親子関係をそのまま使っている。
        画面には「親タスク」という技術用語を出さず「まとまり」と呼ぶ。
      */}
      <Suspense fallback={<Loading />}>
        <Relations task={task} />
      </Suspense>

      <section className="surface p-4">
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

      {editable && (
        <Suspense fallback={<Loading />}>
          <WorkLogs taskId={task.id} taskKey={task.key} isDone={task.status === 'done'} me={actor.name} />
        </Suspense>
      )}

      <Suspense fallback={<Loading />}>
        <AttachmentsPanel taskId={task.id} canEdit={editable} />
      </Suspense>

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
  const [members] = await Promise.all([
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
        startDate: task.startDate,
        dueDate: task.dueDate,
      }}
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
    <section className="surface p-4">
      <h2 className="mb-3 text-base font-bold">コメント（{comments.length}）</h2>

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">まだコメントはありません。気づいたことを書いておくと後で役に立ちます。</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {comments.map((comment, index) => (
            <li key={comment.id} className="rounded-md bg-raised p-3">
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
    <section className="surface p-4">
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


/**
 * まとまり（親子）の表示。
 *
 * - このタスクが誰かの子なら、**属しているまとまり**へのリンクを出す
 * - このタスクが子を持つなら、**まとまりとして中身**を出し、そこから追加できるようにする
 *
 * **1階層まで。** 子の下にさらに子は作らせない（追加の導線を出さない）。
 */
async function Relations({ task }: { task: { id: string; productId: string; parentTaskId: string | null } }) {
  const [siblings, labels] = await Promise.all([
    listTasks({ productId: task.productId }),
    loadLabels(),
  ]);

  const parent = task.parentTaskId
    ? (siblings.find((t) => t.id === task.parentTaskId) ?? null)
    : null;
  const children = siblings.filter((t) => t.parentTaskId === task.id);

  if (!parent && children.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      {parent && (
        <>
          <h2 className="band-heading">属しているまとまり</h2>
          <div className="card-list">
            <Link href={`/tasks/${parent.key}`} className="card flex items-center gap-3">
              <span className="card-title min-w-0 flex-1">{parent.title}</span>
              <span className="chevron" aria-hidden="true" />
            </Link>
          </div>
        </>
      )}

      {children.length > 0 && (
        <>
          <h2 className="band-heading">
            このまとまりの中身
            <span className="count">
              {children.filter((c) => c.status === 'done').length}/{children.length}
            </span>
          </h2>
          <div className="card-list">
            {children.map((c) => (
              <Link key={c.id} href={`/tasks/${c.key}`} className="card flex items-center gap-3">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="card-title">{c.title}</span>
                  <span className="stack-meta">
                    <Badge tone={taskStatusTone(c.status)}>{labels[`task.status.${c.status}`]}</Badge>
                    {c.assigneeName && <span>{c.assigneeName}</span>}
                  </span>
                </span>
                <span className="chevron" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </>
      )}

      {/* 子の下にさらに子は作らせない */}
      {!parent && (
        <Link
          href={`/tasks?projectId=${task.productId}&new=1&parentTaskId=${task.id}`}
          className="chip self-start"
        >
          ＋ このまとまりにタスクを追加
        </Link>
      )}
    </section>
  );
}


async function WorkLogs({
  taskId,
  taskKey,
  isDone,
  me,
}: {
  taskId: string;
  taskKey: string;
  isDone: boolean;
  me: string;
}) {
  const logs = await listWorkLogs(taskId);
  return (
    <WorkLogPanel
      taskKey={taskKey}
      isDone={isDone}
      myActorName={me}
      logs={logs.map((l) => ({
        id: l.id,
        actorName: l.actorName,
        minutes: l.minutes,
        workDate: l.workDate,
        note: l.note,
        source: l.source,
      }))}
    />
  );
}

async function AttachmentsPanel({ taskId, canEdit }: { taskId: string; canEdit: boolean }) {
  const files = await listAttachments('task', taskId);
  return (
    <Attachments
      targetType="task"
      targetId={taskId}
      canEdit={canEdit}
      initial={files.map((f) => ({
        id: f.id,
        filename: f.filename,
        sizeBytes: f.sizeBytes,
        mimeType: f.mimeType,
        uploaderName: f.uploaderName,
      }))}
    />
  );
}
