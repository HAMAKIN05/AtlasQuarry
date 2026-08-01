import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge, PageHeader, requestStatusTone, BackLink } from '@/components/app-ui';
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
    <div className="flex flex-col gap-5">
      <BackLink href="/requests" label="要望一覧" />

      <PageHeader title={req.title} />

      <div className="grid overflow-hidden rounded-lg border bg-surface sm:grid-cols-2">
        <div>
          <dt>状態</dt>
          <dd>
            <Badge tone={requestStatusTone(req.status)}>
              {labels[`request.status.${req.status}`]}
            </Badge>
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
        <section className="surface p-4">
          <h2 className="mb-3 text-base font-bold">補足</h2>
          {/* renderMarkdown が rehype-sanitize を通しているため、入るのは検査済みのHTMLのみ */}
          <div className="markdown" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
        </section>
      ) : null}

      {req.status === 'rejected' && req.rejectReason && (
        <section className="surface p-4">
          <h2 className="mb-3 text-base font-bold">見送った理由</h2>
          <p className="whitespace-pre-wrap text-sm">{req.rejectReason}</p>
        </section>
      )}

      {req.convertedTaskKey ? (
        <section className="surface p-4">
          <h2 className="mb-3 text-base font-bold">この要望はタスクになりました</h2>
          <p>
            <Link href={`/tasks/${req.convertedTaskKey}`} className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold min-h-11 px-4 disabled:opacity-50 disabled:pointer-events-none border border-border bg-surface hover:bg-hover">
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
        <p className="mb-3 text-sm text-muted-foreground">管理者が内容を見て、やるかどうかを判断します。しばらくお待ちください。</p>
      )}
    </div>
  );
}
