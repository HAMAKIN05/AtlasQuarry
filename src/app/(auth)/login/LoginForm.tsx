'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiError, api } from '@/lib/api/client';

type LoginResponse = { totpRequired: boolean };

/**
 * ログインフォーム。
 *
 * TOTP は「まずメールとパスワードを送り、必要なら6桁欄を出す」2段構え。
 * 最初からコード欄を常時出すと、未設定の利用者に不要な欄を見せることになる。
 */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
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
        email,
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
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <label className="field">
        <span className="field-label">メールアドレス</span>
        <input
          type="email"
          name="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={needsTotp}
        />
      </label>

      <label className="field">
        <span className="field-label">パスワード</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={needsTotp}
        />
      </label>

      {needsTotp && (
        <label className="field">
          <span className="field-label">認証コード（6桁）</span>
          <input
            type="text"
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
        </label>
      )}

      <button type="submit" disabled={submitting}>
        {submitting ? '確認中…' : 'ログイン'}
      </button>

      {needsTotp && (
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setNeedsTotp(false);
            setTotpCode('');
            setError(null);
          }}
        >
          メールアドレスを入力し直す
        </button>
      )}
    </form>
  );
}
