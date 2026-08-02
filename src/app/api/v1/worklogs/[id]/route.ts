import { deleteWorkLog } from '@/domain/worklog/service';
import { authed, ok } from '@/lib/api/handler';

export const DELETE = authed<{ id: string }>(async ({ actor, meta, params }) => {
  await deleteWorkLog({ ...actor, ip: meta.ip, userAgent: meta.userAgent }, params.id);
  return ok({ deleted: true });
});
