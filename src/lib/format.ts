import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';

import type { TaskStatus } from '@/db/schema/enums';

/**
 * 日付・数値の整形だけを持つ。
 *
 * 呼び名（ステータス名など）は `lib/labels.ts` にある。設定で変更できるものと
 * できないものが混ざると、どこを直せばよいか分からなくなるため分けている。
 */

function toDate(value: Date | string): Date | null {
  const date = typeof value === 'string' ? parseISO(value) : value;
  return isValid(date) ? date : null;
}

/** `date` カラム（YYYY-MM-DD）の表示。 */
export function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = toDate(value);
  return date ? format(date, 'M月d日', { locale: ja }) : '—';
}

/** 年をまたぐ可能性がある場所ではこちらを使う。 */
export function formatDateFull(value: string | null): string {
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

/** 期限までの残り日数。マイナスは超過。 */
export function daysUntil(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const due = toDate(dueDate);
  if (!due) return null;
  const today = new Date();
  const a = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((a - b) / 86_400_000);
}

/** 期限超過の判定。完了・取りやめのタスクは対象外。 */
export function isOverdue(dueDate: string | null, status: TaskStatus): boolean {
  if (!dueDate || status === 'done' || status === 'cancelled') return false;
  const remaining = daysUntil(dueDate);
  return remaining !== null && remaining < 0;
}

/**
 * 期限の言い回し。数字だけより「あと3日」「2日超過」の方が判断が速い。
 */
export function dueLabel(dueDate: string | null, status: TaskStatus): string | null {
  const remaining = daysUntil(dueDate);
  if (remaining === null) return null;
  if (status === 'done' || status === 'cancelled') return formatDate(dueDate);
  if (remaining < 0) return `${Math.abs(remaining)}日超過`;
  if (remaining === 0) return '今日まで';
  if (remaining === 1) return '明日まで';
  if (remaining <= 7) return `あと${remaining}日`;
  return formatDate(dueDate);
}
