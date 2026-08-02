import { PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

import { TaskCheck } from '@/components/TaskCheck';
import { Band, Dot, Hero, Row, Stack } from '@/components/Ledger';
import { EmptyState, Loading } from '@/components/app-ui';
import { listRequests } from '@/domain/request/service';
import { listTasks, type TaskListItem } from '@/domain/task/service';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';
import { formatDate, formatRelative, isOverdue } from '@/lib/format';

export const metadata = { title: 'ホーム | AtlasQuarry' };

/**
 * ホーム。
 *
 * **「状況を報告する画面」から「次の一手を出す画面」に作り替えた。**
 *
 * 以前は 挨拶 → 3つの指標 → 予定（ガント）→ 案件進捗 → 自分のタスク という
 * 典型的なダッシュボードだった。整ってはいたが、毎日使う3人には
 *
 *   - 「こんにちは、○○さん」「経営者として使っています」が説明過多
 *   - 「全体の進み 0%」は報告用の数字で、誰の行動にもつながらない
 *   - ガントは「ちゃんとした PM ツール」に見せる記号だが、スマホでは横スクロール前提
 *
 * だった。**カードをやめても「3指標を見せるダッシュボード」の構文が残っていた。**
 *
 * いまは最上部が「いま動かすこと」の1ブロックだけ。役割で中身を変える。
 * 数字と一覧は下に置き、必要な人が下りて見る。
 */
export default async function HomePage() {
  const actor = await requireActor();
  const canTriage = can(actor, 'request.triage');

  return (
    <div className="flex flex-col gap-7">
      {/*
        **ダッシュボードをやめて「今日」にした。**
        入口が「状況の一覧」だと、作業を始める前に読む時間が要る。
        上から「今日やる → 判断待ち → 期限が近い」の順に、
        **自分がいま動かすものだけ**を出す。プロジェクトの一覧はタブへ移した。
      */}
      <h1 className="text-2xl font-bold tracking-tight">今日</h1>

      <Suspense fallback={<Loading label="今日やることを探しています" />}>
        <TodayWork actorId={actor.id} />
      </Suspense>

      {canTriage && (
        <Suspense fallback={<Loading />}>
          <PendingDecisions />
        </Suspense>
      )}

      <Suspense fallback={<Loading />}>
        <Milestones />
      </Suspense>

      {/* どの画面からでも頭から出せるように、追加は常に手前に置く */}
      <Link href="/requests/new" className="fab">
        <PlusIcon className="size-5" aria-hidden="true" />
        要望を出す
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 今日やる
 * ------------------------------------------------------------------ */

/**
 * 自分の担当のうち、**今日動かすもの**。
 *
 * 期限を過ぎたもの → 今日まで → それ以外、の順。先頭の1件だけを大きく置き、
 * 残りはカードで積む。**面積が優先順位を伝える**ので、件数の説明が要らない。
 */
async function TodayWork({ actorId }: { actorId: string }) {
  const tasks = await openTasksOf(actorId);

  if (tasks.length === 0) {
    return (
      <EmptyState
        title="今日やることはありません"
        description="担当のタスクが割り当てられるか、要望から作られると、ここに並びます。"
        actionLabel="タスクを見る"
        actionHref="/tasks"
      />
    );
  }

  const [head, ...rest] = tasks;

  return (
    <div className="flex flex-col gap-5">
      <Hero
        href={`/tasks/${head!.key}`}
        overline={heroReason(head!)}
        title={head!.title}
        meta={<FocusMeta task={head!} />}
        action="このタスクを開く"
      />

      {rest.length > 0 && (
        <Band label="このあと" count={rest.length}>
          <Stack>
            {rest.slice(0, 5).map((task) => (
              <Row
                key={task.id}
                lead={<TaskCheck taskId={task.id} status={task.status} title={task.title} />}
                href={`/tasks/${task.key}`}
                title={task.title}
                meta={<FocusMeta task={task} />}
              />
            ))}
          </Stack>
        </Band>
      )}
    </div>
  );
}

/**
 * 判断待ちの要望。
 *
 * **入口の最上段には置かない。** 常に一番上だと「一日の作業」より
 * 「滞留の警告」が入口を支配する。今日やることの次に置く。
 */
async function PendingDecisions() {
  const requests = await listRequests(['received', 'reviewing']);
  if (requests.length === 0) return null;

  return (
    <Band label="あなたの判断待ち" count={requests.length}>
      <Stack>
        {requests.slice(0, 5).map((request) => (
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
          />
        ))}
      </Stack>
    </Band>
  );
}

/* ------------------------------------------------------------------ *
 * 最上部。役割で「いま動かすこと」の中身を変える
 * ------------------------------------------------------------------ */

/** 判断待ちが1週間を超えたら急ぐものとして扱う。 */
function waitingTooLong(createdAt: Date | string | null): boolean {
  if (!createdAt) return false;
  const at = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  return Date.now() - at.getTime() > 7 * 24 * 60 * 60 * 1000;
}

/** 先頭に置いた理由。期限超過 → 今日まで → それ以外、の順に強い理由を返す。 */
function heroReason(task: TaskListItem): string {
  if (isOverdue(task.dueDate, task.status)) return '期限を過ぎています';
  if (task.dueDate && task.dueDate === new Date().toISOString().slice(0, 10)) return '今日までです';
  return '次に進めるもの';
}

function FocusMeta({ task }: { task: TaskListItem }) {
  const late = isOverdue(task.dueDate, task.status);
  return (
    <>
      {/* **点でプロジェクトを示す。** 名前だけだと、どの案件の話か毎回読まないと分からない */}
      <span className="inline-flex items-center gap-1.5">
        <Dot seed={task.productKey} />
        {task.productKey}
      </span>
      {task.dueDate && (
        <span data-late={late || undefined}>
          {late ? '期限超過 ' : '期限 '}
          {formatDate(task.dueDate)}
        </span>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * 直近の節目
 * ------------------------------------------------------------------ */

/**
 * **ホームからガントを外し、日付順の短いリストに置き換えた。**
 *
 * ガントは計画を調整するときの道具で、開くたびに読むものではない。スマホでは
 * 横スクロールが前提になり、「今日へ」のような操作説明も要る。ホームで毎日
 * 見せるほど、時間計画が主要業務であるかのように見えてしまう。
 *
 * ガント自体はプロジェクト詳細に残してある（`/projects/[id]?view=gantt`）。
 */
async function Milestones() {
  const tasks = await listTasks({ status: ['backlog', 'todo', 'in_progress', 'review'] });

  const dated = tasks
    .filter((task) => task.dueDate !== null)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  const late = dated.filter((task) => isOverdue(task.dueDate, task.status));
  const upcoming = dated.filter((task) => !isOverdue(task.dueDate, task.status));
  // 期限も開始日も入っていないもの。**放置されると誰にも見えない**ので明示する
  const undated = tasks.filter((task) => task.dueDate === null && task.startDate === null);

  return (
    <section className="content-section" aria-label="直近の節目">
      <div className="section-heading">
        <div>
          <h2>直近の節目</h2>
        </div>
        <Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground">
          日程を調整する
        </Link>
      </div>

      {dated.length === 0 && undated.length === 0 ? (
        <p className="empty-inline">
          期限のあるタスクはまだありません。タスクに期限を入れると、ここに日付順で並びます。
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {late.length > 0 && <MilestoneGroup label="期限超過" tasks={late} late />}
          {upcoming.length > 0 && <MilestoneGroup label="次の期限" tasks={upcoming.slice(0, 5)} />}
          {undated.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="text-xs font-semibold text-subtle">日程が未定</h3>
              <p className="text-sm text-muted-foreground">
                {undated.length} 件のタスクに開始日も期限も入っていません。
                <Link href="/tasks" className="ml-1 text-primary hover:underline">
                  タスクを見る
                </Link>
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function MilestoneGroup({
  label,
  tasks,
  late = false,
}: {
  label: string;
  tasks: TaskListItem[];
  late?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="px-1 text-[0.82rem] font-bold text-muted-foreground">{label}</h3>
      {/* **1件ずつ独立したカードにする。** 表に見せない */}
      <div className="card-list">
        {tasks.map((task) => (
          <Link key={task.id} href={`/tasks/${task.key}`} className="card flex items-center gap-3">
            <span
              className={
                late
                  ? 'tabular w-16 shrink-0 text-sm font-bold text-destructive'
                  : 'tabular w-16 shrink-0 text-sm font-semibold text-muted-foreground'
              }
            >
              {formatDate(task.dueDate)}
            </span>
            <span className="min-w-0 flex-1 text-[1rem] leading-snug font-semibold">
              {task.title}
            </span>
            {task.assigneeName && (
              <span className="min-w-0 max-w-24 truncate text-xs text-muted-foreground">
                {task.assigneeName}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

async function openTasksOf(actorId: string): Promise<TaskListItem[]> {
  const tasks = await listTasks({
    assigneeId: actorId,
    status: ['backlog', 'todo', 'in_progress', 'review'],
  });

  return tasks.sort((a, b) => {
    if (a.dueDate === b.dueDate) return 0;
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });
}
