import { listTaskTimeline } from '@/domain/activity/queries';
import { authed, ok } from '@/lib/api/handler';
import { parseOrThrow, uuidSchema } from '@/lib/validation';

type Params = { idOrKey: string };

/**
 * GET /api/v1/tasks/:id/activity
 *
 * タスク詳細のタイムライン（S-06）。自分が見られるタスクの履歴なので activity.viewAll は要求しない。
 */
export const GET = authed<Params>(async ({ params }) => {
  const taskId = parseOrThrow(uuidSchema, params.idOrKey);
  return ok(await listTaskTimeline(taskId));
});
