import Link from 'next/link';

import { BackLink, EmptyState, PageHeader } from '@/components/app-ui';
import { listProducts } from '@/domain/product/service';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';
import { ForbiddenError } from '@/lib/errors';

import { ProjectRow } from './ProjectRow';

export const metadata = { title: 'プロジェクトの設定 | AtlasQuarry' };

/** 設定 → プロジェクト。名前・状態の変更と削除。 */
export default async function ProjectSettingsPage() {
  const actor = await requireActor();
  if (!can(actor, 'product.update')) throw new ForbiddenError();

  const projects = await listProducts();

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/settings" label="設定" />

      <PageHeader title="プロジェクト" description="名前や状態を変えられます。" />

      {projects.length === 0 ? (
        <EmptyState
          title="プロジェクトがありません"
          description="まずは1つ作ってください。"
          actionLabel="プロジェクトを作る"
          actionHref="/projects"
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {projects.map((p) => (
            <ProjectRow
              key={p.id}
              project={{
                id: p.id,
                key: p.key,
                name: p.name,
                description: p.description,
                status: p.status,
                taskCount: p.progress.totalTasks,
              }}
              canDelete={can(actor, 'product.delete')}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
