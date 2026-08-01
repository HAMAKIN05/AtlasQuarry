/**
 * 並び順（技術仕様書 §7）。
 *
 * かんばんの並び替えで他行を UPDATE しないよう、前後の中間値を取る方式にする。
 * 精度が枯渇したら（隣接差が REBALANCE_THRESHOLD 未満）リスト全体を振り直す。
 */

export const POSITION_STEP = 1024;

/** 隣接値の差がこれを下回ったら再採番する。 */
export const REBALANCE_THRESHOLD = 1e-6;

/**
 * prev と next の間に入る position を返す。
 *
 * - 両方 null（空リストへの挿入） → 0
 * - prev のみ null（先頭への挿入）  → next - STEP
 * - next のみ null（末尾への挿入）  → prev + STEP
 */
export function positionBetween(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return 0;
  if (prev === null) return next! - POSITION_STEP;
  if (next === null) return prev + POSITION_STEP;
  return (prev + next) / 2;
}

/**
 * 再採番が必要かを判定する。
 *
 * positions は表示順（昇順）で渡すこと。
 */
export function needsRebalance(positions: readonly number[]): boolean {
  for (let i = 1; i < positions.length; i += 1) {
    const prev = positions[i - 1]!;
    const curr = positions[i]!;
    if (curr - prev < REBALANCE_THRESHOLD) return true;
  }
  return false;
}

/**
 * 表示順を保ったまま STEP 間隔に振り直した値を返す。
 *
 * 呼び出し側は返り値を元の並び順どおりに割り当てる。
 */
export function rebalancedPositions(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * POSITION_STEP);
}

/**
 * 「idx 番目の位置へ移動する」場合の position を求める。
 *
 * ordered は移動対象を**除いた**リストを表示順で渡す。targetIndex はその中での挿入位置
 * （0 なら先頭、ordered.length なら末尾）。
 */
export function positionForIndex(ordered: readonly number[], targetIndex: number): number {
  const clamped = Math.max(0, Math.min(targetIndex, ordered.length));
  const prev = clamped === 0 ? null : ordered[clamped - 1]!;
  const next = clamped === ordered.length ? null : ordered[clamped]!;
  return positionBetween(prev, next);
}
