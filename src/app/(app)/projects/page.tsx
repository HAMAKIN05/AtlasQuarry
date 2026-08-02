import Link from 'next/link';
import { Suspense } from 'react';

import { Dot } from '@/components/Ledger';
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
      {/*
        説明文を外した。**初見向けの案内を、毎日開く画面に常設しない。**
        何のための画面かは、プロジェクトが1つも無いときの空状態で説明すれば足りる。
      */}
      <PageHeader
        title="プロジェクト"
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
    /*
     * 1行に名前・状態・説明・進捗・次の期限を全部詰めていた。**減らした。**
     * 常時出すのは名前と「次の期限」だけ。説明は詳細画面にあり、状態バッジは
     * 動いていないプロジェクト（active 以外）にだけ出す。全部が active のとき
     * 全行に同じバッジが並ぶのは、情報が無いのに場所だけ取る。
     */
    /* **1件ずつ独立したカードにする。** 名前・進捗・次の期限を1枚にまとめる */
    <div className="card-list" aria-label="プロジェクト一覧">
      {projects.map((p) => (
        <Link key={p.id} href={`/projects/${p.id}`} className="card">
          <span className="flex items-center gap-2">
            <Dot seed={p.key} />
            <span className="card-title min-w-0 flex-1">{p.name}</span>
            {p.status !== 'active' && (
              <Badge tone="neutral">{PROJECT_STATUS_LABELS[p.status]}</Badge>
            )}
          </span>
          <Progress className="mt-3" done={p.progress.doneTasks} total={p.progress.totalTasks} />
          <span className="stack-meta mt-2">
            {p.nextDueDate ? `次の期限 ${formatDate(p.nextDueDate)}` : '期限なし'}
          </span>
        </Link>
      ))}
    </div>
  );
}
