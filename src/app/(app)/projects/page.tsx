import Link from 'next/link';
import { Suspense } from 'react';

import { Badge, EmptyState, Loading, PageHeader, Progress } from '@/components/app-ui';
import { listProducts } from '@/domain/product/service';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';
import { formatDate } from '@/lib/format';
import { PROJECT_STATUS_LABELS } from '@/lib/labels';

import { NewProjectButton } from './NewProjectButton';

export const metadata = { title: 'プロジェクト | AtlasQuarry' };

/** S-03 プロジェクト一覧。 */
export default async function ProjectsPage() {
  const actor = await requireActor();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="プロジェクト"
        description="内製化する対象ごとのまとまりです。たとえば「日報自動化」「SNS分析」のような単位で作ります。"
        action={can(actor, 'product.create') ? <NewProjectButton /> : undefined}
      />

      <Suspense fallback={<Loading />}>
        <ProjectList canCreate={can(actor, 'product.create')} />
      </Suspense>
    </div>
  );
}

async function ProjectList({ canCreate }: { canCreate: boolean }) {
  const projects = await listProducts();

  if (projects.length === 0) {
    return (
      <EmptyState
        title="プロジェクトがまだありません"
        description={
          canCreate
            ? '最初の1つを作りましょう。内製化したいシステムの名前を付けるだけで始められます。'
            : '経営者か管理者が作成すると、ここに並びます。'
        }
      />
    );
  }

  return (
    <section className="content-section" aria-label="プロジェクト一覧">
      <div className="section-heading">
        <div><h2>プロジェクト <span className="tabular text-primary">{projects.length}</span></h2></div>
      </div>
    <ul>
      {projects.map((p) => (
        <li key={p.id}>
          <Link href={`/projects/${p.id}`} className="flex min-h-14 flex-col gap-2 border-b border-border px-1 py-3 hover:bg-raised sm:grid sm:grid-cols-[minmax(12rem,0.9fr)_minmax(12rem,1fr)_auto] sm:items-center sm:gap-5">
            <span className="flex items-center gap-2">
              <span className="flex-1 text-base font-bold">{p.name}</span>
              <Badge tone={p.status === 'active' ? 'progress' : 'neutral'}>
                {PROJECT_STATUS_LABELS[p.status]}
              </Badge>
            </span>
            {p.description && <span className="text-sm text-muted-foreground sm:col-start-1">{p.description}</span>}
            <Progress done={p.progress.doneTasks} total={p.progress.totalTasks} />
            {p.nextDueDate && <span className="tabular text-xs text-muted-foreground">次の期限 {formatDate(p.nextDueDate)}</span>}
          </Link>
        </li>
      ))}
    </ul>
    </section>
  );
}
