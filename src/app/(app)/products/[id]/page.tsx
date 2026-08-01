import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { PanelFallback } from '@/components/Fallbacks';

import { getProductById, listFeatures } from '@/domain/product/service';
import { listTasks } from '@/domain/task/service';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';
import { NotFoundError } from '@/lib/errors';
import {
  FEATURE_STATUS_LABELS,
  TASK_STATUS_LABELS,
  formatDate,
  formatPercent,
  isOverdue,
} from '@/lib/format';

import { NewFeatureForm } from './NewFeatureForm';

type Props = { params: Promise<{ id: string }> };

async function loadProduct(id: string) {
  try {
    return await getProductById(id);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

export const metadata = { title: '開発項目 | AtlasQuarry' };

/** S-04 プロダクト詳細 / 開発項目一覧。進捗と日付はタスクから導出した値を表示する。 */
export default async function ProductDetailPage({ params }: Props) {
  const { id } = await params;

  // 認証を先に済ませる。存在判定を先にすると、未認証でもIDの有無を 404 の差で探れてしまう
  const actor = await requireActor();

  // notFound() は Promise のコールバックからではなく本流で呼ぶ。
  // .catch() の中から投げると Next が 404 ステータスに結び付けられず 200 で返ってしまう。
  const product = await loadProduct(id);
  if (!product) notFound();


  return (
    <div className="page">
      <nav aria-label="パンくず" className="breadcrumb">
        <Link href="/products">プロダクト</Link>
      </nav>

      <h1 className="page-title">
        <span className="product-key">{product.key}</span> {product.name}
      </h1>
      {product.description && <p className="page-lead">{product.description}</p>}

      <p className="page-actions">
        <Link href={`/board?productId=${product.id}`}>かんばんで見る</Link>
      </p>

      {can(actor, 'feature.create') && <NewFeatureForm productId={product.id} />}

      <Suspense fallback={<PanelFallback label="開発項目" />}>
        <FeaturePanel productId={product.id} />
      </Suspense>

      <Suspense fallback={<PanelFallback label="開発項目に属さないタスク" />}>
        <UnassignedPanel productId={product.id} />
      </Suspense>
    </div>
  );
}

async function FeaturePanel({ productId }: { productId: string }) {
  const features = await listFeatures(productId);

  return (
    <section className="panel" aria-labelledby="features-heading">
      <h2 id="features-heading" className="panel-title">
        開発項目（{features.length}）
      </h2>

      {features.length === 0 ? (
        <p className="empty">開発項目がまだありません。</p>
      ) : (
        <ul className="card-list">
          {features.map((feature) => (
            <li key={feature.id} className="card">
              <h3 className="feature-name">
                <Link href={`/board?productId=${productId}&featureId=${feature.id}`}>
                  {feature.name}
                </Link>
              </h3>
              <p className="feature-status">
                {FEATURE_STATUS_LABELS[feature.status] ?? feature.status}
              </p>

              <span className="progress" aria-label={`進捗 ${formatPercent(feature.progress.ratio)}`}>
                <span
                  className="progress-bar"
                  style={{ inlineSize: `${Math.round(feature.progress.ratio * 100)}%` }}
                />
              </span>
              <p className="progress-text">
                {formatPercent(feature.progress.ratio)}（{feature.progress.doneTasks}/
                {feature.progress.totalTasks}）
              </p>

              <p className="feature-period">
                {formatDate(feature.progress.startDate)} 〜 {formatDate(feature.progress.dueDate)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function UnassignedPanel({ productId }: { productId: string }) {
  const unassigned = await listTasks({ productId, featureId: null });

  return (
    <section className="panel" aria-labelledby="unassigned-heading">
      <h2 id="unassigned-heading" className="panel-title">
        開発項目に属さないタスク（{unassigned.length}）
      </h2>
      {unassigned.length === 0 ? (
        <p className="empty">ありません。</p>
      ) : (
        <ul className="task-list">
          {unassigned.map((task) => (
            <li key={task.id}>
              <Link href={`/tasks/${task.key}`}>
                <span className="task-key">{task.key}</span>
                <span className="task-title">{task.title}</span>
                <span className="task-status">{TASK_STATUS_LABELS[task.status]}</span>
                <span className={`task-due${isOverdue(task.dueDate, task.status) ? ' is-overdue' : ''}`}>
                  {formatDate(task.dueDate)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
