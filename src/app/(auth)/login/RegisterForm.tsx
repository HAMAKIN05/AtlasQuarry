'use client';

import { useState, type FormEvent } from 'react';

import { Alert, Field } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api/client';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/policy';

/**
 * ログイン画面からのアカウント登録。
 *
 * ユーザーIDとパスワードだけで登録できる。登録試行はIP単位で制限する。
 *
 * 登録しても自動ログインしない。ユーザーIDが重複している場合は、別のIDを選べるように明示する。
 */
export function RegisterForm({ onDone }: { onDone: () => void }) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.post<{ message: string }>('/auth/register', {
        userId,
        password,
      });
      setDone(result.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '通信に失敗しました');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <Card>
        <CardContent>
          <div className="flex flex-col gap-4">
            <p className="text-[17px] font-semibold">{done}</p>
            <p className="text-sm text-muted-foreground">
              登録したアカウントには管理者権限が付与されます。すぐにタスク・プロジェクト・
              要望の管理を始められます。
            </p>
            <Button type="button" onClick={onDone}>
              ログイン画面へ
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <p className="rounded-md bg-primary-soft px-3 py-2 text-sm text-primary">
            登録したアカウントは全員、管理者として使い始められます。
          </p>

          {error && <Alert tone="error">{error}</Alert>}

          <Field label="ユーザーID" htmlFor="reg-user-id" hint="ログインに使うIDです。空白は使えません。">
            <Input
              id="reg-user-id"
              name="userId"
              autoComplete="username"
              required
              autoFocus
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
          </Field>

          <Field
            label="パスワード"
            htmlFor="reg-password"
            hint={`${PASSWORD_MIN_LENGTH}文字以上。あとから設定画面で変えられます。`}
          >
            <Input
              id="reg-password"
              type="password"
              name="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          <Button type="submit" disabled={submitting}>
            {submitting ? '登録しています…' : '登録する'}
          </Button>

          <Button type="button" variant="ghost" onClick={onDone}>
            ログイン画面へ戻る
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
