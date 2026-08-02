import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { Badge, EmptyState, Loading, PageHeader, Progress, taskStatusTone, BackLink } from '@/components/app-ui';
import { getGanttData } from '@/domain/gantt/query';
import { getProductById, listFeatures } from '@/domain/product/service';
import { loadLabels } from '@/domain/setting/labels';
import { listTasks } from '@/domain/task/service';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';
import { NotFoundError } from '@/lib/errors';
import { dueLabel, formatDate, isOverdue } from '@/lib/format';
import { FEATURE_STATUS_LABELS } from '@/lib/labels';

import { GanttChart } from '@/components/GanttChart';
import { MobileSchedule } from '@/components/MobileSchedule';
import { NewFeatureForm } from './NewFeatureForm';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
};

export const metadata = { title: 'プロジェクト | AtlasQuarry' };

async function loadProject(id: string) {
  try {
    return await getProductById(id);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

/** S-04 プロジェクト詳細。開発項目＝そのプロジェクトの中の作業のまとまり。 */
export default async function ProjectDetailPage({ params, searchParams }: Props) {
  const actor = await requireActor();
  const { id } = await params;
  const { view } = await searchParams;
  const isGantt = view === 'gantt';

  const project = await loadProject(id);
  if (!project) notFound();

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/projects" label="プロジェクト一覧" />

      <PageHeader title={project.name} description={project.description ?? undefined} />

      {/*
        **かんばんは主操作としてプロジェクト名の直下に置く。**
        「プロジェクトのところからもかんばんへ行きたい」という指摘。
        下の切り替えの列に混ぜると弱いので、押せるボタンとして1つ出す。
        開くのは**このプロジェクトに絞ったかんばん**（タスク画面と同じもの）。
      */}
      <Link
        href={`/tasks?projectId=${project.id}&view=board`}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-bold text-primary-foreground transition-colors hover:bg-primary-hover sm:w-auto sm:self-start"
      >
        かんばんを開く
      </Link>

      {/*
        **このプロジェクトの見方を1列に並べる。**
        以前は「開発項目一覧／ガント」の2つだけで、タスクとかんばんへは
        別の場所（見出しの右のボタン）から行く作りだった。
        「プロジェクトのところからもかんばんへ行きたい」という指摘のとおり、
        **同じプロジェクトを別の切り口で見る手段は、同じ列に並べる。**
        タスク一覧とかんばんは、このプロジェクトに絞った状態で開く。
      */}
      {/* かんばんは上の主ボタンにあるので、ここには重ねて置かない */}
      <nav className="-mx-1 flex max-w-full gap-2 overflow-x-auto px-1 py-1" aria-label="このプロジェクトの見方">
        <Link
          href={`/projects/${project.id}`}
          className="chip shrink-0"
          aria-current={isGantt ? undefined : 'page'}
        >
          開発項目
        </Link>
        <Link
          href={`/projects/${project.id}?view=gantt`}
          className="chip shrink-0"
          aria-current={isGantt ? 'page' : undefined}
        >
          予定
        </Link>
        <Link href={`/tasks?projectId=${project.id}`} className="chip shrink-0">
          タスク一覧
        </Link>
        {/*
          **このプロジェクトに入るタスクを、ここから直接足せるようにする。**
          「まずどこに入れるか決めろ」を消すのが目的なので、押した先では
          プロジェクトが埋まった状態で追加フォームが開く。
        */}
        <Link href={`/tasks?projectId=${project.id}&new=1`} className="chip shrink-0">
          ＋ タスクを追加
        </Link>
      </nav>

      {isGantt ? (
        <Suspense fallback={<Loading />}>
          <GanttPanel projectId={project.id} />
        </Suspense>
      ) : (
        <>
          {can(actor, 'feature.create') && <NewFeatureForm productId={project.id} />}

          <Suspense fallback={<Loading />}>
            <FeatureList projectId={project.id} />
          </Suspense>

          <Suspense fallback={<Loading />}>
            <LooseTasks projectId={project.id} />
          </Suspense>
        </>
      )}
    </div>
  );
}

async function GanttPanel({ projectId }: { projectId: string }) {
  const { rows, hasAnyPeriod } = await getGanttData(projectId);

  if (rows.length === 0) {
    return (
      <EmptyState
        title="まだ何もありません"
        description="タスクを作って開始日と期限を入れると、ここに帯で並びます。"
        actionLabel="タスクを見る"
        actionHref={`/tasks?projectId=${projectId}`}
      />
    );
  }

  return (
    <section className="surface p-4">
      {!hasAnyPeriod && (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          開始日と期限が入っているタスクがまだありません。タスクに日付を入れると帯が出ます。
        </p>
      )}

      {/*
        **スマホと PC で見せ方を変える。** 横長のガントを縮めても読めないので、
        スマホは「現在地 → 縦タイムライン → 2週間のミニガント」の3段にする
        （オーナーから渡された整理のとおり）。PC は従来どおり全期間のガント。
      */}
      <MobileSchedule rows={rows} projectId={projectId} />
      <div className="hidden lg:block">
        <GanttChart rows={rows} />
      </div>
    </section>
  );
}

async function FeatureList({ projectId }: { projectId: string }) {
  const features = await listFeatures(projectId);

  return (
    <section className="surface p-4">
      <h2 className="mb-3 text-base font-bold">開発項目（{features.length}）</h2>
      <p className="mb-3 text-sm text-muted-foreground">タスクをまとめる単位です。「認証まわり」「帳票の出力」のように分けます。</p>

      {features.length === 0 ? (
        <EmptyState
          title="開発項目がまだありません"
          description="無くてもタスクは作れます。数が増えて分かりにくくなったら作ってください。"
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {features.map((f) => (
            <li key={f.id}>
              <Link href={`/tasks?projectId=${projectId}&featureId=${f.id}`} className="flex flex-col items-stretch gap-2 rounded-md bg-raised p-3 hover:bg-hover">
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 basis-40 font-semibold">{f.name}</span>
                  <Badge tone={f.status === 'active' ? 'progress' : 'neutral'}>
                    {FEATURE_STATUS_LABELS[f.status]}
                  </Badge>
                </span>
                <Progress done={f.progress.doneTasks} total={f.progress.totalTasks} />
                {(f.progress.startDate || f.progress.dueDate) && (
                  <span className="text-xs text-muted-foreground">
                    {formatDate(f.progress.startDate)} 〜 {formatDate(f.progress.dueDate)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function LooseTasks({ projectId }: { projectId: string }) {
  const [tasks, labels] = await Promise.all([
    listTasks({ productId: projectId, featureId: null }),
    loadLabels(),
  ]);

  if (tasks.length === 0) return null;

  return (
    <section className="surface p-4">
      <h2 className="mb-3 text-base font-bold">開発項目に入っていないタスク（{tasks.length}）</h2>
      <ul className="flex flex-col gap-2">
        {tasks.map((t) => {
          const due = dueLabel(t.dueDate, t.status);
          return (
            <li key={t.id}>
              <Link href={`/tasks/${t.key}`} className="flex min-h-13 flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-raised p-3 hover:bg-hover">
                <span className="tabular shrink-0 text-xs text-muted-foreground">{t.key}</span>
                <span className="min-w-0 flex-1 basis-40 font-semibold">{t.title}</span>
                <Badge tone={taskStatusTone(t.status)}>{labels[`task.status.${t.status}`]}</Badge>
                {due && (
                  <span className={isOverdue(t.dueDate, t.status) ? 'tabular shrink-0 text-xs font-bold text-destructive' : 'tabular shrink-0 text-xs text-muted-foreground'}>
                    {due}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
