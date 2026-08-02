import type {
  ActorRole,
  FeatureStatus,
  ProductStatus,
  RequestStatus,
  TaskPriority,
  TaskStatus,
} from '@/db/schema/enums';

/**
 * 画面に出す日本語の呼び名（CLAUDE.md UI規約）。
 *
 * **DB上の英語名を画面に出さない。** 変換はここに集約する。
 * ステータスと優先度は `app_setting` で会社の言い方に変更できる（設定 → 表示名）。
 * 既定値はこのファイルが持ち、DB 側は差分だけを持つ。
 */

/** 変更可能な表示名のキー。`{種類}.{値}` の形にして衝突を避ける。 */
export type LabelKey =
  | `task.status.${TaskStatus}`
  | `task.priority.${TaskPriority}`
  | `request.status.${RequestStatus}`;

export const DEFAULT_LABELS: Record<LabelKey, string> = {
  'task.status.backlog': '未着手',
  'task.status.todo': '予定',
  'task.status.in_progress': '作業中',
  'task.status.review': '確認待ち',
  'task.status.done': '完了',
  'task.status.cancelled': '取りやめ',

  'task.priority.urgent': '至急',
  'task.priority.high': '高い',
  'task.priority.normal': 'ふつう',
  'task.priority.low': '低い',

  'request.status.received': '受付中',
  'request.status.reviewing': '検討中',
  /*
   * **命令形をやめる。** 状態の名前なのに「着手する」だとボタンに見える。
   * 実際、一覧の札として出したときにボタンと区別が付かなかった。
   * この状態になるのは、対応するタスクが決まったときだけ。
   */
  'request.status.accepted': 'タスク化済み',
  'request.status.rejected': '見送り',
  'request.status.done': '対応済み',
};

/** 解決済みの表示名。サーバーで組み立ててクライアントへ渡す。 */
export type Labels = Record<LabelKey, string>;

export function mergeLabels(overrides: Record<string, unknown> | null | undefined): Labels {
  const merged = { ...DEFAULT_LABELS };
  if (!overrides) return merged;

  for (const [key, value] of Object.entries(overrides)) {
    // 空文字は「既定値に戻す」の意味。未知のキーは無視する
    if (typeof value === 'string' && value.trim().length > 0 && key in merged) {
      merged[key as LabelKey] = value.trim();
    }
  }
  return merged;
}

/* ---- 変更できない固定の呼び名 ---- */

/**
 * 役割。DB の `owner` / `manager` / `developer` をそのまま出さない。
 *
 * 「上司」ではなく「管理者」にしている。組織上の上下ではなく、
 * このツールで何ができるかを表す語にするため。
 */
export const ROLE_LABELS: Record<ActorRole, string> = {
  owner: '経営者',
  manager: '管理者',
  developer: '開発者',
  requester: '要望のみ',
  agent: 'AIエージェント',
};

/** 役割の説明。設定画面で権限を選ぶときに出す。 */
export const ROLE_DESCRIPTIONS: Record<ActorRole, string> = {
  owner: 'すべての操作。外部サービス連携の設定もできる',
  manager: '要望の判断、タスクやプロジェクトの削除、全員の記録の閲覧',
  developer: '要望を出す、タスクとプロジェクトの作成・編集。削除はできない',
  requester: '要望を出すことと、コメントだけ',
  agent: 'APIから自分に割り当てられたタスクを更新する',
};

export const PROJECT_STATUS_LABELS: Record<ProductStatus, string> = {
  planning: '計画中',
  active: '進行中',
  paused: '一時停止',
  archived: '完了',
};

export const FEATURE_STATUS_LABELS: Record<FeatureStatus, string> = {
  planning: '計画中',
  active: '進行中',
  done: '完了',
  cancelled: '取りやめ',
};

/** タイムラインの文言。主語は表示側で補う（「〇〇さんが」＋これ）。 */
export const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  create: '作成しました',
  update: '内容を変更しました',
  delete: '削除しました',
  status_change: '状態を変えました',
  comment: 'コメントしました',
  complete: '完了にしました',
  triage: '要望を判断しました',
};

/** かんばんの列。取りやめは列に出さず、一覧の絞り込みから辿る。 */
export const BOARD_COLUMNS: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'review', 'done'];

/** 要望一覧のタブ順。判断待ちが先頭に来るようにする。 */
export const REQUEST_TABS: RequestStatus[] = [
  'received',
  'reviewing',
  'accepted',
  'done',
  'rejected',
];
