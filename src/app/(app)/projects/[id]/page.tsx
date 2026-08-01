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

      <PageHeader
        title={project.name}
        description={project.description ?? undefined}
        action={
          <Link href={`/tasks?projectId=${project.id}`} className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold min-h-11 px-4 disabled:opacity-50 disabled:pointer-events-none border border-border bg-surface hover:bg-hover">
            タスクを見る
          </Link>
        }
      />
      <p className="-mt-2 font-mono text-xs text-muted-foreground">タスク番号の記号：{project.key}</p>

      <nav className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-raised p-1" aria-label="表示の切り替え">
        <Link
          href={`/projects/${project.id}`}
          className="inline-flex min-h-9 shrink-0 items-center rounded-md px-3 text-sm whitespace-nowrap text-muted-foreground aria-[current=page]:bg-surface aria-[current=page]:font-bold aria-[current=page]:text-foreground aria-[current=page]:"
          aria-current={isGantt ? undefined : 'page'}
        >
          開発項目一覧
        </Link>
        <Link
          href={`/projects/${project.id}?view=gantt`}
          className="inline-flex min-h-9 shrink-0 items-center rounded-md px-3 text-sm whitespace-nowrap text-muted-foreground aria-[current=page]:bg-surface aria-[current=page]:font-bold aria-[current=page]:text-foreground aria-[current=page]:"
          aria-current={isGantt ? 'page' : undefined}
        >
          ガント
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
      <GanttChart rows={rows} />
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
                <span className="tabular shrink-0 font-mono text-xs text-muted-foreground">{t.key}</span>
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
