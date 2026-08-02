import { drainQueue, purgeOldNotifications } from '@/domain/notification/service';
import { ok, publicRoute } from '@/lib/api/handler';
import { UnauthorizedError } from '@/lib/errors';

/**
 * 溜まっている通知を送る（F-09）。
 *
 * **常駐プロセスを持たない。** 3人・1日数通の量で、ワーカーを別に立てる価値がない。
 * VPS の cron から数分おきに叩く。
 *
 *   * * * * * curl -fsS -H "x-cron-key: …" https://…/api/v1/notifications/drain
 *
 * **認証は cron 用の鍵で行う。** セッション Cookie を持てない相手なので、
 * `CRON_KEY` を突き合わせる。設定が無ければ常に拒否する（＝無効）。
 */
export const POST = publicRoute(async ({ request }) => {
  const expected = process.env.CRON_KEY;
  const given = request.headers.get('x-cron-key');

  if (!expected || expected.length === 0 || given !== expected) {
    throw new UnauthorizedError();
  }

  const result = await drainQueue(50);
  // 溜まった既読も同じ機会に片付ける
  await purgeOldNotifications();

  return ok(result);
});
