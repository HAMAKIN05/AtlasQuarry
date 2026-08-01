import { z } from 'zod';

import { loadLabels, saveLabels } from '@/domain/setting/labels';
import { authed, ok } from '@/lib/api/handler';
import { assertCan } from '@/lib/auth/rbac';
import { parseOrThrow, readJson } from '@/lib/validation';

/** 空文字は「既定値に戻す」の意味なので許可する。 */
const saveSchema = z.record(z.string(), z.string().max(40, '40文字以内で入力してください'));

/** GET /api/v1/settings/labels */
export const GET = authed(async () => ok(await loadLabels()));

/** PATCH /api/v1/settings/labels。表示名の変更は管理者以上。 */
export const PATCH = authed(async ({ request, actor }) => {
  assertCan(actor, 'member.invite');
  const input = parseOrThrow(saveSchema, await readJson(request));
  return ok(await saveLabels(input));
});
