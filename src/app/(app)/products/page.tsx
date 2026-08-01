import Link from 'next/link';
import { Suspense } from 'react';

import { BlockFallback } from '@/components/Fallbacks';
import { listProducts } from '@/domain/product/service';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';
import { PRODUCT_STATUS_LABELS, formatDate, formatPercent } from '@/lib/format';

import { NewProductForm } from './NewProductForm';

export const metadata = { title: 'プロダクト | AtlasQuarry' };

/** S-03 プロダクト一覧。進捗率と次の期限を出す。 */
export default async function ProductsPage() {
  const actor = await requireActor();

  return (
    <div className="page">
      <h1 className="page-title">プロダクト</h1>

      {can(actor, 'product.create') && <NewProductForm />}

      <Suspense fallback={<BlockFallback />}>
        <ProductList />
      </Suspense>
    </div>
  );
}

async function ProductList() {
  const products = await listProducts();

  if (products.length === 0) {
    return <p className="empty">プロダクトがまだありません。最初の1件を作成してください。</p>;
  }

  return (
    <ul className="card-list">
      {products.map((product) => (
        <li key={product.id} className="card">
          <Link href={`/products/${product.id}`}>
            <span className="product-key">{product.key}</span>
            <span className="product-name">{product.name}</span>
            <span className="product-status">
              {PRODUCT_STATUS_LABELS[product.status] ?? product.status}
            </span>

            <span className="progress" aria-label={`進捗 ${formatPercent(product.progress.ratio)}`}>
              <span
                className="progress-bar"
                style={{ inlineSize: `${Math.round(product.progress.ratio * 100)}%` }}
              />
            </span>
            <span className="progress-text">
              {formatPercent(product.progress.ratio)}（{product.progress.doneTasks}/
              {product.progress.totalTasks}）
            </span>

            <span className="product-due">次の期限: {formatDate(product.nextDueDate)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
