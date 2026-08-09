import Link from 'next/link';

import { EmptyState } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { listProducts } from '@/domain/product/service';
import { listTasks } from '@/domain/task/service';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';

import { ProjectCatalog } from './ProjectCatalog';

export const metadata = { title: 'プロジェクト | AtlasQuarry' };

export default async function ProjectsPage() {
  const actor = await requireActor();
  const projects = await listProducts();
  const today = new Date().toISOString().slice(0, 10);
  const summaries = await Promise.all(
    projects.map(async (project) => {
      const tasks = await listTasks({ productId: project.id });
      const open = tasks.filter((task) => task.status !== 'done' && task.status !== 'cancelled');
      return {
        project,
        open: open.length,
        overdue: open.filter((task) => task.dueDate !== null && task.dueDate < today).length,
        unassigned: open.filter((task) => !task.assigneeName).length,
      };
    }),
  );
  const active = summaries.filter(({ project }) => project.status === 'active' || project.status === 'planning');

  return (
    <div className="projects-page flex flex-col gap-7">
      <header className="workspace-home-header">
        <div>
          <p className="eyebrow">仕事のまとまり</p>
          <h1 className="large-title">プロジェクト</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            プロジェクトを選ぶと、タスク・予定・資料・工数をひとつの流れで確認できます。
          </p>
        </div>
        {can(actor, 'product.create') && (
          <Button asChild>
            <Link href="/projects/new">新しいプロジェクトを作る</Link>
          </Button>
        )}
      </header>

      <section className="project-overview-strip" aria-label="プロジェクトの概要">
        <OverviewStat label="進行中" value={active.length} detail="いま動いているプロジェクト" />
        <OverviewStat label="未完了タスク" value={summaries.reduce((sum, item) => sum + item.open, 0)} detail="全プロジェクトの合計" />
        <OverviewStat label="期限超過" value={summaries.reduce((sum, item) => sum + item.overdue, 0)} detail="先に確認したいもの" danger />
      </section>

      {projects.length === 0 ? (
        <EmptyState title="まだプロジェクトがありません" description="プロジェクトをひとつ作ると、チームの仕事をここで整理できます。" actionLabel="最初のプロジェクトを作る" actionHref="/projects/new" />
      ) : (
        <ProjectCatalog items={summaries} />
      )}
    </div>
  );
}

function OverviewStat({ label, value, detail, danger = false }: { label: string; value: number; detail: string; danger?: boolean }) {
  return (
    <div className="project-overview-stat">
      <span>{label}</span>
      <strong className={danger ? 'text-destructive' : ''}>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
