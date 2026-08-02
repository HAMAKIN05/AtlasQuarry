import Link from 'next/link';
import { Suspense } from 'react';

import { Badge, EmptyState, Loading, PageHeader, requestStatusTone } from '@/components/app-ui';
import { REQUEST_STATUSES, type RequestStatus } from '@/db/schema/enums';
import { countRequestsByStatus, listRequests } from '@/domain/request/service';
import { loadLabels } from '@/domain/setting/labels';
import { requireActor } from '@/lib/auth/cookies';
import { cn } from '@/lib/cn';
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

  return (
    <div className="flex flex-col gap-8">
      {/*
        **毎日開く画面に初見向けの説明を常設しない。**
        何のための場所かは「要望を出す」ボタンと、1件も無いときの空状態で足りる。
      */}
      <PageHeader title="要望" action={<NewRequestButton />} />

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

  const item = (href: string, label: string, count: number, current: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={current ? 'page' : undefined}
      /* 丸い札にする。押せることと、いまどれを見ているかを形で示す */
      className={cn('chip shrink-0 whitespace-nowrap', current && 'font-bold')}
    >
      {label}
      <span className="tabular text-xs opacity-80">{count}</span>
    </Link>
  );

  return (
    <nav aria-label="要望の絞り込み" className="-mx-1 flex max-w-full gap-2 overflow-x-auto px-1 py-1">
      {item('/requests', 'すべて', total, active === 'all')}
      {REQUEST_TABS.map((status) =>
        item(
          `/requests?status=${status}`,
          labels[`request.status.${status}`],
          counts[status] ?? 0,
          active === status,
        ),
      )}
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
    <section className="content-section" aria-label="要望一覧">
      <div className="section-heading">
        <div>
          <h2>
            要望 <span className="tabular text-primary">{requests.length}</span>
          </h2>
        </div>
      </div>

      {/* **1件ずつ独立したカードにする。** 表に見せない */}
      <div className="card-list">
        {requests.map((r) => (
          <Link key={r.id} href={`/requests/${r.id}`} className="card">
            <span className="flex items-start gap-2">
              <span className="card-title min-w-0 flex-1">{r.title}</span>
              <Badge tone={requestStatusTone(r.status)}>
                {labels[`request.status.${r.status}`]}
              </Badge>
            </span>
            <span className="stack-meta mt-2">
              {r.productName && <span>{r.productName}</span>}
              <span>{r.reporterName}さんから</span>
              <span>{formatRelative(r.createdAt)}</span>
              {r.convertedTaskKey && <span className="tabular">{r.convertedTaskKey}</span>}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
