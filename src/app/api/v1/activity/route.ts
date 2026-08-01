import { listRecentActivity } from '@/domain/activity/queries';
import { authed, okList } from '@/lib/api/handler';
import { assertCan } from '@/lib/auth/rbac';
import { parsePagination } from '@/lib/validation';

/** GET /api/v1/activity?limit=&offset=。全件閲覧は owner / manager のみ（機能定義書 §3.2）。 */
export const GET = authed(async ({ request, actor }) => {
  assertCan(actor, 'activity.viewAll');

  const { limit, offset } = parsePagination(new URL(request.url).searchParams);
  const { items, total } = await listRecentActivity(limit, offset);
  return okList(items, { total, limit, offset });
});
