import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { Chip, EmptyState, Loading, PageHeader, Progress, taskStatusTone } from '@/components/ui';
import { getGanttData } from '@/domain/gantt/query';
import { getProductById, listFeatures } from '@/domain/product/service';
import { loadLabels } from '@/domain/setting/labels';
import { listTasks } from '@/domain/task/service';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';
import { NotFoundError } from '@/lib/errors';
import { dueLabel, formatDate, isOverdue } from '@/lib/format';
import { FEATURE_STATUS_LABELS } from '@/lib/labels';

import { GanttChart } from './GanttChart';
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
    <div className="page">
      <nav className="crumbs" aria-label="現在の場所">
        <Link href="/projects">プロジェクト</Link>
      </nav>

      <PageHeader
        title={project.name}
        description={project.description ?? undefined}
        action={
          <Link href={`/tasks?projectId=${project.id}`} className="btn-secondary">
            タスクを見る
          </Link>
        }
      />
      <p className="key-line">タスク番号の記号：{project.key}</p>

      <nav className="tabs" aria-label="表示の切り替え">
        <Link
          href={`/projects/${project.id}`}
          className="tabs-item"
          aria-current={isGantt ? undefined : 'page'}
        >
          開発項目一覧
        </Link>
        <Link
          href={`/projects/${project.id}?view=gantt`}
          className="tabs-item"
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
    <section className="card">
      {!hasAnyPeriod && (
        <p className="alert">
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
    <section className="card">
      <h2 className="card-title">開発項目（{features.length}）</h2>
      <p className="hint">タスクをまとめる単位です。「認証まわり」「帳票の出力」のように分けます。</p>

      {features.length === 0 ? (
        <EmptyState
          title="開発項目がまだありません"
          description="無くてもタスクは作れます。数が増えて分かりにくくなったら作ってください。"
        />
      ) : (
        <ul className="rows">
          {features.map((f) => (
            <li key={f.id}>
              <Link href={`/tasks?projectId=${projectId}&featureId=${f.id}`} className="row row-block">
                <span className="row-head">
                  <span className="row-main">{f.name}</span>
                  <Chip tone={f.status === 'active' ? 'progress' : 'neutral'}>
                    {FEATURE_STATUS_LABELS[f.status]}
                  </Chip>
                </span>
                <Progress done={f.progress.doneTasks} total={f.progress.totalTasks} />
                {(f.progress.startDate || f.progress.dueDate) && (
                  <span className="row-sub">
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
    <section className="card">
      <h2 className="card-title">開発項目に入っていないタスク（{tasks.length}）</h2>
      <ul className="rows">
        {tasks.map((t) => {
          const due = dueLabel(t.dueDate, t.status);
          return (
            <li key={t.id}>
              <Link href={`/tasks/${t.key}`} className="row">
                <span className="row-key">{t.key}</span>
                <span className="row-main">{t.title}</span>
                <Chip tone={taskStatusTone(t.status)}>{labels[`task.status.${t.status}`]}</Chip>
                {due && (
                  <span className={`row-due${isOverdue(t.dueDate, t.status) ? ' is-late' : ''}`}>
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
