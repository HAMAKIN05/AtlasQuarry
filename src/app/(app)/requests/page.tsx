import Link from 'next/link';
import { Suspense } from 'react';

import { Badge, EmptyState, Loading, requestStatusTone } from '@/components/app-ui';
import { REQUEST_STATUSES, type RequestStatus } from '@/db/schema/enums';
import { countRequestsByStatus, listRequests } from '@/domain/request/service';
import { loadLabels } from '@/domain/setting/labels';
import { requireActor } from '@/lib/auth/cookies';
import { formatRelative } from '@/lib/format';
import { REQUEST_TABS } from '@/lib/labels';

import { NewRequestButton } from './NewRequestButton';

type Props = { searchParams: Promise<{ status?: string }> };

export const metadata = { title: '要望 | AtlasQuarry' };

export default async function RequestsPage({ searchParams }: Props) {
  await requireActor();
  const { status } = await searchParams;
  const active: RequestStatus | 'all' =
    status && (REQUEST_STATUSES as readonly string[]).includes(status)
      ? (status as RequestStatus)
      : 'all';

  return (
    <div className="request-workspace">
      <header className="request-hero">
        <div>
          <p className="eyebrow">Requests inbox</p>
          <h1>相談・改善を、次の仕事につなげる</h1>
          <p>
            思いつきや困りごとをここに集め、確認・判断・タスク化までを一つの流れで進めます。
          </p>
        </div>
        <NewRequestButton />
      </header>

      <Suspense fallback={<Loading />}>
        <RequestOverview active={active} />
      </Suspense>

      <div className="request-workspace-grid">
        <Suspense key={active} fallback={<Loading />}>
          <RequestList active={active} />
        </Suspense>
        <aside className="request-guide" aria-label="要望の進め方">
          <p className="section-eyebrow">この画面でやること</p>
          <h2>判断を止めない</h2>
          <ol className="request-flow-list">
            <li><span>1</span><div><strong>受け取る</strong><small>まずは要望を残す</small></div></li>
            <li><span>2</span><div><strong>確認する</strong><small>内容と案件を整理する</small></div></li>
            <li><span>3</span><div><strong>仕事にする</strong><small>採用したらタスクへ変換する</small></div></li>
          </ol>
          <Link href="/requests/new" className="request-guide-link">要望を登録する →</Link>
        </aside>
      </div>
    </div>
  );
}

async function RequestOverview({ active }: { active: RequestStatus | 'all' }) {
  const [counts, labels] = await Promise.all([countRequestsByStatus(), loadLabels()]);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const pending = (counts.received ?? 0) + (counts.reviewing ?? 0);

  return (
    <section className="request-overview" aria-label="要望の状況">
      <div className="request-overview-intro">
        <p className="section-eyebrow">現在の状況</p>
        <strong>{pending > 0 ? `${pending}件が確認待ちです` : '確認待ちの要望はありません'}</strong>
        <span>{total}件の要望を状態ごとに整理しています。</span>
      </div>
      <nav className="request-stage-tabs" aria-label="要望を絞り込む">
        <Link href="/requests" className={active === 'all' ? 'is-active' : undefined} aria-current={active === 'all' ? 'page' : undefined}>
          すべて <b>{total}</b>
        </Link>
        {REQUEST_TABS.map((status) => (
          <Link
            key={status}
            href={`/requests?status=${status}`}
            className={active === status ? 'is-active' : undefined}
            aria-current={active === status ? 'page' : undefined}
          >
            {labels[`request.status.${status}`]} <b>{counts[status] ?? 0}</b>
          </Link>
        ))}
      </nav>
    </section>
  );
}

async function RequestList({ active }: { active: RequestStatus | 'all' }) {
  const [requests, labels] = await Promise.all([
    listRequests(active === 'all' ? undefined : [active]),
    loadLabels(),
  ]);

  if (requests.length === 0) {
    return (
      <section className="section-card request-inbox-card" aria-label="要望一覧">
        <EmptyState
          title={active === 'all' ? '要望はまだありません' : 'この状態の要望はありません'}
          description={active === 'all' ? '気づいたことや相談したいことを、まずは短く登録できます。' : '別の状態を選ぶと、該当する要望を確認できます。'}
          actionLabel={active === 'all' ? '要望を登録する' : undefined}
          actionHref={active === 'all' ? '/requests/new' : undefined}
        />
      </section>
    );
  }

  return (
    <section className="section-card request-inbox-card" aria-label="要望一覧">
      <div className="section-card-header">
        <div>
          <p className="section-eyebrow">受信トレイ</p>
          <h2>要望一覧</h2>
        </div>
        <span className="section-count">{requests.length}件</span>
      </div>
      <div className="request-inbox-list">
        {requests.map((request) => (
          <Link key={request.id} href={`/requests/${request.id}`} className="request-inbox-row">
            <div className="request-inbox-main">
              <span className="request-inbox-title">{request.title}</span>
              <span className="request-inbox-meta">
                {request.productName ?? '案件未設定'} ・ {request.reporterName} ・ {formatRelative(request.createdAt)}
              </span>
            </div>
            <div className="request-inbox-state">
              <Badge tone={requestStatusTone(request.status)}>{labels[`request.status.${request.status}`]}</Badge>
              {request.convertedTaskKey && <span className="tabular">{request.convertedTaskKey}</span>}
            </div>
            <span className="chevron" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}
