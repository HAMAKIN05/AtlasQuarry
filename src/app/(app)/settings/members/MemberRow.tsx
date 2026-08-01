'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Chip } from '@/components/ui';
import { ACTOR_ROLES, type ActorRole } from '@/db/schema/enums';
import type { MemberItem } from '@/domain/member/service';
import { ApiError, api } from '@/lib/api/client';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/labels';

/** 人が選ぶ対象になる権限だけ出す。agent は API キー用でここからは付けない。 */
const SELECTABLE: ActorRole[] = ACTOR_ROLES.filter((r) => r !== 'agent');

export function MemberRow({ member, isSelf }: { member: MemberItem; isSelf: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(member.name);
  const [role, setRole] = useState<ActorRole>(member.role);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      await api.patch(`/actors/${member.id}`, {
        name,
        ...(role !== member.role ? { role } : {}),
      });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存できませんでした');
    } finally {
      setBusy(false);
    }
  }

  async function setActive(isActive: boolean) {
    const message = isActive
      ? `${member.name}さんの利用を再開します。よろしいですか？`
      : `${member.name}さんを利用停止にします。ログインできなくなります。よろしいですか？`;
    if (!window.confirm(message)) return;

    setError(null);
    setBusy(true);
    try {
      await api.patch(`/actors/${member.id}`, { isActive });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '変更できませんでした');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`member${member.isActive ? '' : ' is-off'}`}>
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      {editing ? (
        <div className="stack">
          <label className="field">
            <span className="field-label">名前</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </label>

          <fieldset className="field">
            <legend className="field-label">権限</legend>
            {isSelf ? (
              <p className="hint">
                自分の権限は変えられません。変更が必要なときは他の経営者に頼んでください。
              </p>
            ) : (
              <div className="choices">
                {SELECTABLE.map((r) => (
                  <label key={r} className="choice">
                    <input
                      type="radio"
                      name={`role-${member.id}`}
                      value={r}
                      checked={role === r}
                      onChange={() => setRole(r)}
                    />
                    <span>
                      <strong>{ROLE_LABELS[r]}</strong>
                      <span className="choice-desc">{ROLE_DESCRIPTIONS[r]}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <div className="actions">
            <button type="button" className="btn-primary" onClick={save} disabled={busy}>
              保存
            </button>
            <button
              type="button"
              className="btn-quiet"
              onClick={() => {
                setEditing(false);
                setName(member.name);
                setRole(member.role);
              }}
            >
              やめる
            </button>
          </div>
        </div>
      ) : (
        <div className="member-view">
          <span className="member-name">{member.name}</span>
          <Chip tone={member.isActive ? 'neutral' : 'muted'}>{ROLE_LABELS[member.role]}</Chip>
          {!member.isActive && <Chip tone="muted">利用停止中</Chip>}
          {member.hasTotp && <Chip tone="done">2要素認証あり</Chip>}
          <span className="member-mail">{member.email}</span>

          <span className="member-actions">
            <button type="button" className="btn-quiet" onClick={() => setEditing(true)}>
              変更
            </button>
            {!isSelf &&
              (member.isActive ? (
                <button
                  type="button"
                  className="btn-quiet btn-quiet-danger"
                  onClick={() => setActive(false)}
                  disabled={busy}
                >
                  利用停止
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={() => setActive(true)}
                  disabled={busy}
                >
                  再開
                </button>
              ))}
          </span>
        </div>
      )}
    </li>
  );
}
