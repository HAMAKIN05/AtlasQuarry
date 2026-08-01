import Link from 'next/link';
import { Suspense } from 'react';

import { Chip, EmptyState, Loading, PageHeader, requestStatusTone } from '@/components/ui';
import { REQUEST_STATUSES, type RequestStatus } from '@/db/schema/enums';
import { listProducts } from '@/domain/product/service';
import { countRequestsByStatus, listRequests } from '@/domain/request/service';
import { loadLabels } from '@/domain/setting/labels';
import { requireActor } from '@/lib/auth/cookies';
import { formatRelative } from '@/lib/format';
import { REQUEST_TABS } from '@/lib/labels';

import { NewRequestButton } from './NewRequestButton';

type Props = { searchParams: Promise<{ status?: string }> };

export const metadata = { title: '要望 | AtlasQuarry' };

/**
 * S-10 要望一覧。
 *
 * **この画面が「開発してほしいことを言う場所」**。トップに何のための場所かを書き、
 * 主操作（要望を出す）を常に見える位置に置く。
 */
export default async function RequestsPage({ searchParams }: Props) {
  await requireActor();
  const { status } = await searchParams;

  const active: RequestStatus | 'all' =
    status && (REQUEST_STATUSES as readonly string[]).includes(status)
      ? (status as RequestStatus)
      : 'all';

  const projects = await listProducts();

  return (
    <div className="page">
      <PageHeader
        title="要望"
        description="「こんなことができたら仕事が楽になる」を書く場所です。出された要望は管理者が見て、やるかどうかを判断します。"
        action={<NewRequestButton projects={projects.map((p) => ({ id: p.id, name: p.name }))} />}
      />

      <Suspense fallback={<Loading />}>
        <RequestTabs active={active} />
      </Suspense>

      <Suspense key={active} fallback={<Loading />}>
        <RequestList active={active} />
      </Suspense>
    </div>
  );
}

async function RequestTabs({ active }: { active: RequestStatus | 'all' }) {
  const [counts, labels] = await Promise.all([countRequestsByStatus(), loadLabels()]);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <nav className="tabs" aria-label="要望の絞り込み">
      <Link href="/requests" className="tabs-item" aria-current={active === 'all' ? 'page' : undefined}>
        すべて<span className="tabs-count">{total}</span>
      </Link>
      {REQUEST_TABS.map((status) => (
        <Link
          key={status}
          href={`/requests?status=${status}`}
          className="tabs-item"
          aria-current={active === status ? 'page' : undefined}
        >
          {labels[`request.status.${status}`]}
          <span className="tabs-count">{counts[status] ?? 0}</span>
        </Link>
      ))}
    </nav>
  );
}

async function RequestList({ active }: { active: RequestStatus | 'all' }) {
  const [requests, labels] = await Promise.all([
    listRequests(active === 'all' ? undefined : [active]),
    loadLabels(),
  ]);

  if (requests.length === 0) {
    return (
      <EmptyState
        title={active === 'all' ? 'まだ要望がありません' : 'この状態の要望はありません'}
        description={
          active === 'all'
            ? '思いついたことを短く書くだけで大丈夫です。細かい仕様は後で詰めます。'
            : '別の状態のタブを見てみてください。'
        }
      />
    );
  }

  return (
    <ul className="rows">
      {requests.map((r) => (
        <li key={r.id}>
          <Link href={`/requests/${r.id}`} className="row">
            <span className="row-main">{r.title}</span>
            <Chip tone={requestStatusTone(r.status)}>{labels[`request.status.${r.status}`]}</Chip>
            <span className="row-sub">
              {r.reporterName}さん・{formatRelative(r.createdAt)}
            </span>
            {r.convertedTaskKey && <span className="row-key">{r.convertedTaskKey}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
