import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { asc, eq } from 'drizzle-orm';

import { Badge, Loading, PageHeader, priorityTone, taskStatusTone } from '@/components/app-ui';
import { db } from '@/db/client';
import { actor as actorTable } from '@/db/schema';
import { listTaskTimeline } from '@/domain/activity/queries';
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

import { TaskStatusMenu } from '../TaskStatusMenu';

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
      {/*
        **戻り先は1本にする。** 以前は「プロジェクト記号」と「タスク」の2つの文字リンクが
        並んでいて、どちらが戻るのか分からなかった。矢印付きの1本だけを置き、
        プロジェクトへの導線は下の情報欄から辿らせる。
        ブラウザの戻るは「直前へ」、この矢印は「この情報の親へ」と役割を分ける。
      */}
      {/*
        **戻り先はプロジェクト。** 以前は「タスク一覧」に戻していたが、
        タスクは必ずプロジェクトに属するので、案件の全体像へ戻れる方が役に立つ。
        いちばん案件の文脈を必要とする画面で、親へ戻れないのは筋が悪かった。
      */}
      <nav aria-label="戻る">
        <Link
          href={`/projects/${task.productId}`}
          className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground"
        >
          ← {task.productName}
        </Link>
      </nav>

      <PageHeader title={task.title} />
      <p className="-mt-2 tabular text-xs text-muted-foreground">{task.key}</p>

      {/*
        **状態はここで変える。** 編集フォームは本文・担当・期限をまとめて直すためのもので、
        「作業中にする」「完了にする」だけのために開かせるには重い。
        一覧の行と同じ操作をタイトルの直下に置き、状態変更の入口を揃える。
      */}
      {editable && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">状態</span>
          <TaskStatusMenu taskId={task.id} status={task.status} />
        </div>
      )}

      <div className="grid overflow-hidden rounded-lg border bg-surface sm:grid-cols-2">
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
          <dt>プロジェクト</dt>
          <dd>
            <Link href={`/projects/${task.productId}`} className="text-primary">
              {task.productName}
            </Link>
          </dd>
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
