import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { Attachments } from '@/components/Attachments';
import { Badge, BackLink, Loading, PageHeader } from '@/components/app-ui';
import { listAttachments } from '@/domain/attachment/service';
import { candidateLines, listPendingDecisions } from '@/domain/document/minutes';
import { DOCUMENT_TYPE_LABELS, getDocument, listRevisions } from '@/domain/document/service';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';
import { NotFoundError } from '@/lib/errors';
import { formatDate, formatDateTime } from '@/lib/format';
import { renderMarkdown } from '@/lib/markdown';

import { DecisionInbox } from './DecisionInbox';
import { LinesToTasks } from './LinesToTasks';
import { MinutesActions } from './MinutesActions';

export const metadata = { title: '資料 | AtlasQuarry' };

/** S-12 資料の詳細（F-11 / F-23）。 */
export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;

  let doc;
  try {
    doc = await getDocument(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const bodyHtml = doc.bodyMd ? await renderMarkdown(doc.bodyMd) : '';
  const editable = can(actor, 'document.edit') && !doc.isConfirmed;

  return (
    <div className="flex flex-col gap-5">
      {doc.productId && <BackLink href={`/projects/${doc.productId}?view=docs`} label="資料" />}

      <PageHeader title={doc.title} />

      <span className="-mt-2 flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{DOCUMENT_TYPE_LABELS[doc.type]}</Badge>
        {doc.type === 'minutes' && doc.meetingDate && (
          <span className="tabular text-[13px] text-muted-foreground">
            開催 {formatDate(doc.meetingDate)}
          </span>
        )}
        {doc.type === 'minutes' &&
          (doc.isConfirmed ? <Badge tone="done">確定</Badge> : <Badge tone="warn">下書き</Badge>)}
        {doc.lockedByName && <Badge tone="warn">{doc.lockedByName}さんが編集中</Badge>}
      </span>

      <div className="flex flex-wrap gap-2">
        {editable && (
          <Link href={`/docs/${doc.id}/edit`} className="chip">
            編集する
          </Link>
        )}
        {doc.type === 'minutes' && can(actor, 'minutes.confirm') && (
          <MinutesActions id={doc.id} confirmed={doc.isConfirmed} />
        )}
      </div>

      <section className="surface p-4">
        {bodyHtml ? (
          // renderMarkdown が rehype-sanitize を通しているため、入るのは検査済みのHTMLのみ
          <div className="markdown" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
        ) : (
          <p className="text-sm text-muted-foreground">まだ何も書かれていません。</p>
        )}
      </section>

      {doc.type === 'minutes' && !doc.isConfirmed && can(actor, 'document.edit') && (
        <Suspense fallback={<Loading />}>
          <Decisions documentId={doc.id} />
        </Suspense>
      )}

      {doc.type === 'minutes' && doc.productId && can(actor, 'task.create') && (
        <LinesToTasks documentId={doc.id} lines={candidateLines(doc.bodyMd)} />
      )}

      <Suspense fallback={<Loading />}>
        <FilesPanel documentId={doc.id} canEdit={editable} />
      </Suspense>

      <Suspense fallback={<Loading />}>
        <History documentId={doc.id} />
      </Suspense>
    </div>
  );
}

/** Discord から溜まった決定事項。**未取り込みが無ければ何も出さない。** */
async function Decisions({ documentId }: { documentId: string }) {
  const items = await listPendingDecisions();
  return <DecisionInbox documentId={documentId} items={items} />;
}

async function FilesPanel({ documentId, canEdit }: { documentId: string; canEdit: boolean }) {
  const files = await listAttachments('document', documentId);
  return (
    <Attachments
      targetType="document"
      targetId={documentId}
      canEdit={canEdit}
      initial={files.map((f) => ({
        id: f.id,
        filename: f.filename,
        sizeBytes: f.sizeBytes,
        mimeType: f.mimeType,
        uploaderName: f.uploaderName,
      }))}
    />
  );
}

/**
 * 版履歴。**保存のたびには増えない**（同じ人が10分以内に続けて直したぶんは1版にまとまる）。
 */
async function History({ documentId }: { documentId: string }) {
  const revisions = await listRevisions(documentId, 10);
  if (revisions.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="band-heading">
        履歴<span className="count">{revisions.length}</span>
      </h2>
      <div className="card-list">
        {revisions.map((r) => (
          <div key={r.id} className="card">
            <span className="stack-meta">
              <span>{r.authorName}さん</span>
              <span>{formatDateTime(r.createdAt)}</span>
            </span>
            <p className="mt-1.5 line-clamp-3 text-[15px] whitespace-pre-wrap text-muted-foreground">
              {r.bodyMd.slice(0, 200) || '（空）'}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
