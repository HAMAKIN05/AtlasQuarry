'use client';

import { useState } from 'react';

import { Alert, Badge, Field } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api/client';

/**
 * Discord との紐付け（F-22b）。
 *
 * **目的は Discord で名前を呼べるようにすること。** 紐付けが無いと、通知は
 * 表示名を書くだけになり、本人に届いた感じがしない。認証には使わない。
 */
export function DiscordLink({ initial }: { initial: string | null }) {
  const [linked, setLinked] = useState(initial);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function link() {
    setError(null);
    setBusy(true);
    try {
      await api.patch('/actors/me/identities', { provider: 'discord', externalId: value });
      setLinked(value);
      setValue('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '登録できませんでした');
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    try {
      await api.delete('/actors/me/identities?provider=discord');
      setLinked(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface flex flex-col gap-4 p-4" aria-labelledby="discord-heading">
      <h2 id="discord-heading" className="flex items-center gap-2 text-[17px] font-bold">
        Discord
        {linked && <Badge tone="done">紐付け済み</Badge>}
      </h2>
      <p className="text-sm text-muted-foreground">
        あなたの Discord ユーザーIDを登録すると、通知であなたの名前を呼びます。
        IDは Discord の <strong>設定 → 詳細設定 → 開発者モード</strong> を入れてから、
        自分のアイコンを右クリック →「ユーザーIDをコピー」で取れます。
      </p>

      {error && <Alert tone="error">{error}</Alert>}

      {linked ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="tabular text-sm">{linked}</span>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void unlink()}>
            紐付けを外す
          </Button>
        </div>
      ) : (
        <>
          <Field label="ユーザーID" htmlFor="discord-id" hint="18桁前後の数字です。">
            <Input
              id="discord-id"
              inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
              placeholder="123456789012345678"
              autoComplete="off"
            />
          </Field>
          <Button type="button" disabled={busy || value.length === 0} onClick={() => void link()}>
            登録する
          </Button>
        </>
      )}
    </section>
  );
}
