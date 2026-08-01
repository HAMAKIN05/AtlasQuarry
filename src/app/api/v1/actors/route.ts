import { asc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { actor } from '@/db/schema';
import { authed, ok } from '@/lib/api/handler';

/**
 * GET /api/v1/actors
 *
 * 担当者選択用のメンバー一覧。**メールやTOTPの有無は返さない。**
 * 担当者を選ぶのに要らない情報であり、返す理由がない。
 */
export const GET = authed(async () =>
  ok(
    await db
      .select({
        id: actor.id,
        name: actor.name,
        role: actor.role,
        type: actor.type,
        avatarUrl: actor.avatarUrl,
      })
      .from(actor)
      .where(eq(actor.isActive, true))
      .orderBy(asc(actor.name)),
  ),
);
