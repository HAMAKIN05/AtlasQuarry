'use client';

import { useState } from 'react';

import { Alert, Badge, Field } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ApiScope } from '@/db/schema/enums';
import { ApiError, api } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';

type Item = {
  id: string;
  name: string;
  scope: ApiScope;
  revokedAt: string | Date | null;
  lastUsedAt: string | Date | null;
  createdAt: string | Date;
};

/**
 * AIエージェント用の鍵（F-18 / MCP）。
 *
 * **鍵は発行直後に一度だけ出す。** DB にはハッシュしか入っていない。
 * 読み取り専用と書き込み可を分け、既定は読み取り専用にする。
 */
export function ApiKeyForm({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState(initial);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<ApiScope>('read');
  const [issued, setIssued] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function issue() {
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<{ id: string; key: string }>('/api-keys', { name, scope });
      setIssued(res.key);
      setItems(await api.get<Item[]>('/api-keys'));
      setName('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '発行できませんでした');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!window.confirm('この鍵を使えなくします。よろしいですか？')) return;
    await api.delete(`/api-keys/${id}`);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, revokedAt: new Date().toISOString() } : i)));
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <Alert tone="error">{error}</Alert>}

      {issued && (
        <section className="surface flex flex-col gap-3 p-4">
          <p className="font-bold">この鍵を控えてください</p>
          <p className="rounded-xl bg-raised px-3 py-2.5 text-[13px] break-all">{issued}</p>
          <p className="text-sm text-muted-foreground">
            <strong>この画面を閉じると二度と表示できません。</strong>
          </p>
          <p className="rounded-xl bg-raised px-3 py-2.5 text-[13px] break-all">
            claude mcp add --transport http atlasquarry https://atlasquarry.duckdns.org/api/mcp
            --header &quot;Authorization: Bearer {issued}&quot;
          </p>
          <Button type="button" variant="ghost" onClick={() => setIssued(null)}>
            閉じる
          </Button>
        </section>
      )}

      <section className="surface flex flex-col gap-4 p-4">
        <h2 className="text-[17px] font-bold">鍵を発行する</h2>
        <Field label="名前" htmlFor="key-name" hint="どこで使う鍵かが分かる名前を。">
          <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：開発PCのClaude Code" />
        </Field>
        <Field label="できること" htmlFor="key-scope">
          <select id="key-scope" value={scope} onChange={(e) => setScope(e.target.value as ApiScope)}>
            <option value="read">読むだけ</option>
            <option value="read_write">読む・状態を変える・コメントする</option>
          </select>
        </Field>
        <Button type="button" disabled={busy || name.trim().length === 0} onClick={() => void issue()}>
          {busy ? '発行しています…' : '発行する'}
        </Button>
      </section>

      {items.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="band-heading">発行済み</h2>
          <div className="card-list">
            {items.map((k) => (
              <div key={k.id} className="card">
                <span className="flex items-center gap-2">
                  <span className="card-title min-w-0 flex-1">{k.name}</span>
                  {k.revokedAt ? (
                    <Badge tone="muted">停止済み</Badge>
                  ) : (
                    <Badge tone={k.scope === 'read' ? 'neutral' : 'warn'}>
                      {k.scope === 'read' ? '読むだけ' : '書き込み可'}
                    </Badge>
                  )}
                </span>
                <span className="stack-meta mt-1.5">
                  <span>発行 {formatDateTime(k.createdAt)}</span>
                  {k.lastUsedAt && <span>最終利用 {formatDateTime(k.lastUsedAt)}</span>}
                </span>
                {!k.revokedAt && (
                  <button
                    type="button"
                    onClick={() => void revoke(k.id)}
                    className="mt-2 min-h-11 text-sm font-semibold text-destructive"
                  >
                    使えなくする
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
