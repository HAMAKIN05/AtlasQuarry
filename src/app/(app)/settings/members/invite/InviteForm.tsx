'use client';

import { useState } from 'react';

import { Alert, Badge, Field } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { INVITABLE_ROLES, type InvitableRole } from '@/db/schema/enums';
import { ApiError, api } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import { ROLE_LABELS } from '@/lib/labels';

type Item = {
  id: string;
  role: InvitableRole;
  createdByName: string;
  expiresAt: string | Date;
  maxUses: number;
  usedCount: number;
  revokedAt: string | Date | null;
};

/**
 * 招待の発行と管理（F-10）。
 *
 * **リンクは発行した直後に一度だけ出す。** DB にはハッシュしか入れていないので、
 * 閉じたら二度と表示できない。渡し損ねたら作り直す。
 */
export function InviteForm({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState(initial);
  const [role, setRole] = useState<InvitableRole>('developer');
  const [issued, setIssued] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function issue() {
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<{ id: string; token: string; expiresAt: string }>('/invitations', {
        role,
      });
      setIssued(`${window.location.origin}/join?token=${res.token}`);
      const list = await api.get<Item[]>('/invitations');
      setItems(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '発行できませんでした');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!window.confirm('この招待を使えなくします。よろしいですか？')) return;
    await api.delete(`/invitations/${id}`);
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, revokedAt: new Date().toISOString() } : i)),
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <Alert tone="error">{error}</Alert>}

      {issued && (
        <section className="surface flex flex-col gap-3 p-4">
          <p className="font-bold">このリンクを渡してください</p>
          <p className="rounded-xl bg-raised px-3 py-2.5 text-[13px] break-all">{issued}</p>
          <p className="text-sm text-muted-foreground">
            <strong>この画面を閉じると二度と表示できません。</strong>
            渡し損ねたら、もう一度発行してください。
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(issued);
              }}
            >
              コピーする
            </Button>
            <Button type="button" variant="ghost" onClick={() => setIssued(null)}>
              閉じる
            </Button>
          </div>
        </section>
      )}

      <section className="surface flex flex-col gap-4 p-4">
        <h2 className="text-[17px] font-bold">招待を発行する</h2>
        <Field label="役割" htmlFor="inv-role" hint="受け取った人はこの役割で始まります。あとから変えられます。">
          <select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as InvitableRole)}>
            {INVITABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
        <Button type="button" onClick={() => void issue()} disabled={busy}>
          {busy ? '発行しています…' : '発行する'}
        </Button>
      </section>

      {items.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="band-heading">発行済み</h2>
          <div className="card-list">
            {items.map((i) => {
              const dead =
                i.revokedAt !== null ||
                i.usedCount >= i.maxUses ||
                new Date(i.expiresAt).getTime() < Date.now();
              return (
                <div key={i.id} className="card">
                  <span className="flex items-center gap-2">
                    <span className="card-title min-w-0 flex-1">{ROLE_LABELS[i.role]}</span>
                    {dead ? <Badge tone="muted">使えません</Badge> : <Badge tone="done">有効</Badge>}
                  </span>
                  <span className="stack-meta mt-1.5">
                    <span>{i.createdByName}さんが発行</span>
                    <span>期限 {formatDateTime(i.expiresAt)}</span>
                    <span>
                      {i.usedCount}/{i.maxUses} 使用
                    </span>
                  </span>
                  {!dead && (
                    <button
                      type="button"
                      onClick={() => void revoke(i.id)}
                      className="mt-2 min-h-11 text-sm font-semibold text-destructive"
                    >
                      使えなくする
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
