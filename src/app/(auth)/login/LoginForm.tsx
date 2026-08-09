'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Alert, Field } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api/client';

type LoginResponse = { totpRequired: boolean };

/**
 * ログインフォーム。
 *
 * TOTP は「まずユーザーIDとパスワードを送り、必要なら6桁欄を出す」2段構え。
 * 最初からコード欄を常時出すと、未設定の利用者に不要な欄を見せることになる。
 */
export function LoginForm() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const result = await api.post<LoginResponse>('/auth/login', {
        userId,
        password,
        totpCode: needsTotp ? totpCode : null,
      });

      if (result.totpRequired) {
        setNeedsTotp(true);
        return;
      }

      // Cookie はサーバーが設定済み。Server Component を再取得させるため refresh を挟む
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '通信に失敗しました');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          {error && <Alert tone="error">{error}</Alert>}

          <Field label="ユーザーID" htmlFor="user-id">
            <Input
              id="user-id"
              name="userId"
              autoComplete="username"
              required
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              disabled={needsTotp}
            />
          </Field>

          <Field label="パスワード" htmlFor="password">
            <Input
              id="password"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={needsTotp}
            />
          </Field>

          {needsTotp && (
            <Field label="認証コード（6桁）" htmlFor="totp">
              <Input
                id="totp"
                name="totpCode"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                autoFocus
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
          )}

          <Button type="submit" disabled={submitting}>
            {submitting ? '確認中…' : 'ログイン'}
          </Button>

          {needsTotp && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setNeedsTotp(false);
                setTotpCode('');
                setError(null);
              }}
            >
              ユーザーIDを入力し直す
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
