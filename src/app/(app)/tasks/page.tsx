import { asc, eq } from 'drizzle-orm';

import { EmptyState, PageHeader } from '@/components/app-ui';
import { db } from '@/db/client';
import { actor as actorTable, product as productTable } from '@/db/schema';
import { listFeatures } from '@/domain/product/service';
import { listTasks } from '@/domain/task/service';
import { requireActor } from '@/lib/auth/cookies';

import { TaskWorkspace } from './TaskWorkspace';

type Props = {
  searchParams: Promise<{ projectId?: string; view?: string; assigneeId?: string; featureId?: string }>;
};

export const metadata = { title: 'タスク | AtlasQuarry' };

/**
 * S-05 タスク。
 *
 * **一覧とかんばんを別画面にしない。** 同じものの見せ方が違うだけなので、
 * 画面を分けると「どっちを見ればいいのか」という迷いが増える。
 */
export default async function TasksPage({ searchParams }: Props) {
  await requireActor();
  const params = await searchParams;

  const projects = await db
    .select({ id: productTable.id, key: productTable.key, name: productTable.name })
    .from(productTable)
    .orderBy(asc(productTable.key));

  if (projects.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="タスク" />
        <EmptyState
          title="先にプロジェクトを作ってください"
          description="タスクはどれかのプロジェクトに属します。内製化する対象ごとに1つ作ります。"
          actionLabel="プロジェクトを作る"
          actionHref="/projects"
        />
      </div>
    );
  }

  const projectId = params.projectId ?? projects[0]!.id;
  const [tasks, features, members] = await Promise.all([
    listTasks({ productId: projectId }),
    listFeatures(projectId),
    db
      .select({ id: actorTable.id, name: actorTable.name })
      .from(actorTable)
      .where(eq(actorTable.isActive, true))
      .orderBy(asc(actorTable.name)),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <TaskWorkspace
        projects={projects}
        projectId={projectId}
        initialTasks={tasks}
        initialView={params.view === 'board' ? 'board' : 'list'}
        features={features.map((f) => ({ id: f.id, name: f.name }))}
        members={members}
      />
    </div>
  );
}
