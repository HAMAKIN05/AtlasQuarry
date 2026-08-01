import { describe, expect, it } from 'vitest';

import { applyStatusChange, isClosed } from './status';

// 技術仕様書 §14: ステータス遷移のルールはテスト対象

const NOW = new Date('2026-08-01T09:00:00.000Z');
const EARLIER = new Date('2026-07-20T01:23:45.000Z');

describe('applyStatusChange', () => {
  it('done にすると completed_at がセットされる', () => {
    const result = applyStatusChange({ status: 'in_progress', completedAt: null }, 'done', NOW);
    expect(result).toEqual({ status: 'done', completedAt: NOW });
  });

  it('done から他のステータスへ戻すと completed_at が null に戻る', () => {
    const result = applyStatusChange({ status: 'done', completedAt: EARLIER }, 'todo', NOW);
    expect(result).toEqual({ status: 'todo', completedAt: null });
  });

  it('done のまま更新しても完了時刻は動かない', () => {
    const result = applyStatusChange({ status: 'done', completedAt: EARLIER }, 'done', NOW);
    expect(result.completedAt).toBe(EARLIER);
  });

  it('done だが completed_at が欠けている場合は補う', () => {
    const result = applyStatusChange({ status: 'done', completedAt: null }, 'done', NOW);
    expect(result.completedAt).toBe(NOW);
  });

  it('cancelled は完了扱いにしない', () => {
    const result = applyStatusChange({ status: 'in_progress', completedAt: null }, 'cancelled', NOW);
    expect(result.completedAt).toBeNull();
  });

  it('done 以外への遷移はどの組み合わせでも許可される', () => {
    const statuses = ['backlog', 'todo', 'in_progress', 'review', 'cancelled'] as const;
    for (const from of statuses) {
      for (const to of statuses) {
        expect(applyStatusChange({ status: from, completedAt: null }, to, NOW).status).toBe(to);
      }
    }
  });
});

describe('isClosed', () => {
  it('done と cancelled のみ閉じたタスクとして扱う', () => {
    expect(isClosed('done')).toBe(true);
    expect(isClosed('cancelled')).toBe(true);
    expect(isClosed('backlog')).toBe(false);
    expect(isClosed('todo')).toBe(false);
    expect(isClosed('in_progress')).toBe(false);
    expect(isClosed('review')).toBe(false);
  });
});
