import { revokeApiKey } from '@/domain/mcp/auth';
import { authed, ok } from '@/lib/api/handler';

export const DELETE = authed<{ id: string }>(async ({ actor, meta, params }) => {
  await revokeApiKey({ ...actor, ip: meta.ip, userAgent: meta.userAgent }, params.id);
  return ok({ revoked: true });
});
