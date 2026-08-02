import { NextResponse } from 'next/server';

import { deleteAttachment, readAttachment } from '@/domain/attachment/service';
import { authed, ok } from '@/lib/api/handler';

/**
 * 中身を返す。**必ず認証を通してから返す。**
 * `public/` に置くと URL を知る人が誰でも取れてしまうため、ここを唯一の出口にする。
 */
export const GET = authed<{ id: string }>(async ({ params }) => {
  const file = await readAttachment(params.id);

  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      'Content-Type': file.mimeType,
      // **必ずダウンロードさせる。** ブラウザ上で開かせると、HTML等を仕込まれたときに
      // このアプリのオリジンでスクリプトが動く
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
});

export const DELETE = authed<{ id: string }>(async ({ actor, meta, params }) => {
  await deleteAttachment({ ...actor, ip: meta.ip, userAgent: meta.userAgent }, params.id);
  return ok({ deleted: true });
});
