'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Badge } from '@/components/app-ui';
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
        <p className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {editing ? (
        <div className="flex flex-col gap-3">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-semibold text-muted-foreground">名前</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </label>

          <fieldset className="flex min-w-0 flex-col gap-1.5">
            <legend className="text-sm font-semibold text-muted-foreground">権限</legend>
            {isSelf ? (
              <p className="mb-3 text-sm text-muted-foreground">
                自分の権限は変えられません。変更が必要なときは他の経営者に頼んでください。
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {SELECTABLE.map((r) => (
                  <label key={r} className="flex cursor-pointer items-start gap-2 rounded-md border p-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                    <input
                      type="radio"
                      name={`role-${member.id}`}
                      value={r}
                      checked={role === r}
                      onChange={() => setRole(r)}
                    />
                    <span>
                      <strong>{ROLE_LABELS[r]}</strong>
                      <span className="block text-sm font-normal text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold min-h-11 px-4 disabled:opacity-50 disabled:pointer-events-none bg-primary text-primary-foreground hover:bg-primary/90" onClick={save} disabled={busy}>
              保存
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold min-h-11 text-primary hover:bg-primary-soft disabled:opacity-50"
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold">{member.name}</span>
          <Badge tone={member.isActive ? 'neutral' : 'muted'}>{ROLE_LABELS[member.role]}</Badge>
          {!member.isActive && <Badge tone="muted">利用停止中</Badge>}
          {member.hasTotp && <Badge tone="done">2要素認証あり</Badge>}
          <span className="basis-full text-xs text-muted-foreground">
            ユーザーID: {member.userId ?? '—'}{member.email ? ` · ${member.email}` : ''}
          </span>

          <span className="ml-auto flex gap-1">
            <button type="button" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold min-h-11 text-primary hover:bg-primary-soft disabled:opacity-50" onClick={() => setEditing(true)}>
              変更
            </button>
            {!isSelf &&
              (member.isActive ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold min-h-11 text-destructive hover:bg-destructive-soft disabled:opacity-50"
                  onClick={() => setActive(false)}
                  disabled={busy}
                >
                  利用停止
                </button>
              ) : (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold min-h-11 text-primary hover:bg-primary-soft disabled:opacity-50"
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
