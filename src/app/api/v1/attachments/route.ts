import { addAttachment, listAttachments } from '@/domain/attachment/service';
import { authed, ok } from '@/lib/api/handler';
import { ValidationError } from '@/lib/errors';

/**
 * 添付ファイル（F-13）。
 *
 * **multipart で受ける。** base64 を JSON に入れると、20MB が 27MB に膨らみ、
 * メモリも余計に食う。
 */
export const GET = authed(async ({ request }) => {
  const url = new URL(request.url);
  const targetType = url.searchParams.get('targetType');
  const targetId = url.searchParams.get('targetId');

  if (targetType !== 'task' && targetType !== 'request' && targetType !== 'document' && targetType !== 'comment') {
    throw new ValidationError('対象の種類が不正です');
  }
  if (!targetId) throw new ValidationError('対象を指定してください');

  return ok(await listAttachments(targetType, targetId));
});

export const POST = authed(async ({ request, actor, meta }) => {
  const form = await request.formData();
  const file = form.get('file');
  const targetType = String(form.get('targetType') ?? '');
  const targetId = String(form.get('targetId') ?? '');

  if (!(file instanceof File)) throw new ValidationError('ファイルを選んでください');
  if (targetType !== 'task' && targetType !== 'request' && targetType !== 'document' && targetType !== 'comment') {
    throw new ValidationError('対象の種類が不正です');
  }

  const created = await addAttachment(
    { ...actor, ip: meta.ip, userAgent: meta.userAgent },
    {
      targetType,
      targetId,
      filename: file.name,
      mimeType: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
    },
  );

  return ok(created, 201);
});
