import Link from 'next/link';
import { Suspense } from 'react';

import { Dot } from '@/components/Ledger';
import { Badge, EmptyState, Loading, Progress } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { listProducts } from '@/domain/product/service';
import { listTasks } from '@/domain/task/service';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';
import { formatDate } from '@/lib/format';
import { PROJECT_STATUS_LABELS } from '@/lib/labels';

export const metadata = { title: 'プロジェクト | AtlasQuarry' };

export default async function ProjectsHomePage() {
  const actor = await requireActor();

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-primary">開発ワークスペース</p>
          <h1 className="large-title">プロジェクト</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            全体の進み具合を見て、次に動かす場所を決めます。
          </p>
        </div>
        {can(actor, 'product.create') && (
          <Button asChild className="w-full sm:w-auto">
            <Link href="/projects/new">＋ 新しいプロジェクト</Link>
          </Button>
        )}
      </header>

      <Suspense fallback={<Loading label="プロジェクトを読み込んでいます…" />}>
        <ProjectDashboard />
      </Suspense>
    </div>
  );
}

async function ProjectDashboard() {
  const projects = await listProducts();

  if (projects.length === 0) {
    return (
      <EmptyState
        title="まだプロジェクトがありません"
        description="チームで進める仕事をひとつ登録すると、タスク・予定・資料をまとめて管理できます。"
        actionLabel="最初のプロジェクトを作る"
        actionHref="/projects/new"
      />
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const withStats = await Promise.all(
    projects.map(async (project) => {
      const tasks = await listTasks({ productId: project.id });
      const open = tasks.filter((task) => task.status !== 'done' && task.status !== 'cancelled');
      return {
        project,
        openTasks: open.length,
        late: open.filter((task) => task.dueDate !== null && task.dueDate < today).length,
        unassigned: open.filter((task) => !task.assigneeName).length,
      };
    }),
  );

  const openTasks = withStats.reduce((sum, item) => sum + item.openTasks, 0);
  const lateTasks = withStats.reduce((sum, item) => sum + item.late, 0);
  const unassignedTasks = withStats.reduce((sum, item) => sum + item.unassigned, 0);

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-3" aria-label="概要">
        <SummaryCard label="プロジェクト" value={projects.length} detail="すべての案件" />
        <SummaryCard label="進行中のタスク" value={openTasks} detail="完了していないもの" />
        <SummaryCard label="確認が必要" value={lateTasks + unassignedTasks} detail={`${lateTasks}件の遅れ・${unassignedTasks}件の未割当`} tone={lateTasks > 0 ? 'danger' : 'default'} />
      </section>

      <section className="content-section">
        <div className="section-heading px-0">
          <div>
            <h2>すべてのプロジェクト</h2>
            <p className="mt-1 text-sm text-muted-foreground">案件を選ぶと、タスクと予定の詳細を確認できます。</p>
          </div>
          <Link href="/schedule" className="text-sm font-bold text-primary hover:underline">
            予定を見る →
          </Link>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {withStats.map(({ project, late, unassigned }) => (
            <Link key={project.id} href={`/projects/${project.id}`} className="card flex min-h-[11rem] flex-col p-5">
              <div className="flex items-start gap-3">
                <Dot seed={project.key} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-bold">{project.name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {PROJECT_STATUS_LABELS[project.status]}
                  </span>
                </span>
                <span className="chevron mt-1" aria-hidden="true" />
              </div>

              <Progress className="mt-auto pt-6" done={project.progress.doneTasks} total={project.progress.totalTasks} />

              <div className="mt-3 flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{project.nextDueDate ? `次の期限 ${formatDate(project.nextDueDate)}` : '期限なし'}</span>
                {late > 0 && <Badge tone="danger">遅れ {late}</Badge>}
                {unassigned > 0 && <span>未割当 {unassigned}</span>}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string;
  value: number;
  detail: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <div className="surface p-4">
      <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className={tone === 'danger' ? 'mt-3 text-3xl font-bold text-destructive' : 'mt-3 text-3xl font-bold'}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
