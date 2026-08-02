import { z } from 'zod';

import { dismissDecisions, listPendingDecisions, mergeDecisions } from '@/domain/document/minutes';
import { authed, ok } from '@/lib/api/handler';
import { parseOrThrow, readJson } from '@/lib/validation';

/** `/decide` で溜まった決定事項の取り込み（F-24 の後半）。 */

export const GET = authed(async () => ok({ items: await listPendingDecisions() }));

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('merge'),
    documentId: z.string().uuid(),
    noteIds: z.array(z.string().uuid()).min(1).max(50),
  }),
  z.object({
    action: z.literal('dismiss'),
    noteIds: z.array(z.string().uuid()).min(1).max(50),
  }),
]);

export const POST = authed(async ({ request, actor, meta }) => {
  const input = parseOrThrow(bodySchema, await readJson(request));
  const ctx = { ...actor, ip: meta.ip, userAgent: meta.userAgent };

  if (input.action === 'merge') {
    return ok(await mergeDecisions(ctx, input.documentId, input.noteIds));
  }
  return ok(await dismissDecisions(ctx, input.noteIds));
});
