import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

import { TaskCheck } from '@/components/TaskCheck';
import { EmptyState, Loading, Progress } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { listProducts } from '@/domain/product/service';
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
    <div className="flex flex-col gap-8">
      <Suspense fallback={<Loading label="いま動かすことを探しています" />}>
        {canTriage ? (
          <DecisionsFirst actorId={actor.id} />
        ) : (
          <MyWorkFirst actorId={actor.id} />
        )}
      </Suspense>

      <Suspense fallback={<Loading />}>
        <Milestones />
      </Suspense>

      <Suspense fallback={<Loading />}>
        <ProjectOverview />
      </Suspense>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 最上部。役割で「いま動かすこと」の中身を変える
 * ------------------------------------------------------------------ */

/**
 * 経営者・管理者向け。**自分が止めている判断**を先に出す。
 *
 * 判断待ちが無いときだけ、自分の担当タスクに落とす。「0件です」で終わらせると
 * ホームが空になる。
 */
async function DecisionsFirst({ actorId }: { actorId: string }) {
  const [requests, myTasks] = await Promise.all([
    listRequests(['received', 'reviewing']),
    openTasksOf(actorId),
  ]);

  if (requests.length === 0) {
    return (
      <FocusSection
        title="いま動かすこと"
        /*
         * **何の一覧なのかを言う。** 「判断待ちの要望はありません。」だけを出して
         * その下にタスクを並べると、本番の画面では否定文の直後に用件が続いて
         * 噛み合わなかった。落とし先を明示する。
         */
        note={
          myTasks.length === 0
            ? '判断待ちの要望はありません。'
            : '判断待ちの要望はありません。代わりに、あなたの担当タスクを出しています。'
        }
        seeAll={myTasks.length > 3 ? { href: '/tasks', label: 'タスクをすべて見る' } : undefined}
      >
        {myTasks.length === 0 ? (
          <EmptyState
            title="手元に動かすものはありません"
            description="要望が出されるか、タスクが割り当てられると、ここに用件が並びます。"
            actionLabel="要望を見る"
            actionHref="/requests"
          />
        ) : (
          <ul>
            {myTasks.slice(0, 3).map((task) => (
              <TaskFocusRow key={task.id} task={task} />
            ))}
          </ul>
        )}
      </FocusSection>
    );
  }

  return (
    <FocusSection
      title="いま動かすこと"
      note={`${requests.length} 件の要望が、あなたの判断で止まっています。`}
      seeAll={requests.length > 3 ? { href: '/requests', label: '要望をすべて見る' } : undefined}
    >
      <ul>
        {requests.slice(0, 3).map((request) => (
          <li key={request.id} className="focus-row">
            <Link href={`/requests/${request.id}`} className="focus-title hover:underline">
              {request.title}
            </Link>
            <p className="focus-meta">
              <span>{request.reporterName}さんから</span>
              {/*
                要望に期限は無い（テーブルに持っていない。勝手に足さない）。
                判断待ちの列で効くのは締切より**どれだけ待たせているか**なので、
                起票からの経過を出す。1週間を超えたら急ぐものとして色を付ける。
              */}
              <span data-late={waitingTooLong(request.createdAt)}>
                {formatRelative(request.createdAt)}から待っています
              </span>
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link href={`/requests/${request.id}`}>この要望を判断する</Link>
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {/*
        **判断待ちで埋まっても、自分の担当タスクが見えなくなるようにしない。**
        管理者もタスクを持つ。判断だけを出すと、ホームが「決める人の画面」に寄りすぎて
        自分の作業が見えなくなる、という指摘への対応。
      */}
      {myTasks.length > 0 && (
        <div className="mt-4 flex flex-col gap-1">
          <h2 className="text-xs font-semibold text-subtle">あなたの担当</h2>
          <ul>
            {myTasks.slice(0, 3).map((task) => (
              <TaskFocusRow key={task.id} task={task} />
            ))}
          </ul>
        </div>
      )}
    </FocusSection>
  );
}

/** 判断待ちが1週間を超えたら急ぐものとして扱う。 */
function waitingTooLong(createdAt: Date | string | null): boolean {
  if (!createdAt) return false;
  const at = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  return Date.now() - at.getTime() > 7 * 24 * 60 * 60 * 1000;
}

/** 開発者向け。**期限を過ぎたもの → 期限が近いもの**の順に、最大5件。 */
async function MyWorkFirst({ actorId }: { actorId: string }) {
  const tasks = await openTasksOf(actorId);
  const late = tasks.filter((task) => isOverdue(task.dueDate, task.status));

  return (
    <FocusSection
      title="いま動かすこと"
      note={
        tasks.length === 0
          ? undefined
          : late.length > 0
            ? `${late.length} 件が期限を過ぎています。`
            : `担当しているタスクが ${tasks.length} 件あります。`
      }
      seeAll={tasks.length > 5 ? { href: '/tasks', label: 'タスクをすべて見る' } : undefined}
    >
      {tasks.length === 0 ? (
        <EmptyState
          title="担当しているタスクはありません"
          description="タスクは要望から作るか、タスク画面で直接追加できます。"
          actionLabel="タスクを見る"
          actionHref="/tasks"
        />
      ) : (
        <ul>
          {tasks.slice(0, 5).map((task) => (
            <TaskFocusRow key={task.id} task={task} />
          ))}
        </ul>
      )}
    </FocusSection>
  );
}

/** 用件1行。**タイトルを主役にし、わきは相手と期限だけ。** その場で完了にできる。 */
function TaskFocusRow({ task }: { task: TaskListItem }) {
  const late = isOverdue(task.dueDate, task.status);

  return (
    <li className="focus-row">
      <div className="flex items-start gap-3">
        <span className="pt-0.5">
          <TaskCheck taskId={task.id} status={task.status} title={task.title} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link href={`/tasks/${task.key}`} className="focus-title hover:underline">
            {task.title}
          </Link>
          <p className="focus-meta">
            <span>{task.productKey}</span>
            {task.dueDate && (
              <span data-late={late}>
                {late ? '期限超過 ' : '期限 '}
                {formatDate(task.dueDate)}
              </span>
            )}
          </p>
        </div>
      </div>
    </li>
  );
}

/**
 * 最上部の枠。
 *
 * 見出しは1つだけ大きくする。**画面内で一番大きい文字がここになるようにして、
 * 開いた人の視線が最初にここへ行くようにする。**
 */
function FocusSection({
  title,
  note,
  seeAll,
  children,
}: {
  title: string;
  note?: string;
  seeAll?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <div className="flex min-h-11 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
        {seeAll && (
          <Link href={seeAll.href} className="text-sm text-muted-foreground hover:text-foreground">
            {seeAll.label}
          </Link>
        )}
      </div>
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      {children}
    </section>
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
    <div className="flex flex-col gap-1">
      <h3 className="text-xs font-semibold text-subtle">{label}</h3>
      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            <Link href={`/tasks/${task.key}`} className="row-link">
              <span
                className={
                  late
                    ? 'tabular w-16 shrink-0 text-xs font-bold text-destructive'
                    : 'tabular w-16 shrink-0 text-xs text-muted-foreground'
                }
              >
                {formatDate(task.dueDate)}
              </span>
              <span className="min-w-0 flex-1 basis-40">{task.title}</span>
              {task.assigneeName && (
                /*
                 * 右端に置くものは**縮められるようにする。** `shrink-0` だと
                 * 実機の書体がこちらより数px広いだけで押し出されて切られる。
                 */
                <span className="min-w-0 max-w-28 truncate text-xs text-muted-foreground">
                  {task.assigneeName}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * プロジェクト
 * ------------------------------------------------------------------ */

async function ProjectOverview() {
  const projects = await listProducts();

  return (
    <section className="content-section">
      <div className="section-heading">
        <div>
          <h2>プロジェクト</h2>
        </div>
        {projects.length > 0 && (
          <Button asChild variant="ghost" size="sm">
            <Link href="/projects">
              すべて見る
              <ArrowRightIcon />
            </Link>
          </Button>
        )}
      </div>
      {projects.length === 0 ? (
        <EmptyState
          title="プロジェクトがまだありません"
          description="内製化する対象ごとに作ります。たとえば「日報自動化」「SNS分析」のような単位です。"
          actionLabel="プロジェクトを作る"
          actionHref="/projects"
        />
      ) : (
        <ul>
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="flex min-h-12 flex-col gap-1 border-b border-border px-1 py-2.5 last:border-b-0 hover:bg-raised sm:flex-row sm:items-center sm:gap-5"
              >
                <span className="font-semibold sm:w-1/3">{project.name}</span>
                <Progress
                  className="w-full sm:flex-1"
                  done={project.progress.doneTasks}
                  total={project.progress.totalTasks}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** 期限が近い順。期限の無いものは後ろ。 */
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
