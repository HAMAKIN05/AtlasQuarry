import { z } from 'zod';

import { ACTOR_ROLES } from '@/db/schema/enums';
import { updateMember } from '@/domain/member/service';
import { authed, ok } from '@/lib/api/handler';
import { parseOrThrow, readJson, requiredText, uuidSchema } from '@/lib/validation';

type Params = { id: string };

const updateSchema = z
  .object({
    name: requiredText(100).optional(),
    role: z.enum(ACTOR_ROLES).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: '変更内容がありません' });

/** PATCH /api/v1/actors/:id。メンバーの名前・権限・利用停止。管理者以上のみ。 */
export const PATCH = authed<Params>(async ({ request, actor, params, meta }) => {
  const id = parseOrThrow(uuidSchema, params.id);
  const input = parseOrThrow(updateSchema, await readJson(request));
  return ok(await updateMember({ ...actor, ip: meta.ip, userAgent: meta.userAgent }, id, input));
});
