import Link from 'next/link';
import { Suspense } from 'react';

import { Badge, EmptyState, Loading, PageHeader, requestStatusTone } from '@/components/app-ui';
import { REQUEST_STATUSES, type RequestStatus } from '@/db/schema/enums';
import { listProducts } from '@/domain/product/service';
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

  const projects = await listProducts();

  return (
    <div className="flex flex-col gap-8">
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

  const item = (href: string, label: string, count: number, current: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm whitespace-nowrap',
        current ? 'bg-surface font-bold ' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
      <span className="tabular rounded-full bg-raised px-1.5 text-xs">{count}</span>
    </Link>
  );

  return (
    <nav aria-label="要望の絞り込み" className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-raised p-1">
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
        <div><h2>要望 <span className="tabular font-mono text-primary">{requests.length}</span></h2></div>
      </div>
    <ul>
      {requests.map((r) => (
        <li key={r.id}>
          <Link
            href={`/requests/${r.id}`}
            className="row-link"
          >
            <span className="min-w-0 flex-1 basis-48 font-semibold">{r.title}</span>
            <Badge tone={requestStatusTone(r.status)}>{labels[`request.status.${r.status}`]}</Badge>
            <span className="text-xs text-muted-foreground">
              {r.reporterName}さん・{formatRelative(r.createdAt)}
            </span>
            {r.convertedTaskKey && (
              <span className="tabular font-mono text-xs text-muted-foreground">
                {r.convertedTaskKey}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
    </section>
  );
}
