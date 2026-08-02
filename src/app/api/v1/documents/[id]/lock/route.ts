import { acquireLock, releaseLock } from '@/domain/document/service';
import { authed, ok } from '@/lib/api/handler';

/** 編集の開始・終了（排他ロック）。取れなければ誰が持っているかを返す。 */
export const POST = authed<{ id: string }>(async ({ actor, meta, params }) => {
  await acquireLock({ ...actor, ip: meta.ip, userAgent: meta.userAgent }, params.id);
  return ok({ locked: true });
});

export const DELETE = authed<{ id: string }>(async ({ actor, meta, params }) => {
  await releaseLock({ ...actor, ip: meta.ip, userAgent: meta.userAgent }, params.id);
  return ok({ locked: false });
});
