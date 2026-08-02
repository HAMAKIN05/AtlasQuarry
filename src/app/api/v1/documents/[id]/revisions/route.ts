import { z } from 'zod';

import { listRevisions, restoreRevision } from '@/domain/document/service';
import { authed, ok } from '@/lib/api/handler';
import { parseOrThrow, readJson, uuidSchema } from '@/lib/validation';

export const GET = authed<{ id: string }>(async ({ params }) => ok(await listRevisions(params.id)));

/** 過去の版に戻す。**戻す前の本文も履歴に残る。** */
export const POST = authed<{ id: string }>(async ({ request, actor, meta, params }) => {
  const { revisionId } = parseOrThrow(z.object({ revisionId: uuidSchema }), await readJson(request));
  const updated = await restoreRevision(
    { ...actor, ip: meta.ip, userAgent: meta.userAgent },
    params.id,
    revisionId,
  );
  return ok(updated);
});
