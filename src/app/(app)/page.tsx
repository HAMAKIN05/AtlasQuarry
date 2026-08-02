import { ArrowRightIcon, PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

import { TaskCheck } from '@/components/TaskCheck';
import { Band, Face, SeamRow, seamColor } from '@/components/SeamLedger';
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

      {/*
        **「要望を出す」の入口を常に置く。**
        思いついたときに書くものなので、下部タブの意味を理解していることに
        依存させない。判断待ちが0件のときも、要望が無いときも、ここは消さない。
      */}
      <Link
        href="/requests/new"
        className="row-link -my-1 rounded-md border border-dashed border-border-strong px-3 text-sm text-muted-foreground hover:text-foreground"
      >
        <PlusIcon className="size-4 shrink-0" aria-hidden="true" />
        こうなったら楽になる、を書く
      </Link>

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

  const [head, ...restRequests] = requests;

  return (
    <>
      {/*
        **判断待ちの先頭1件を「いま掘る面」にする。**
        件数を数字で見せるのではなく、実際に決めるものを1件だけ大きく置く。
        面積が優先順位を伝えるので、「◯件あります」という説明が要らない。
      */}
      {head ? (
        <Band label="あなたが止めている">
          <Face
            seam={seamColor('request')}
            href={`/requests/${head.id}`}
            overline={`${head.reporterName}さんから · ${formatRelative(head.createdAt)}待ち`}
            title={head.title}
            meta={<span>やるかどうかを決める</span>}
          />
        </Band>
      ) : (
        <Band label="あなたが止めている">
          <p className="empty-inline">判断待ちの要望はありません。</p>
        </Band>
      )}

      {restRequests.length > 0 && (
        <Band label="ほかの判断待ち" count={restRequests.length}>
          <ul>
            {restRequests.slice(0, 3).map((request) => (
              <SeamRow
                key={request.id}
                seam={seamColor('request')}
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
          </ul>
        </Band>
      )}

      {/*
        **判断で埋まっても、自分の担当が見えなくなるようにしない。**
        管理者もタスクを持つ。
      */}
      {myTasks.length > 0 && (
        <Band label="あなたの担当" count={myTasks.length}>
          <ul>
            {myTasks.slice(0, 3).map((task, i, arr) => (
              <SeamRow
                key={task.id}
                seam={seamColor(task.productKey)}
                seamStart={i === 0 || arr[i - 1]!.productKey !== task.productKey}
                seamEnd={i === arr.length - 1 || arr[i + 1]!.productKey !== task.productKey}
                lead={<TaskCheck taskId={task.id} status={task.status} title={task.title} />}
                href={`/tasks/${task.key}`}
                title={task.title}
                meta={<FocusMeta task={task} />}
              />
            ))}
          </ul>
        </Band>
      )}
    </>
  );
}

/** 判断待ちが1週間を超えたら急ぐものとして扱う。 */
function waitingTooLong(createdAt: Date | string | null): boolean {
  if (!createdAt) return false;
  const at = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  return Date.now() - at.getTime() > 7 * 24 * 60 * 60 * 1000;
}

/**
 * 開発者向け。**期限を過ぎたもの → 期限が近いもの**の順。
 *
 * 先頭の1件だけを「いま掘る面」として大きく置き、残りは帳面の行として続ける。
 * **面積そのものが優先順位**なので、どれから手を付けるかを説明せずに伝えられる。
 */
async function MyWorkFirst({ actorId }: { actorId: string }) {
  const tasks = await openTasksOf(actorId);

  if (tasks.length === 0) {
    return (
      <Band label="いま掘る">
        <EmptyState
          title="担当しているタスクはありません"
          description="タスクは要望から作るか、タスク画面で直接追加できます。"
          actionLabel="タスクを見る"
          actionHref="/tasks"
        />
      </Band>
    );
  }

  const [head, ...rest] = tasks;

  return (
    <>
      <Band label="いま掘る">
        <Face
          seam={seamColor(head!.productKey)}
          href={`/tasks/${head!.key}`}
          title={head!.title}
          meta={<FocusMeta task={head!} />}
        />
      </Band>

      {rest.length > 0 && (
        <Band label="このあと" count={rest.length}>
          <ul>
            {rest.slice(0, 4).map((task, i, arr) => (
              <SeamRow
                key={task.id}
                seam={seamColor(task.productKey)}
                seamStart={i === 0 || arr[i - 1]!.productKey !== task.productKey}
                seamEnd={i === arr.length - 1 || arr[i + 1]!.productKey !== task.productKey}
                lead={<TaskCheck taskId={task.id} status={task.status} title={task.title} />}
                href={`/tasks/${task.key}`}
                title={task.title}
                meta={<FocusMeta task={task} />}
              />
            ))}
          </ul>
        </Band>
      )}
    </>
  );
}

function FocusMeta({ task }: { task: TaskListItem }) {
  const late = isOverdue(task.dueDate, task.status);
  return (
    <>
      <span>{task.productKey}</span>
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
