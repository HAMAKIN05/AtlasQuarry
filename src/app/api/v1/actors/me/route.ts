import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db/client';
import { actor } from '@/db/schema';
import { changePassword } from '@/domain/auth/service';
import { authed, ok } from '@/lib/api/handler';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/password';
import { parseOrThrow, readJson, requiredText } from '@/lib/validation';

const updateSchema = z
  .object({
    name: requiredText(100).optional(),
    currentPassword: z.string().min(1).optional(),
    newPassword: z.string().min(PASSWORD_MIN_LENGTH, `パスワードは${PASSWORD_MIN_LENGTH}文字以上にしてください`).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: '変更内容がありません' })
  .refine((v) => (v.newPassword === undefined) === (v.currentPassword === undefined), {
    message: 'パスワード変更には現在のパスワードが必要です',
    path: ['currentPassword'],
  });

/** PATCH /api/v1/actors/me。自分の名前とパスワードを変更する。 */
export const PATCH = authed(async ({ request, actor: me }) => {
  const input = parseOrThrow(updateSchema, await readJson(request));

  if (input.newPassword && input.currentPassword) {
    await changePassword(me.id, input.currentPassword, input.newPassword);
  }

  if (input.name) {
    await db.update(actor).set({ name: input.name }).where(eq(actor.id, me.id));
  }

  const rows = await db
    .select({
      id: actor.id,
      name: actor.name,
      email: actor.email,
      role: actor.role,
      type: actor.type,
      avatarUrl: actor.avatarUrl,
    })
    .from(actor)
    .where(eq(actor.id, me.id))
    .limit(1);

  return ok(rows[0]);
});
