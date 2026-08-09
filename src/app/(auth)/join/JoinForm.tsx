'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Alert, Field } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api/client';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/policy';

/**
 * 招待からアカウントを作る（F-10）。
 *
 * **役割は招待に書かれたものになる。** 受け取る側には選ばせない。
 * 招待が使えるかは開いた時点でサーバーが確かめてあるので、ここでは入力だけ。
 */
export function JoinForm({ token, roleLabel }: { token: string; roleLabel: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/invitations/accept', { token, name, userId, password });
      router.replace('/login?joined=1');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '登録できませんでした');
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          {error && <Alert tone="error">{error}</Alert>}

          <p className="text-sm text-muted-foreground">
            <strong>{roleLabel}</strong>として招待されています。
          </p>

          <Field label="名前" htmlFor="join-name">
            <Input id="join-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus autoComplete="name" />
          </Field>
          <Field label="ユーザーID" htmlFor="join-user-id">
            <Input id="join-user-id" value={userId} onChange={(e) => setUserId(e.target.value)} required autoComplete="username" />
          </Field>
          <Field label="パスワード" htmlFor="join-pass" hint={`${PASSWORD_MIN_LENGTH}文字以上`}>
            <Input id="join-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
          </Field>

          <Button type="submit" disabled={busy}>
            {busy ? '登録しています…' : 'この内容で始める'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
