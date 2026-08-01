import { describe, expect, it } from 'vitest';

import {
  POSITION_STEP,
  needsRebalance,
  positionBetween,
  positionForIndex,
  rebalancedPositions,
} from './position';

// 技術仕様書 §14: position は境界条件でバグが出やすいためテスト対象に含める

describe('positionBetween', () => {
  it('空リストへの挿入は 0', () => {
    expect(positionBetween(null, null)).toBe(0);
  });

  it('先頭への挿入は next - STEP', () => {
    expect(positionBetween(null, 1024)).toBe(1024 - POSITION_STEP);
  });

  it('末尾への挿入は prev + STEP', () => {
    expect(positionBetween(2048, null)).toBe(2048 + POSITION_STEP);
  });

  it('間への挿入は中間値', () => {
    expect(positionBetween(1024, 2048)).toBe(1536);
  });

  it('負の値をまたいでも中間値になる', () => {
    expect(positionBetween(-1024, 1024)).toBe(0);
  });

  it('挿入した値は常に prev < x < next を満たす', () => {
    let prev = 0;
    let next = POSITION_STEP;
    for (let i = 0; i < 20; i += 1) {
      const mid = positionBetween(prev, next);
      expect(mid).toBeGreaterThan(prev);
      expect(mid).toBeLessThan(next);
      next = mid;
    }
    expect(prev).toBe(0);
  });
});

describe('needsRebalance', () => {
  it('要素0件・1件では不要', () => {
    expect(needsRebalance([])).toBe(false);
    expect(needsRebalance([1024])).toBe(false);
  });

  it('十分に離れていれば不要', () => {
    expect(needsRebalance([1024, 2048, 3072])).toBe(false);
  });

  it('隣接差が閾値未満なら必要', () => {
    expect(needsRebalance([1024, 1024 + 1e-9])).toBe(true);
  });

  it('同値が並んでいれば必要', () => {
    expect(needsRebalance([1024, 1024])).toBe(true);
  });

  it('中間値挿入を繰り返すと最終的に再採番が必要になる', () => {
    let prev = 0;
    let next = POSITION_STEP;
    for (let i = 0; i < 60; i += 1) {
      next = positionBetween(prev, next);
    }
    expect(needsRebalance([prev, next])).toBe(true);
  });
});

describe('rebalancedPositions', () => {
  it('STEP 間隔の昇順を返す', () => {
    expect(rebalancedPositions(3)).toEqual([1024, 2048, 3072]);
  });

  it('0件なら空配列', () => {
    expect(rebalancedPositions(0)).toEqual([]);
  });
});

describe('positionForIndex', () => {
  const ordered = [1024, 2048, 3072];

  it('先頭へ', () => {
    expect(positionForIndex(ordered, 0)).toBe(0);
  });

  it('中間へ', () => {
    expect(positionForIndex(ordered, 1)).toBe(1536);
  });

  it('末尾へ', () => {
    expect(positionForIndex(ordered, 3)).toBe(4096);
  });

  it('範囲外の index は端に丸める', () => {
    expect(positionForIndex(ordered, -5)).toBe(0);
    expect(positionForIndex(ordered, 99)).toBe(4096);
  });

  it('空リストなら 0', () => {
    expect(positionForIndex([], 0)).toBe(0);
  });
});
