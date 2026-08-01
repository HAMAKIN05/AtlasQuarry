import { describe, expect, it } from 'vitest';

import type { ActorRole } from '@/db/schema/enums';

import { can, type Action, type PermissionSubject } from './rbac';

// 技術仕様書 §14: 権限は間違えると影響が大きいためテスト対象に含める

const ROLES: ActorRole[] = ['owner', 'manager', 'developer', 'requester', 'agent'];

function subject(role: ActorRole, id = 'actor-1', isActive = true): PermissionSubject {
  return { id, role, isActive };
}

/** 機能定義書 §3.2 の権限マトリクスをそのまま表にしたもの。△ は別途テストする。 */
const MATRIX: Array<{ action: Action; allowed: ActorRole[] }> = [
  { action: 'request.create', allowed: ['owner', 'manager', 'developer', 'requester'] },
  { action: 'request.triage', allowed: ['owner', 'manager', 'developer'] },
  { action: 'product.create', allowed: ['owner', 'manager', 'developer'] },
  { action: 'product.update', allowed: ['owner', 'manager', 'developer'] },
  { action: 'product.delete', allowed: ['owner', 'manager'] },
  { action: 'feature.create', allowed: ['owner', 'manager', 'developer'] },
  { action: 'feature.update', allowed: ['owner', 'manager', 'developer'] },
  { action: 'feature.delete', allowed: ['owner', 'manager'] },
  { action: 'task.create', allowed: ['owner', 'manager', 'developer'] },
  { action: 'task.delete', allowed: ['owner', 'manager'] },
  { action: 'comment.create', allowed: ['owner', 'manager', 'developer', 'requester', 'agent'] },
  { action: 'document.edit', allowed: ['owner', 'manager', 'developer'] },
  { action: 'minutes.confirm', allowed: ['owner', 'manager', 'developer'] },
  { action: 'worklog.viewAll', allowed: ['owner', 'manager'] },
  { action: 'member.invite', allowed: ['owner', 'manager'] },
  { action: 'activity.viewAll', allowed: ['owner', 'manager'] },
  { action: 'integration.manage', allowed: ['owner'] },
];

describe('can（ロールのみで決まる権限）', () => {
  for (const { action, allowed } of MATRIX) {
    for (const role of ROLES) {
      const expected = allowed.includes(role);
      it(`${action} / ${role} → ${expected}`, () => {
        expect(can(subject(role), action)).toBe(expected);
      });
    }
  }
});

describe('can（条件付き権限）', () => {
  it('agent は自分に割当済のタスクだけ更新できる', () => {
    const agent = subject('agent', 'agent-1');
    expect(can(agent, 'task.update', { assigneeId: 'agent-1' })).toBe(true);
    expect(can(agent, 'task.update', { assigneeId: 'someone-else' })).toBe(false);
    expect(can(agent, 'task.update', { assigneeId: null })).toBe(false);
  });

  it('担当者情報を渡さない場合、agent の更新は許可しない', () => {
    expect(can(subject('agent', 'agent-1'), 'task.update')).toBe(false);
  });

  it('agent はタスクを作成できない', () => {
    expect(can(subject('agent'), 'task.create', { assigneeId: 'actor-1' })).toBe(false);
  });

  it('developer は担当外のタスクも更新できる', () => {
    expect(can(subject('developer', 'dev-1'), 'task.update', { assigneeId: 'other' })).toBe(true);
  });

  it('コメントは投稿者本人が削除できる', () => {
    expect(can(subject('developer', 'dev-1'), 'comment.delete', { authorId: 'dev-1' })).toBe(true);
  });

  it('他人のコメントは manager 以上のみ削除できる', () => {
    expect(can(subject('developer', 'dev-1'), 'comment.delete', { authorId: 'other' })).toBe(false);
    expect(can(subject('manager', 'mgr-1'), 'comment.delete', { authorId: 'other' })).toBe(true);
    expect(can(subject('owner', 'own-1'), 'comment.delete', { authorId: 'other' })).toBe(true);
  });

  it('requester は自分のコメントなら削除できるが他人のものは削除できない', () => {
    expect(can(subject('requester', 'req-1'), 'comment.delete', { authorId: 'req-1' })).toBe(true);
    expect(can(subject('requester', 'req-1'), 'comment.delete', { authorId: 'other' })).toBe(false);
  });
});

describe('can（無効化されたアカウント）', () => {
  it('is_active が false なら全ての操作を拒否する', () => {
    const inactive = subject('owner', 'owner-1', false);
    for (const { action } of MATRIX) {
      expect(can(inactive, action)).toBe(false);
    }
    expect(can(inactive, 'task.update', { assigneeId: 'owner-1' })).toBe(false);
    expect(can(inactive, 'comment.delete', { authorId: 'owner-1' })).toBe(false);
  });
});
