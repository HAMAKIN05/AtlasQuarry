import { z } from 'zod';

import { confirmMinutes, deleteDocument, saveDocument } from '@/domain/document/service';
import { authed, ok } from '@/lib/api/handler';
import { parseOrThrow, readJson } from '@/lib/validation';

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  bodyMd: z.string().optional(),
  meetingDate: z.string().date().nullable().optional(),
  isConfirmed: z.boolean().optional(),
});

export const PATCH = authed<{ id: string }>(async ({ request, actor, meta, params }) => {
  const input = parseOrThrow(patchSchema, await readJson(request));
  const ctx = { ...actor, ip: meta.ip, userAgent: meta.userAgent };

  // 確定は別の権限なので、本文の保存とは分けて扱う
  if (input.isConfirmed !== undefined) {
    await confirmMinutes(ctx, params.id, input.isConfirmed);
  }

  const { isConfirmed, ...rest } = input;
  const updated =
    Object.keys(rest).length > 0 ? await saveDocument(ctx, params.id, rest) : null;

  return ok(updated ?? { id: params.id });
});

export const DELETE = authed<{ id: string }>(async ({ actor, meta, params }) => {
  await deleteDocument({ ...actor, ip: meta.ip, userAgent: meta.userAgent }, params.id);
  return ok({ deleted: true });
});
