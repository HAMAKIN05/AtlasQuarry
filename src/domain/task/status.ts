import type { TaskStatus } from '@/db/schema/enums';

/**
 * ステータス変更に伴う派生値の決定（受入基準 5.3）。
 *
 * **遷移の可否そのものは制限しない。** 仕様書に許可・禁止の定義がないため、
 * 勝手なルールを作らず「どのステータスへでも変更できる」ままにしてある。
 * ここが決めるのは completed_at をどうするかだけ。
 */

export type StatusChange = {
  /** 変更後のステータス。 */
  status: TaskStatus;
  /** null なら完了時刻をクリアする。 */
  completedAt: Date | null;
};

/**
 * ステータス変更の結果を返す。
 *
 * - `done` にすると completed_at がセットされる
 * - `done` から他へ戻すと completed_at が null に戻る
 * - `done` のまま更新した場合は元の完了時刻を保つ（触るたびに完了日時が動くと履歴が壊れる）
 */
export function applyStatusChange(
  current: { status: TaskStatus; completedAt: Date | null },
  next: TaskStatus,
  now: Date = new Date(),
): StatusChange {
  if (next !== 'done') {
    return { status: next, completedAt: null };
  }
  if (current.status === 'done' && current.completedAt !== null) {
    return { status: next, completedAt: current.completedAt };
  }
  return { status: next, completedAt: now };
}

/** 完了・中止を「閉じたタスク」として扱う。期限超過の判定などで使う。 */
export function isClosed(status: TaskStatus): boolean {
  return status === 'done' || status === 'cancelled';
}
