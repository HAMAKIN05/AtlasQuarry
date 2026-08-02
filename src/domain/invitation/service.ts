import { createHash, randomBytes } from 'node:crypto';

import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { actor, invitation } from '@/db/schema';
import type { InvitableRole } from '@/db/schema/enums';
import { recordActivity } from '@/domain/activity/recorder';
import type { ActorContext } from '@/domain/actor-context';
import { hashPassword } from '@/lib/auth/password';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/policy';
import { assertCan } from '@/lib/auth/rbac';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';

/**
 * メンバー招待（F-10）。
 *
 * **全員で共有する合言葉より、こちらを正規の入口にする。**
 * 合言葉は誰が使ったか分からず、退職者が出たら作り直しになる。招待リンクなら
 * 発行者・役割・期限・使用回数が残り、1本ずつ止められる。
 *
 * v0.1 にメール送信が無いので、**リンクは発行者が手で渡す**（口頭・チャット）。
 * メールが使えるようになったら送信経路を足すだけで、この仕組みは変えなくてよい。
 *
 * **トークンは平文で保存しない。** DB に入れるのは SHA-256 のハッシュだけで、
 * 平文は発行直後に一度だけ画面へ返す。漏れたときの被害を、リンクを持っている人だけに閉じる。
 */

const TOKEN_BYTES = 32;
const DEFAULT_DAYS = 7;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type InvitationItem = {
  id: string;
  role: InvitableRole;
  createdByName: string;
  expiresAt: Date;
  maxUses: number;
  usedCount: number;
  revokedAt: Date | null;
  createdAt: Date;
};

export async function listInvitations(): Promise<InvitationItem[]> {
  return db
    .select({
      id: invitation.id,
      role: invitation.role,
      createdByName: actor.name,
      expiresAt: invitation.expiresAt,
      maxUses: invitation.maxUses,
      usedCount: invitation.usedCount,
      revokedAt: invitation.revokedAt,
      createdAt: invitation.createdAt,
    })
    .from(invitation)
    .innerJoin(actor, eq(actor.id, invitation.createdBy))
    .orderBy(desc(invitation.createdAt));
}

/** 招待を作る。**平文のトークンはここでしか返らない。** */
export async function createInvitation(
  actorCtx: ActorContext,
  input: { role: InvitableRole; days?: number; maxUses?: number },
): Promise<{ id: string; token: string; expiresAt: Date }> {
  assertCan(actorCtx, 'member.invite');

  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const days = input.days ?? DEFAULT_DAYS;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(invitation)
      .values({
        tokenHash: hashToken(token),
        role: input.role,
        createdBy: actorCtx.id,
        expiresAt,
        maxUses: input.maxUses ?? 1,
      })
      .returning({ id: invitation.id });

    await recordActivity(tx, {
      actorId: actorCtx.id,
      entityType: 'actor',
      entityId: created!.id,
      // **トークンは残さない。** 役割と期限だけ
      diff: { role: input.role, expiresAt: expiresAt.toISOString() },
      action: 'create',
      ip: actorCtx.ip,
      userAgent: actorCtx.userAgent,
    });

    return { id: created!.id, token, expiresAt };
  });
}

export async function revokeInvitation(actorCtx: ActorContext, id: string): Promise<void> {
  assertCan(actorCtx, 'member.invite');

  await db.transaction(async (tx) => {
    const [found] = await tx.select().from(invitation).where(eq(invitation.id, id)).limit(1);
    if (!found) throw new NotFoundError('招待が見つかりません', 'INVITATION_NOT_FOUND');

    await tx.update(invitation).set({ revokedAt: new Date() }).where(eq(invitation.id, id));

    await recordActivity(tx, {
      actorId: actorCtx.id,
      entityType: 'actor',
      entityId: id,
      action: 'delete',
      diff: { revoked: true },
      ip: actorCtx.ip,
      userAgent: actorCtx.userAgent,
    });
  });
}

/** 招待が使えるか。**画面に出す前の確認用。** 使えない理由は返さない（存在を探らせない）。 */
export async function checkInvitation(token: string): Promise<{ valid: boolean; role?: InvitableRole }> {
  const [found] = await db
    .select({ role: invitation.role })
    .from(invitation)
    .where(
      and(
        eq(invitation.tokenHash, hashToken(token)),
        isNull(invitation.revokedAt),
        gt(invitation.expiresAt, new Date()),
        sql`${invitation.usedCount} < ${invitation.maxUses}`,
      ),
    )
    .limit(1);

  return found ? { valid: true, role: found.role } : { valid: false };
}

/**
 * 招待を使ってアカウントを作る。
 *
 * **役割は招待に書かれたものになる。** 受け取る側には選ばせない。
 * 使用回数はこのトランザクションで進める（同時に使われても上限を越えない）。
 */
export async function acceptInvitation(input: {
  token: string;
  name: string;
  email: string;
  password: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<void> {
  if (input.password.length < PASSWORD_MIN_LENGTH) {
    throw new ValidationError(`パスワードは${PASSWORD_MIN_LENGTH}文字以上にしてください`, {
      fields: { password: [`パスワードは${PASSWORD_MIN_LENGTH}文字以上にしてください`] },
    });
  }

  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);

  await db.transaction(async (tx) => {
    // 使用回数を進めながら取る。**条件を満たさなければ0行**なので、同時実行でも越えない
    const claimed = await tx
      .update(invitation)
      .set({ usedCount: sql`${invitation.usedCount} + 1` })
      .where(
        and(
          eq(invitation.tokenHash, hashToken(input.token)),
          isNull(invitation.revokedAt),
          gt(invitation.expiresAt, new Date()),
          sql`${invitation.usedCount} < ${invitation.maxUses}`,
        ),
      )
      .returning({ id: invitation.id, role: invitation.role });

    const inv = claimed[0];
    if (!inv) {
      throw new ValidationError('この招待は使えません。発行した人に確認してください');
    }

    const existing = await tx
      .select({ id: actor.id })
      .from(actor)
      .where(eq(actor.email, email))
      .limit(1);
    if (existing.length > 0) {
      throw new ConflictError('このメールアドレスは既に使われています', null, 'EMAIL_TAKEN');
    }

    const [created] = await tx
      .insert(actor)
      .values({
        type: 'human',
        name: input.name.trim(),
        email,
        role: inv.role,
        passwordHash,
        isActive: true,
      })
      .returning({ id: actor.id, name: actor.name });

    await recordActivity(tx, {
      actorId: created!.id,
      entityType: 'actor',
      entityId: created!.id,
      action: 'create',
      diff: { name: created!.name, role: inv.role, via: 'invitation' },
      ip: input.ip,
      userAgent: input.userAgent,
    });
  });
}
