import { createHash, randomBytes } from 'node:crypto';

import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';

import { db } from '@/db/client';
import { actor, apiKey } from '@/db/schema';
import type { ApiScope } from '@/db/schema/enums';
import { recordActivity } from '@/domain/activity/recorder';
import type { ActorContext } from '@/domain/actor-context';
import { assertCan } from '@/lib/auth/rbac';
import { NotFoundError, UnauthorizedError } from '@/lib/errors';

/**
 * MCP の認証（F-18）。
 *
 * **鍵は平文で保存しない。** DB に入れるのは SHA-256 のハッシュだけで、
 * 平文は発行直後に一度だけ返す。招待トークンと同じ扱い。
 *
 * **鍵はエージェント（`actor.type = 'agent'`）に紐づく。** 人間のアカウントに
 * 紐づけると、鍵が漏れたときに人間の権限がそのまま渡る。
 *
 * **触れる範囲を鍵ごとに絞る。** スコープ（read / read_write）と、
 * プロジェクトの限定（`product_ids`）。漏れたときの被害を、その鍵で触れる
 * プロジェクトの中に閉じる。
 */

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export type McpAuth = {
  keyId: string;
  actor: { id: string; name: string; role: string; isActive: boolean };
  scope: ApiScope;
  /** null なら全プロジェクト。配列ならその中だけ */
  productIds: string[] | null;
};

/** `Authorization: Bearer …` を検証する。**失敗の理由は返さない。** */
export async function authenticateMcp(header: string | null): Promise<McpAuth> {
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) throw new UnauthorizedError();

  const rows = await db
    .select({
      id: apiKey.id,
      scope: apiKey.scope,
      productIds: apiKey.productIds,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      actorActive: actor.isActive,
      actorType: actor.type,
    })
    .from(apiKey)
    .innerJoin(actor, eq(actor.id, apiKey.actorId))
    .where(
      and(
        eq(apiKey.keyHash, hashKey(token)),
        isNull(apiKey.revokedAt),
        or(isNull(apiKey.expiresAt), gt(apiKey.expiresAt, new Date())),
      ),
    )
    .limit(1);

  const found = rows[0];
  if (!found || !found.actorActive) throw new UnauthorizedError();

  // 使った時刻を残す。**鍵の値はログにも activity にも出さない**
  await db.update(apiKey).set({ lastUsedAt: new Date() }).where(eq(apiKey.id, found.id));

  return {
    keyId: found.id,
    actor: {
      id: found.actorId,
      name: found.actorName,
      role: found.actorRole,
      isActive: found.actorActive,
    },
    scope: found.scope,
    productIds: found.productIds ?? null,
  };
}

/** 書き込みができる鍵か。 */
export function assertWritable(auth: McpAuth): void {
  if (auth.scope !== 'read_write') {
    throw new UnauthorizedError('この鍵では変更できません');
  }
}

/** そのプロジェクトに触れる鍵か。**IDを直接渡されても越えさせない。** */
export function assertProductAllowed(auth: McpAuth, productId: string): void {
  if (auth.productIds === null) return;
  if (!auth.productIds.includes(productId)) {
    throw new NotFoundError('見つかりません', 'NOT_FOUND');
  }
}

/* ------------------------------------------------------------------ *
 * 鍵の管理（画面から使う）
 * ------------------------------------------------------------------ */

export type ApiKeyItem = {
  id: string;
  name: string;
  scope: ApiScope;
  actorName: string;
  productIds: string[] | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
};

export async function listApiKeys(): Promise<ApiKeyItem[]> {
  return db
    .select({
      id: apiKey.id,
      name: apiKey.name,
      scope: apiKey.scope,
      actorName: actor.name,
      productIds: apiKey.productIds,
      expiresAt: apiKey.expiresAt,
      revokedAt: apiKey.revokedAt,
      lastUsedAt: apiKey.lastUsedAt,
      createdAt: apiKey.createdAt,
    })
    .from(apiKey)
    .innerJoin(actor, eq(actor.id, apiKey.actorId))
    .orderBy(desc(apiKey.createdAt));
}

/**
 * 鍵を発行する。**平文はここでしか返らない。**
 *
 * 紐づけるエージェントが無ければ作る。人間のアカウントには紐づけない。
 */
export async function createApiKey(
  actorCtx: ActorContext,
  input: { name: string; scope: ApiScope; productIds: string[] | null; days: number | null },
): Promise<{ id: string; key: string }> {
  assertCan(actorCtx, 'integration.manage');

  const key = `aq_${randomBytes(32).toString('base64url')}`;

  return db.transaction(async (tx) => {
    // エージェント用の actor を1つ用意して使い回す
    const [existing] = await tx
      .select({ id: actor.id })
      .from(actor)
      .where(and(eq(actor.type, 'agent'), eq(actor.isActive, true)))
      .limit(1);

    let agentId = existing?.id;
    if (!agentId) {
      const [created] = await tx
        .insert(actor)
        .values({
          type: 'agent',
          name: 'AIエージェント',
          role: 'agent',
          isActive: true,
        })
        .returning({ id: actor.id });
      agentId = created!.id;
    }

    const [createdKey] = await tx
      .insert(apiKey)
      .values({
        actorId: agentId,
        name: input.name.trim(),
        keyHash: hashKey(key),
        scope: input.scope,
        productIds: input.productIds,
        expiresAt: input.days ? new Date(Date.now() + input.days * 86_400_000) : null,
      })
      .returning({ id: apiKey.id });

    await recordActivity(tx, {
      actorId: actorCtx.id,
      entityType: 'actor',
      entityId: agentId,
      action: 'create',
      // **鍵そのものは残さない**
      diff: { apiKey: input.name, scope: input.scope },
      ip: actorCtx.ip,
      userAgent: actorCtx.userAgent,
    });

    return { id: createdKey!.id, key };
  });
}

export async function revokeApiKey(actorCtx: ActorContext, id: string): Promise<void> {
  assertCan(actorCtx, 'integration.manage');

  await db.transaction(async (tx) => {
    await tx.update(apiKey).set({ revokedAt: new Date() }).where(eq(apiKey.id, id));
    await recordActivity(tx, {
      actorId: actorCtx.id,
      entityType: 'actor',
      entityId: actorCtx.id,
      action: 'delete',
      diff: { revokedApiKey: id },
      ip: actorCtx.ip,
      userAgent: actorCtx.userAgent,
    });
  });
}

/** エージェントを ActorContext として扱う。 */
export function toActorContext(auth: McpAuth, ip: string | null): ActorContext {
  return {
    id: auth.actor.id,
    name: auth.actor.name,
    role: auth.actor.role as ActorContext['role'],
    isActive: auth.actor.isActive,
    ip,
    userAgent: 'mcp',
  };
}
