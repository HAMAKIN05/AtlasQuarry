import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';

import type { TaskPriority, TaskStatus } from '@/db/schema/enums';

/**
 * 表示用の整形。
 *
 * **DB上の英語名を画面に出さない**（CLAUDE.md UI規約）。ステータスやロールの日本語名はここに集約する。
 */

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: '未着手',
  todo: '予定',
  in_progress: '進行中',
  review: 'レビュー',
  done: '完了',
  cancelled: '中止',
};

/** かんばんの列の並び。中止は列に出さず、フィルタから辿る。 */
export const BOARD_COLUMNS: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'review', 'done'];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  urgent: '至急',
  high: '高',
  normal: '中',
  low: '低',
};

export const ROLE_LABELS: Record<string, string> = {
  owner: '経営者',
  manager: '管理者',
  developer: '開発者',
  requester: '起票者',
  agent: 'AIエージェント',
};

export const PRODUCT_STATUS_LABELS: Record<string, string> = {
  planning: '計画中',
  active: '進行中',
  paused: '停止中',
  archived: '完了',
};

export const FEATURE_STATUS_LABELS: Record<string, string> = {
  planning: '計画中',
  active: '進行中',
  done: '完了',
  cancelled: '中止',
};

export const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  create: '作成しました',
  update: '更新しました',
  delete: '削除しました',
  status_change: 'ステータスを変更しました',
  comment: 'コメントしました',
  complete: '完了しました',
  triage: 'トリアージしました',
};

function toDate(value: Date | string): Date | null {
  const date = typeof value === 'string' ? parseISO(value) : value;
  return isValid(date) ? date : null;
}

/** `date` カラム（YYYY-MM-DD）の表示。 */
export function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = toDate(value);
  return date ? format(date, 'yyyy/MM/dd', { locale: ja }) : '—';
}

/** timestamptz の表示。ブラウザのローカル時刻に変換される。 */
export function formatDateTime(value: Date | string | null): string {
  if (!value) return '—';
  const date = toDate(value);
  return date ? format(date, 'yyyy/MM/dd HH:mm', { locale: ja }) : '—';
}

export function formatRelative(value: Date | string | null): string {
  if (!value) return '—';
  const date = toDate(value);
  return date ? `${formatDistanceToNowStrict(date, { locale: ja })}前` : '—';
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** 期限超過の判定。完了・中止のタスクは対象外。 */
export function isOverdue(dueDate: string | null, status: TaskStatus): boolean {
  if (!dueDate || status === 'done' || status === 'cancelled') return false;
  const today = format(new Date(), 'yyyy-MM-dd');
  return dueDate < today;
}
