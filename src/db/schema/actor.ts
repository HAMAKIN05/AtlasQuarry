import { sql } from 'drizzle-orm';
import {
  check,
  index,
  inet,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uuid,
  boolean,
} from 'drizzle-orm/pg-core';

import { createdAt, inList, primaryId, tz } from './_columns';
import {
  ACTOR_ROLES,
  ACTOR_TYPES,
  API_SCOPES,
  INVITABLE_ROLES,
  PROVIDERS,
  type ActorRole,
  type ActorType,
  type ApiScope,
  type InvitableRole,
  type Provider,
} from './enums';

/**
 * 人間とAIエージェントを1テーブルで扱う（機能定義書 §6.2）。
 * 分けると担当者・工数・通知・ヒートマップの全機能で分岐が発生する。
 */
export const actor = pgTable(
  'actor',
  {
    id: primaryId(),
    type: text('type').$type<ActorType>().notNull(),
    name: text('name').notNull(),
    userId: text('user_id').unique(),
    email: text('email').unique(),
    role: text('role').$type<ActorRole>().notNull(),
    passwordHash: text('password_hash'),
    /** 技術仕様書 §2.4 により暗号化して保存する。平文の TOTP シークレットを入れない。 */
    totpSecret: text('totp_secret'),
    avatarUrl: text('avatar_url'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    check('actor_type_check', inList(t.type, ACTOR_TYPES)),
    check('actor_role_check', inList(t.role, ACTOR_ROLES)),
    check(
      'human_needs_credentials',
      sql`${t.type} <> 'human' OR (${t.userId} IS NOT NULL AND ${t.passwordHash} IS NOT NULL)`,
    ),
  ],
);

/** Discord / GitHub のユーザーIDとの紐付け（F-22b）。v0.1 ではテーブルのみ。 */
export const actorExternalId = pgTable(
  'actor_external_id',
  {
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actor.id, { onDelete: 'cascade' }),
    provider: text('provider').$type<Provider>().notNull(),
    externalId: text('external_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.actorId, t.provider] }),
    unique('actor_external_id_provider_external_id_key').on(t.provider, t.externalId),
    check('actor_external_id_provider_check', inList(t.provider, PROVIDERS)),
  ],
);

/**
 * セッション。技術仕様書 §2.2 のとおり `token_hash` には SHA-256 のみを保存し、
 * 平文トークンは Cookie にしか存在させない。
 */
export const session = pgTable(
  'session',
  {
    id: primaryId(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actor.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: tz('expires_at').notNull(),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [index('idx_session_actor').on(t.actorId), index('idx_session_expires').on(t.expiresAt)],
);

/** 招待（F-10 / v0.2）。v0.1 ではテーブルのみ作り、画面・APIは作らない。 */
export const invitation = pgTable(
  'invitation',
  {
    id: primaryId(),
    tokenHash: text('token_hash').notNull().unique(),
    role: text('role').$type<InvitableRole>().notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => actor.id),
    expiresAt: tz('expires_at').notNull(),
    maxUses: smallint('max_uses').notNull().default(1),
    usedCount: smallint('used_count').notNull().default(0),
    revokedAt: tz('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [check('invitation_role_check', inList(t.role, INVITABLE_ROLES))],
);

/** MCPサーバー用APIキー（F-18 / v1.0）。v0.1 ではテーブルのみ。 */
export const apiKey = pgTable(
  'api_key',
  {
    id: primaryId(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actor.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull().unique(),
    scope: text('scope').$type<ApiScope>().notNull(),
    productIds: uuid('product_ids').array(),
    expiresAt: tz('expires_at'),
    revokedAt: tz('revoked_at'),
    lastUsedAt: tz('last_used_at'),
    createdAt: createdAt(),
  },
  (t) => [check('api_key_scope_check', inList(t.scope, API_SCOPES))],
);

/**
 * ログイン試行の記録。技術仕様書 §2.5 のレート制限（5回 / 15分 / IP+ユーザーID）に使う。
 *
 * 3名規模のためDBカウンタで十分で、Redis は導入しない。
 * 保持期間の管理はせず、判定は常に直近15分の窓で行う（古い行は運用で切り詰める）。
 */
export const loginAttempt = pgTable(
  'login_attempt',
  {
    id: primaryId(),
    identifier: text('identifier').notNull(),
    ip: inet('ip'),
    succeeded: boolean('succeeded').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('idx_login_attempt_identifier').on(t.identifier, t.createdAt.desc()),
    index('idx_login_attempt_ip').on(t.ip, t.createdAt.desc()),
  ],
);

export type Actor = typeof actor.$inferSelect;
export type NewActor = typeof actor.$inferInsert;
export type Session = typeof session.$inferSelect;
