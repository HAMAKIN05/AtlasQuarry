import { asc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { actor as actorTable, product as productTable } from '@/db/schema';
import { listFeatures } from '@/domain/product/service';
import { listTasks } from '@/domain/task/service';

import { KanbanBoard } from './KanbanBoard';

type Props = {
  searchParams: Promise<{
    productId?: string;
    assigneeId?: string;
    priority?: string;
    featureId?: string;
  }>;
};

export const metadata = { title: 'かんばん | AtlasQuarry' };

/**
 * S-05 かんばんボード。
 *
 * 初期データはサーバーで取り、DnD 以降の更新はクライアント側で持つ。
 * プロダクト未指定のときは最初のプロダクトを開く（3名規模で「どれを見るか」を毎回選ばせない）。
 */
export default async function BoardPage({ searchParams }: Props) {
  const params = await searchParams;

  const products = await db
    .select({ id: productTable.id, key: productTable.key, name: productTable.name })
    .from(productTable)
    .orderBy(asc(productTable.key));

  const productId = params.productId ?? products[0]?.id;

  if (!productId) {
    return (
      <div className="page">
        <h1 className="page-title">かんばん</h1>
        <p className="empty">プロダクトがまだありません。先にプロダクトを作成してください。</p>
      </div>
    );
  }

  const [tasks, features, members] = await Promise.all([
    listTasks({ productId }),
    listFeatures(productId),
    db
      .select({ id: actorTable.id, name: actorTable.name })
      .from(actorTable)
      .where(eq(actorTable.isActive, true))
      .orderBy(asc(actorTable.name)),
  ]);

  // 存在しない開発項目がクエリで指定された場合はフィルタを無視する
  const featureId =
    params.featureId && features.some((f) => f.id === params.featureId)
      ? params.featureId
      : undefined;

  return (
    <div className="page">
      <h1 className="page-title">かんばん</h1>
      <KanbanBoard
        products={products}
        productId={productId}
        initialTasks={tasks}
        features={features.map((f) => ({ id: f.id, name: f.name }))}
        members={members}
        initialFilters={{
          assigneeId: params.assigneeId,
          priority: params.priority,
          featureId,
        }}
      />
    </div>
  );
}
