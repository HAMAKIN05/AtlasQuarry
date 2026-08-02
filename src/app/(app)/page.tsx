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

/**
 * プロジェクト一覧。**アプリを開いて最初に出る画面。**
 *
 * それまでは「今日」を入口にしていた（Todoist 的な、今日やることから始める形）。
 * しかしこの道具では **プロジェクトが仕事の単位そのもの**で、
 * 「プロジェクトが大枠で全ての起点なのに、ホームからアクセスできない上に、
 * ドックも右端で重要感がない」という指摘を受けた。そのとおりだった。
 *
 * 下部タブの**左端＝アプリの基点**として読まれる位置にプロジェクトを置き、
 * ここを起点にする。「今日」は個人が自分の作業を処理する2番目の面に下げた。
 */
export default async function ProjectsHomePage() {
  const actor = await requireActor();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="large-title">プロジェクト</h1>
        {can(actor, 'product.create') && (
          <Button asChild size="sm" variant="outline">
            <Link href="/projects/new">＋ 作る</Link>
          </Button>
        )}
      </div>

      <Suspense fallback={<Loading label="プロジェクトを読み込んでいます" />}>
        <ProjectList />
      </Suspense>
    </div>
  );
}

async function ProjectList() {
  const projects = await listProducts();

  if (projects.length === 0) {
    return (
      <EmptyState
        title="プロジェクトがまだありません"
        description="内製化する対象ごとに作ります。「日報自動化」「SNS分析」のような単位です。"
        actionLabel="最初のプロジェクトを作る"
        actionHref="/projects/new"
      />
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  /*
   * **カードに「遅れ」と「未割当」を出す。**
   * 名前と進捗率だけだと、開くまで様子が分からない。
   * どのプロジェクトを先に見るべきかを、一覧のまま判断できるようにする。
   */
  const withStats = await Promise.all(
    projects.map(async (p) => {
      const tasks = await listTasks({ productId: p.id });
      const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
      return {
        project: p,
        late: open.filter((t) => t.dueDate !== null && t.dueDate < today).length,
        unassigned: open.filter((t) => !t.assigneeName).length,
      };
    }),
  );

  return (
    <div className="card-list">
      {withStats.map(({ project, late, unassigned }) => (
        <Link key={project.id} href={`/projects/${project.id}`} className="card">
          <span className="flex items-center gap-2">
            <Dot seed={project.key} />
            <span className="card-title min-w-0 flex-1">{project.name}</span>
            {project.status !== 'active' && (
              <Badge tone="neutral">{PROJECT_STATUS_LABELS[project.status]}</Badge>
            )}
            <span className="chevron" aria-hidden="true" />
          </span>

          <Progress
            className="mt-3"
            done={project.progress.doneTasks}
            total={project.progress.totalTasks}
          />

          <span className="stack-meta mt-2">
            <span>
              {project.nextDueDate ? `次の期限 ${formatDate(project.nextDueDate)}` : '期限なし'}
            </span>
            {late > 0 && <span data-late="true">遅れ {late}</span>}
            {unassigned > 0 && <span>未割当 {unassigned}</span>}
          </span>
        </Link>
      ))}
    </div>
  );
}
