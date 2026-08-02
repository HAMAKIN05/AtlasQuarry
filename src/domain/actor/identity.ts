import { and, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { actor, actorExternalId } from '@/db/schema';
import type { Provider } from '@/db/schema/enums';
import { recordActivity } from '@/domain/activity/recorder';
import type { ActorContext } from '@/domain/actor-context';
import { ConflictError } from '@/lib/errors';

/**
 * 外部サービスのアカウントとの紐付け（F-22b）。
 *
 * **目的は Discord で名前を呼べるようにすること。** 紐付けが無いと、
 * 通知は「誰かに何かが起きた」としか書けず、本人が気づかない。
 *
 * **自分のぶんだけ登録できる。** 他人の Discord ID を勝手に結びつけられると、
 * その人宛の通知を自分のところへ流せてしまう。
 *
 * 認証には使わない。あくまで宛名のための対応表。
 */

export type Identity = { provider: Provider; externalId: string };

export async function listIdentities(actorId: string): Promise<Identity[]> {
  return db
    .select({ provider: actorExternalId.provider, externalId: actorExternalId.externalId })
    .from(actorExternalId)
    .where(eq(actorExternalId.actorId, actorId));
}

export async function linkIdentity(
  actorCtx: ActorContext,
  provider: Provider,
  externalId: string,
): Promise<void> {
  const value = externalId.trim();

  await db.transaction(async (tx) => {
    // **同じ外部IDを2人に結びつけない。** 宛先が割れる
    const taken = await tx
      .select({ actorId: actorExternalId.actorId })
      .from(actorExternalId)
      .where(and(eq(actorExternalId.provider, provider), eq(actorExternalId.externalId, value)))
      .limit(1);

    if (taken[0] && taken[0].actorId !== actorCtx.id) {
      throw new ConflictError('その ID は既に別のメンバーに紐付いています', null, 'IDENTITY_TAKEN');
    }

    await tx
      .delete(actorExternalId)
      .where(
        and(eq(actorExternalId.actorId, actorCtx.id), eq(actorExternalId.provider, provider)),
      );

    await tx.insert(actorExternalId).values({ actorId: actorCtx.id, provider, externalId: value });

    await recordActivity(tx, {
      actorId: actorCtx.id,
      entityType: 'actor',
      entityId: actorCtx.id,
      action: 'update',
      // **外部IDそのものは残さない。** どの経路を繋いだかだけ
      diff: { linked: provider },
      ip: actorCtx.ip,
      userAgent: actorCtx.userAgent,
    });
  });
}

export async function unlinkIdentity(actorCtx: ActorContext, provider: Provider): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(actorExternalId)
      .where(
        and(eq(actorExternalId.actorId, actorCtx.id), eq(actorExternalId.provider, provider)),
      );

    await recordActivity(tx, {
      actorId: actorCtx.id,
      entityType: 'actor',
      entityId: actorCtx.id,
      action: 'update',
      diff: { unlinked: provider },
      ip: actorCtx.ip,
      userAgent: actorCtx.userAgent,
    });
  });
}

/** 通知の宛名に使う。紐付いていなければ null。 */
export async function discordIdOf(actorId: string): Promise<string | null> {
  const [row] = await db
    .select({ externalId: actorExternalId.externalId })
    .from(actorExternalId)
    .where(and(eq(actorExternalId.actorId, actorId), eq(actorExternalId.provider, 'discord')))
    .limit(1);
  return row?.externalId ?? null;
}

/** Discord のユーザーIDから、こちらのメンバーを引く（`/request` コマンド用）。 */
export async function actorByDiscordId(discordId: string): Promise<{ id: string; name: string; role: string } | null> {
  const [row] = await db
    .select({ id: actor.id, name: actor.name, role: actor.role })
    .from(actorExternalId)
    .innerJoin(actor, eq(actor.id, actorExternalId.actorId))
    .where(
      and(
        eq(actorExternalId.provider, 'discord'),
        eq(actorExternalId.externalId, discordId),
        eq(actor.isActive, true),
      ),
    )
    .limit(1);
  return row ?? null;
}
