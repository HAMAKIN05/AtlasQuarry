import { revokeInvitation } from '@/domain/invitation/service';
import { authed, ok } from '@/lib/api/handler';

export const DELETE = authed<{ id: string }>(async ({ actor, meta, params }) => {
  await revokeInvitation({ ...actor, ip: meta.ip, userAgent: meta.userAgent }, params.id);
  return ok({ revoked: true });
});
