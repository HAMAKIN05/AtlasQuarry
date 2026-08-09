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
 * **合言葉を知っている人だけが登録できる。** このアプリは公開URLで動いているので、
 * 素の自己登録にすると第三者がアカウントを作れてしまう。
 *
 * 登録しても自動ログインしない。成功も失敗も同じ文言を返すので、
 * 入力したメールアドレスが既に使われているかどうかは画面からは分からない。
 */
export function RegisterForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.post<{ message: string }>('/auth/register', {
        name,
        email,
        password,
        code,
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
          {error && <Alert tone="error">{error}</Alert>}

          <Field label="名前" htmlFor="reg-name">
            <Input
              id="reg-name"
              name="name"
              autoComplete="name"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <Field label="メールアドレス" htmlFor="reg-email">
            <Input
              id="reg-email"
              type="email"
              name="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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

          <Field
            label="合言葉"
            htmlFor="reg-code"
            hint="社内で共有されている登録用の合言葉です。分からなければ経営者か上司に聞いてください。"
          >
            <Input
              id="reg-code"
              name="code"
              autoComplete="off"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
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
