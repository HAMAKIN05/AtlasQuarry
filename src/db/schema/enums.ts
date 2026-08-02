/**
 * DB設計書 §2 の列挙値。
 * PostgreSQL の ENUM 型は値の追加・削除が面倒なため使わず、DB側は text + CHECK 制約、
 * TypeScript 側は Union 型 + `as const` オブジェクトで表現する。
 *
 * ここの配列が CHECK 制約の生成元でもあるため、値を変えたら必ずマイグレーションを追加すること。
 */

export const ACTOR_TYPES = ['human', 'agent'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const ACTOR_ROLES = ['owner', 'manager', 'developer', 'requester', 'agent'] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

/** 招待で指定できるロール。`agent` はAPIキー経由で作るため招待の対象外。 */
export const INVITABLE_ROLES = ['owner', 'manager', 'developer', 'requester'] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const PROVIDERS = ['discord', 'github'] as const;
export type Provider = (typeof PROVIDERS)[number];

export const API_SCOPES = ['read', 'read_write'] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const PRODUCT_STATUSES = ['planning', 'active', 'paused', 'archived'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const FEATURE_STATUSES = ['planning', 'active', 'done', 'cancelled'] as const;
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];

export const TASK_STATUSES = [
  'backlog',
  'todo',
  'in_progress',
  'review',
  'done',
  'cancelled',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['urgent', 'high', 'normal', 'low'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const DEPENDENCY_TYPES = ['FS'] as const;
export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

export const REQUEST_SOURCES = ['web', 'discord_command'] as const;
export type RequestSource = (typeof REQUEST_SOURCES)[number];

export const REQUEST_STATUSES = ['received', 'reviewing', 'accepted', 'rejected', 'done'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const DOCUMENT_TYPES = ['spec', 'knowledge', 'minutes'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** comment の対象。attachment はこれに 'comment' を加えたもの（DB設計書 §3.5）。 */
export const COMMENT_TARGET_TYPES = ['task', 'request', 'document'] as const;
export type CommentTargetType = (typeof COMMENT_TARGET_TYPES)[number];

export const ATTACHMENT_TARGET_TYPES = ['task', 'request', 'document', 'comment'] as const;
export type AttachmentTargetType = (typeof ATTACHMENT_TARGET_TYPES)[number];

export const WORKLOG_SOURCES = ['manual', 'agent'] as const;
export type WorklogSource = (typeof WORKLOG_SOURCES)[number];

export const ENTITY_TYPES = [
  'product',
  'feature',
  'task',
  'request',
  'document',
  'comment',
  /*
   * 2026-08-02 追加。ログイン画面からの自己登録で `actor` を作るため。
   * **全ての書き込み操作を activity に記録する**（CLAUDE.md 絶対ルール3）以上、
   * アカウントの作成も記録先が要る。マイグレーション 0002 で CHECK 制約を張り直した。
   */
  'actor',
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const ACTIVITY_ACTIONS = [
  'create',
  'update',
  'delete',
  'status_change',
  'comment',
  'complete',
  'triage',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export const NOTIFY_CHANNELS = ['web', 'mail', 'discord'] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];

/** notification_queue は web を扱わない（web通知は notification テーブルへの挿入で完結する）。 */
export const QUEUED_CHANNELS = ['mail', 'discord'] as const;
export type QueuedChannel = (typeof QUEUED_CHANNELS)[number];

export const QUEUE_STATUSES = ['pending', 'processing', 'sent', 'failed'] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export const INTEGRATION_PROVIDERS = ['discord', 'github', 'smtp'] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export const DECISION_SOURCES = ['discord', 'web'] as const;
export type DecisionSource = (typeof DECISION_SOURCES)[number];

/** タスクを「完了扱い」とみなすステータス。進捗率の算出とアクティブ期限の判定で使う。 */
export const CLOSED_TASK_STATUSES = ['done', 'cancelled'] as const;
