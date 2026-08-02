import { notFound, redirect } from 'next/navigation';

import { BackLink, PageHeader } from '@/components/app-ui';
import { getDocument } from '@/domain/document/service';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';
import { NotFoundError } from '@/lib/errors';

import { DocumentEditor } from '../DocumentEditor';

export const metadata = { title: '編集 | AtlasQuarry' };

export default async function DocumentEditPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (!can(actor, 'document.edit')) redirect('/');

  const { id } = await params;

  let doc;
  try {
    doc = await getDocument(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  // 確定済みは読み取り専用。直すには先に確定を外す
  if (doc.isConfirmed) redirect(`/docs/${id}`);

  return (
    <div className="flex flex-col gap-5">
      <BackLink href={`/docs/${id}`} label={doc.title} />
      <PageHeader title="編集" />
      <DocumentEditor
        id={doc.id}
        initialTitle={doc.title}
        initialBody={doc.bodyMd}
        initialMeetingDate={doc.meetingDate}
        isMinutes={doc.type === 'minutes'}
      />
    </div>
  );
}
