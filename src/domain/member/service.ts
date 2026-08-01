import { asc, eq, ne, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { actor, session } from '@/db/schema';
import type { ActorRole, ActorType } from '@/db/schema/enums';
import { assertCan } from '@/lib/auth/rbac';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import type { ActorContext } from '@/domain/actor-context';

/**
 * メンバー管理（設定 → メンバー）。
 *
 * v0.1 では招待（F-10）が無いため、**追加はシードスクリプトのみ**。
 * ここでできるのは既存メンバーの名前・権限の変更と、利用停止。
 */

export type MemberItem = {
  id: string;
  name: string;
  email: string | null;
  role: ActorRole;
  type: ActorType;
  isActive: boolean;
  hasTotp: boolean;
};

export async function listMembers(): Promise<MemberItem[]> {
  const rows = await db
    .select({
      id: actor.id,
      name: actor.name,
      email: actor.email,
      role: actor.role,
      type: actor.type,
      isActive: actor.isActive,
      totpSecret: actor.totpSecret,
    })
    .from(actor)
    .orderBy(asc(actor.isActive), asc(actor.name));

  return rows.map(({ totpSecret, ...rest }) => ({ ...rest, hasTotp: totpSecret !== null }));
}

export type UpdateMemberInput = {
  name?: string;
  role?: ActorRole;
  isActive?: boolean;
};

/**
 * メンバーを更新する。
 *
 * 事故を2つ防いでいる。
 * 1. **自分自身の権限は下げられない。** 経営者が誤って自分を開発者にすると、戻す手段が消える
 * 2. **最後の有効な経営者は降格・停止できない。** 誰も設定を触れなくなる
 */
export async function updateMember(
  actorCtx: ActorContext,
  targetId: string,
  input: UpdateMemberInput,
): Promise<MemberItem> {
  assertCan(actorCtx, 'member.invite');

  const rows = await db.select().from(actor).where(eq(actor.id, targetId)).limit(1);
  const target = rows[0];
  if (!target) throw new NotFoundError('メンバーが見つかりません', 'ACTOR_NOT_FOUND');

  const losingOwnerRights =
    (input.role !== undefined && input.role !== 'owner' && target.role === 'owner') ||
    (input.isActive === false && target.role === 'owner');

  if (targetId === actorCtx.id && input.role !== undefined && input.role !== target.role) {
    throw new ValidationError('自分の権限は変更できません。他の経営者に依頼してください');
  }
  if (targetId === actorCtx.id && input.isActive === false) {
    throw new ValidationError('自分を利用停止にはできません');
  }

  if (losingOwnerRights) {
    const remaining = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(actor)
      .where(sql`${actor.role} = 'owner' AND ${actor.isActive} = true AND ${ne(actor.id, targetId)}`);

    if ((remaining[0]?.count ?? 0) === 0) {
      throw new ConflictError(
        '経営者が居なくなるため変更できません。先に他の人を経営者にしてください',
        null,
        'LAST_OWNER',
      );
    }
  }

  const [updated] = await db
    .update(actor)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    })
    .where(eq(actor.id, targetId))
    .returning();

  // 利用停止にしたら、その人のセッションをその場で切る。
  // 残したままだと Cookie を持っている間は操作できてしまう
  if (input.isActive === false) {
    await db.delete(session).where(eq(session.actorId, targetId));
  }

  return {
    id: updated!.id,
    name: updated!.name,
    email: updated!.email,
    role: updated!.role,
    type: updated!.type,
    isActive: updated!.isActive,
    hasTotp: updated!.totpSecret !== null,
  };
}
