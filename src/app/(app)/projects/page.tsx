import Link from 'next/link';
import { Suspense } from 'react';

import { Chip, EmptyState, Loading, PageHeader, Progress } from '@/components/ui';
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
    <div className="page">
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
    <ul className="cards">
      {projects.map((p) => (
        <li key={p.id}>
          <Link href={`/projects/${p.id}`} className="pcard">
            <span className="pcard-head">
              <span className="pcard-name">{p.name}</span>
              <Chip tone={p.status === 'active' ? 'progress' : 'neutral'}>
                {PROJECT_STATUS_LABELS[p.status]}
              </Chip>
            </span>
            {p.description && <span className="pcard-desc">{p.description}</span>}
            <Progress done={p.progress.doneTasks} total={p.progress.totalTasks} />
            {p.nextDueDate && <span className="pcard-due">次の期限 {formatDate(p.nextDueDate)}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
