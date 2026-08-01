import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Chip, PageHeader, requestStatusTone } from '@/components/ui';
import { db } from '@/db/client';
import { actor as actorTable } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';
import { listFeatures, listProducts } from '@/domain/product/service';
import { getRequestById } from '@/domain/request/service';
import { loadLabels } from '@/domain/setting/labels';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';
import { NotFoundError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { renderMarkdown } from '@/lib/markdown';

import { ConvertForm } from './ConvertForm';
import { TriagePanel } from './TriagePanel';

type Props = { params: Promise<{ id: string }> };

export const metadata = { title: '要望 | AtlasQuarry' };

async function loadRequest(id: string) {
  try {
    return await getRequestById(id);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

/** S-11 要望詳細。判断とタスク変換をここで行う。 */
export default async function RequestDetailPage({ params }: Props) {
  const actor = await requireActor();
  const { id } = await params;

  const req = await loadRequest(id);
  if (!req) notFound();

  const [labels, bodyHtml, projects, members] = await Promise.all([
    loadLabels(),
    req.bodyMd ? renderMarkdown(req.bodyMd) : Promise.resolve(''),
    listProducts(),
    db
      .select({ id: actorTable.id, name: actorTable.name })
      .from(actorTable)
      .where(eq(actorTable.isActive, true))
      .orderBy(asc(actorTable.name)),
  ]);

  const features = req.productId ? await listFeatures(req.productId) : [];
  const canTriage = can(actor, 'request.triage');

  return (
    <div className="page">
      <nav className="crumbs" aria-label="現在の場所">
        <Link href="/requests">要望</Link>
      </nav>

      <PageHeader title={req.title} />

      <div className="meta">
        <div>
          <dt>状態</dt>
          <dd>
            <Chip tone={requestStatusTone(req.status)}>
              {labels[`request.status.${req.status}`]}
            </Chip>
          </dd>
        </div>
        <div>
          <dt>出した人</dt>
          <dd>{req.reporterName}さん</dd>
        </div>
        <div>
          <dt>出した日時</dt>
          <dd>{formatDateTime(req.createdAt)}</dd>
        </div>
        {req.productName && (
          <div>
            <dt>プロジェクト</dt>
            <dd>{req.productName}</dd>
          </div>
        )}
        {req.decidedByName && (
          <div>
            <dt>判断した人</dt>
            <dd>
              {req.decidedByName}さん・{formatDateTime(req.decidedAt)}
            </dd>
          </div>
        )}
      </div>

      {bodyHtml ? (
        <section className="card">
          <h2 className="card-title">補足</h2>
          {/* renderMarkdown が rehype-sanitize を通しているため、入るのは検査済みのHTMLのみ */}
          <div className="markdown" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
        </section>
      ) : null}

      {req.status === 'rejected' && req.rejectReason && (
        <section className="card">
          <h2 className="card-title">見送った理由</h2>
          <p className="plain">{req.rejectReason}</p>
        </section>
      )}

      {req.convertedTaskKey ? (
        <section className="card">
          <h2 className="card-title">この要望はタスクになりました</h2>
          <p>
            <Link href={`/tasks/${req.convertedTaskKey}`} className="btn-secondary">
              {req.convertedTaskKey} を開く
            </Link>
          </p>
        </section>
      ) : (
        canTriage && (
          <>
            <TriagePanel
              requestId={req.id}
              status={req.status}
              rejectReason={req.rejectReason}
              labels={labels}
            />
            {req.status === 'accepted' && (
              <ConvertForm
                requestId={req.id}
                projects={projects.map((p) => ({ id: p.id, name: p.name }))}
                defaultProjectId={req.productId}
                features={features.map((f) => ({ id: f.id, name: f.name }))}
                members={members}
              />
            )}
          </>
        )
      )}

      {!canTriage && req.status === 'received' && (
        <p className="hint">管理者が内容を見て、やるかどうかを判断します。しばらくお待ちください。</p>
      )}
    </div>
  );
}
