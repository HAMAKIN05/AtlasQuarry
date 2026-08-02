import type { ActorRole } from '@/db/schema/enums';
import { ForbiddenError } from '@/lib/errors';

/**
 * 権限判定（技術仕様書 §2.6）。判定ロジックはこのファイルに集約し、各所に散らさない。
 *
 * **APIハンドラの冒頭で必ず `can()` を通すこと。** UI 側での非表示は補助であり、
 * 権限の実体はサーバー側に置く（受入基準 5.7）。
 *
 * 出典:
 * - 機能定義書 §3.2 の権限マトリクス
 * - 技術仕様書 §2.6 の条件付き権限
 * - マトリクスに行がなかった3点は 2026-08-01 に確認済み:
 *   コメント投稿は認証済み全ロール可 / プロダクト・開発項目の編集は3ロール、削除は owner・manager
 */

export type Action =
  // 要望（F-07 / F-08、v0.2）
  | 'request.create'
  | 'request.triage'
  // プロダクト・開発項目（F-02）
  | 'product.create'
  | 'product.update'
  | 'product.delete'
  | 'feature.create'
  | 'feature.update'
  | 'feature.delete'
  // タスク（F-03）
  | 'task.create'
  | 'task.update'
  | 'task.delete'
  // コメント（F-05）
  | 'comment.create'
  | 'comment.delete'
  // ドキュメント（F-11 / F-23、v0.3）
  | 'document.create'
  | 'document.edit'
  | 'minutes.confirm'
  // その他
  | 'worklog.viewAll'
  | 'member.invite'
  | 'activity.viewAll'
  | 'integration.manage';

/** 判定に必要な最小限の actor 情報。Actor 全体を要求しないことでテストを書きやすくする。 */
export type PermissionSubject = {
  id: string;
  role: ActorRole;
  isActive: boolean;
};

/**
 * 条件付き権限の判定に使う対象リソースの情報。
 *
 * 呼び出し側は関係するフィールドだけ渡す。渡さなかったフィールドは「不明」として扱い、
 * 条件付き権限は成立しない（安全側に倒す）。
 */
export type ResourceContext = {
  /** タスクの担当者。agent の更新可否判定に使う。 */
  assigneeId?: string | null;
  /** コメントの投稿者。本人による削除の判定に使う。 */
  authorId?: string | null;
};

const OWNER_ONLY: readonly ActorRole[] = ['owner'];
const MANAGEMENT: readonly ActorRole[] = ['owner', 'manager'];
const CORE_MEMBERS: readonly ActorRole[] = ['owner', 'manager', 'developer'];
const ALL_ROLES: readonly ActorRole[] = ['owner', 'manager', 'developer', 'requester', 'agent'];

/**
 * ロールだけで判定できる部分の表。
 * 条件付き権限（△）は下の `can()` 内で個別に上書きする。
 */
const ROLE_TABLE: Record<Action, readonly ActorRole[]> = {
  'request.create': ['owner', 'manager', 'developer', 'requester'],
  'request.triage': CORE_MEMBERS,

  'product.create': CORE_MEMBERS,
  'product.update': CORE_MEMBERS,
  // 配下のタスクが CASCADE で消えるため、タスク削除と同じ範囲に揃える
  'product.delete': MANAGEMENT,
  'feature.create': CORE_MEMBERS,
  'feature.update': CORE_MEMBERS,
  'feature.delete': MANAGEMENT,

  'task.create': CORE_MEMBERS,
  'task.update': CORE_MEMBERS,
  'task.delete': MANAGEMENT,

  'comment.create': ALL_ROLES,
  'comment.delete': MANAGEMENT,

  /*
   * **AI は資料を「作る」ことだけできる**（F-26 の議事録ドラフト）。
   * 既存の資料を書き換えさせない。書き換えを許すと、人が直した内容を
   * 次の投入で黙って上書きできてしまう。
   */
  'document.create': [...CORE_MEMBERS, 'agent'],
  'document.edit': CORE_MEMBERS,
  'minutes.confirm': CORE_MEMBERS,

  'worklog.viewAll': MANAGEMENT,
  'member.invite': MANAGEMENT,
  'activity.viewAll': MANAGEMENT,
  'integration.manage': OWNER_ONLY,
};

export function can(
  actor: PermissionSubject,
  action: Action,
  resource?: ResourceContext,
): boolean {
  // 無効化されたアカウントは一切の操作を行えない
  if (!actor.isActive) return false;

  // agent は自分に割当済のタスクだけ更新できる（技術仕様書 §2.6）。
  // 作成は「自分に割当済」が成立しないため不可。
  if (action === 'task.update' && actor.role === 'agent') {
    return resource?.assigneeId === actor.id;
  }

  // コメントは投稿者本人も削除できる（受入基準 5.5）
  if (action === 'comment.delete' && resource?.authorId === actor.id) {
    return true;
  }

  return ROLE_TABLE[action].includes(actor.role);
}

/** `can()` が false なら 403 を投げる。API ハンドラの冒頭で使う。 */
export function assertCan(
  actor: PermissionSubject,
  action: Action,
  resource?: ResourceContext,
): void {
  if (!can(actor, action, resource)) {
    throw new ForbiddenError();
  }
}
