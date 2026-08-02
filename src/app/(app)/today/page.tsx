import Link from 'next/link';
import { Suspense } from 'react';

import { Band, Dot, Row, Stack } from '@/components/Ledger';
import { EmptyState, Loading } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import type { TaskPriority, TaskStatus } from '@/db/schema/enums';
import { listProducts } from '@/domain/product/service';
import { listRequests } from '@/domain/request/service';
import { listTasks, type TaskListItem } from '@/domain/task/service';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';
import { formatDate, formatRelative } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { FeedRange, FeedTarget } from '@/domain/activity/feed';

import { ActivityView } from './ActivityView';
import { TaskStatusMenu } from '../tasks/TaskStatusMenu';

export const metadata = { title: '今日 | AtlasQuarry' };

/**
 * 「今日」。
 *
 * **今日処理すべきものだけを置く。**
 *
 * 以前はここに「今日やる（先頭1件を大きく）」「判断待ち」「直近の節目」
 * 「プロジェクト」を全部並べていた。使いにくかった理由は3つ。
 *
 *   - 先頭の大きな1件は**期限順の先頭を選んだだけ**で、「今日やる」根拠が無かった。
 *     期限超過が2件あるなら、片方だけを面積で重要そうに見せるべきではない
 *   - 期限超過のタスクが「今日やる」と「直近の節目」に**二度出ていた**
 *   - 「直近の節目」は他人の期限も含む全体の監視で、自分の次の操作を決める一覧ではない
 *
 * いまは **期限を過ぎたもの と 今日までのもの**（どちらも自分の担当）だけ。
 * 未来の期限・期限なしは出さない。**時刻も工数も無い**以上、それらを
 * 「次に進めるもの」として推すのは根拠が無い。棚卸しはタスク画面の仕事。
 */
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; range?: string; target?: string; day?: string }>;
}) {
  const actor = await requireActor();
  const canTriage = can(actor, 'request.triage');
  const q = await searchParams;

  /*
   * **活動はタブを増やさず、「今日」の中の見方にする。**
   * 下部タブは プロジェクト / 今日 / 予定 / 要望 の4本から増やさない。
   * 活動は毎日見るものではないので、5本目を占める理由がない。
   */
  const view = q.view === 'activity' ? 'activity' : 'today';

  return (
    <div className="flex flex-col gap-7">
      <h1 className="large-title">今日</h1>

      <nav className="-mx-1 -mt-3 flex gap-2 overflow-x-auto px-1 py-1" aria-label="見方">
        <Link href="/today" className={cn('chip')} aria-current={view === 'today' ? 'page' : undefined}>
          今日の対応
        </Link>
        <Link
          href="/today?view=activity"
          className={cn('chip')}
          aria-current={view === 'activity' ? 'page' : undefined}
        >
          活動
        </Link>
      </nav>

      {view === 'activity' ? (
        <Suspense fallback={<Loading label="活動を集めています" />}>
          <ActivityView
            range={(q.range as FeedRange) ?? 'week'}
            target={(q.target as FeedTarget) ?? 'all'}
            day={q.day ?? null}
          />
        </Suspense>
      ) : (
        <TodayView actorId={actor.id} canTriage={canTriage} />
      )}
    </div>
  );
}

function TodayView({ actorId, canTriage }: { actorId: string; canTriage: boolean }) {
  return (
    <>
      <Suspense fallback={<Loading label="今日の対応を探しています" />}>
        <TodayTasks actorId={actorId} />
      </Suspense>

      {canTriage && (
        <Suspense fallback={<Loading />}>
          <PendingDecisions />
        </Suspense>
      )}

      {/*
        **今日の仕事が無くても、プロジェクトへの入口は消さない。**
        今日やることが無いことと、案件を見る必要が無いことは別。
      */}
      <Suspense fallback={<Loading />}>
        <ActiveProjects />
      </Suspense>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * 今日の対応
 * ------------------------------------------------------------------ */

const SHOWN = 5;

/** 優先度と状態の並び。**同じ期限のとき、何を先に出すかを固定する。** */
const PRIORITY_ORDER: Record<TaskPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const STATUS_ORDER: Partial<Record<TaskStatus, number>> = {
  in_progress: 0,
  review: 1,
  todo: 2,
  backlog: 3,
};

async function TodayTasks({ actorId }: { actorId: string }) {
  const today = new Date().toISOString().slice(0, 10);

  const tasks = await listTasks({
    assigneeId: actorId,
    status: ['backlog', 'todo', 'in_progress', 'review'],
  });

  /*
   * **期限を過ぎたもの と 今日までのもの**だけ。未来と期限なしは出さない。
   * 並びは 期限超過 → 今日まで → 優先度 → 状態 で固定する。
   * 「なんとなく上にある」を無くさないと、上から順に潰せない。
   */
  const due = tasks
    .filter((task) => task.dueDate !== null && task.dueDate <= today)
    .sort(
      (a, b) =>
        a.dueDate!.localeCompare(b.dueDate!) ||
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
        (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9),
    );

  if (due.length === 0) {
    /*
     * **今日が空のときだけ、この先の予定を出す。**
     * 未来の期限を「今日の対応」に混ぜるのは根拠が無い（時刻も工数も無いので、
     * 何を今日やるべきかを機械が決められない）。ただし今日が空だからといって
     * 白紙を出すと、開いた人は何も分からないまま閉じる。
     * **今日やることが1件も無いときに限り**、次に来るものを別の見出しで出す。
     */
    const upcoming = tasks
      .filter((task) => task.dueDate !== null && task.dueDate > today)
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));

    return (
      <div className="flex flex-col gap-5">
        <EmptyState
          title="今日やることはありません"
          description="期限を過ぎたものも、今日までのものもありません。"
        />

        {upcoming.length > 0 && (
          <Band label="この先の予定" count={upcoming.length}>
            <Stack>
              {upcoming.slice(0, 3).map((task) => (
                <Row
                  key={task.id}
                  href={`/tasks/${task.key}`}
                  title={task.title}
                  meta={
                    <>
                      <span>{formatDate(task.dueDate)}</span>
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <Dot seed={task.productKey} />
                        <span className="min-w-0 truncate">{task.productName}</span>
                      </span>
                    </>
                  }
                />
              ))}
            </Stack>
          </Band>
        )}
      </div>
    );
  }

  const rest = due.length - SHOWN;

  return (
    <Band label="今日の対応" count={due.length}>
      <Stack>
        {due.slice(0, SHOWN).map((task) => (
          <Row
            key={task.id}
            href={`/tasks/${task.key}`}
            title={task.title}
            meta={<TodayMeta task={task} today={today} />}
            /*
             * **置く操作は状態変更だけ。**
             * 完了の丸は外した。「完了だけ丸、ほかの状態は詳細画面」という分断が無くなる。
             * 期限の変更と担当の付け替えはここに置かない。期限を動かすのは今日の消化ではなく
             * 計画の変更で、誤って先送りすると画面から問題が消える。担当の付け替えは
             * 相手の仕事を新たに発生させる操作なので、一覧の流れで即時実行させない。
             */
            trailing={<TaskStatusMenu taskId={task.id} status={task.status} />}
          />
        ))}
      </Stack>
      {rest > 0 && (
        <Link
          href="/tasks"
          className="px-1 py-2 text-sm font-semibold text-primary hover:underline"
        >
          残り {rest} 件をタスクで見る
        </Link>
      )}
    </Band>
  );
}

/** 行のわき。**期限超過か今日までかを言葉で言う。** 日付だけだと読み替えが要る。 */
function TodayMeta({ task, today }: { task: TaskListItem; today: string }) {
  const late = task.dueDate !== null && task.dueDate < today;

  return (
    <>
      <span data-late={late || undefined}>
        {late ? `期限超過 ${formatDate(task.dueDate)}` : '今日まで'}
      </span>
      {/* **プロジェクト名はリンクにする。** 案件の全体像へ戻れないと、ここで手が止まる */}
      <Link
        href={`/projects/${task.productId}`}
        className="inline-flex min-w-0 items-center gap-1.5 hover:underline"
      >
        <Dot seed={task.productKey} />
        <span className="min-w-0 truncate">{task.productName}</span>
      </Link>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * 判断待ち
 * ------------------------------------------------------------------ */

/**
 * 判断待ちの要望。判断できる役割にだけ、**今日の対応の次に**出す。
 *
 * 常に最上段だと「一日の作業」より「滞留の警告」が入口を支配する。
 * ここに判断の操作そのものは置かない（要望の中身を見ずに決めさせない）。
 */
async function PendingDecisions() {
  const requests = await listRequests(['received', 'reviewing']);
  if (requests.length === 0) return null;

  const rest = requests.length - 3;

  return (
    <Band label="あなたの判断待ち" count={requests.length}>
      <Stack>
        {requests.slice(0, 3).map((request) => (
          <Row
            key={request.id}
            href={`/requests/${request.id}`}
            title={request.title}
            meta={
              <>
                <span>{request.reporterName}さんから</span>
                <span data-late={waitingTooLong(request.createdAt) || undefined}>
                  {formatRelative(request.createdAt)}待ち
                </span>
              </>
            }
            trailing={
              <Button asChild size="sm" variant="outline">
                <Link href={`/requests/${request.id}`}>判断する</Link>
              </Button>
            }
          />
        ))}
      </Stack>
      {rest > 0 && (
        <Link
          href="/requests"
          className="px-1 py-2 text-sm font-semibold text-primary hover:underline"
        >
          残り {rest} 件の要望を見る
        </Link>
      )}
    </Band>
  );
}

/** 判断待ちが1週間を超えたら急ぐものとして扱う。 */
function waitingTooLong(createdAt: Date | string | null): boolean {
  if (!createdAt) return false;
  const at = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  return Date.now() - at.getTime() > 7 * 24 * 60 * 60 * 1000;
}


/* ------------------------------------------------------------------ *
 * 進行中のプロジェクト
 * ------------------------------------------------------------------ */

/** 「今日」からプロジェクトへ直行できるようにする。**常に出す。** */
async function ActiveProjects() {
  const projects = await listProducts();
  const active = projects.filter((p) => p.status === 'active' || p.status === 'planning');
  if (active.length === 0) return null;

  return (
    <Band label="進行中のプロジェクト" count={active.length}>
      <Stack>
        {active.slice(0, 5).map((p) => (
          <Row
            key={p.id}
            href={`/projects/${p.id}`}
            title={p.name}
            meta={
              <>
                <span>
                  {p.progress.totalTasks === 0
                    ? 'タスクなし'
                    : `${Math.round((p.progress.doneTasks / p.progress.totalTasks) * 100)}% 完了`}
                </span>
                {p.nextDueDate && <span>次の期限 {formatDate(p.nextDueDate)}</span>}
              </>
            }
          />
        ))}
      </Stack>
    </Band>
  );
}
