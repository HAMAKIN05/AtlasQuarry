'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ApiError, api } from '@/lib/api/client';

/**
 * 2要素認証（TOTP）の設定・解除。全ロールで任意（技術仕様書 §2.4）。
 *
 * シークレットは「設定開始 → 認証アプリで6桁生成 → 検証成功」までDBに保存されない。
 * その間の保持先は **React state のみ**（localStorage / sessionStorage は使わない）。
 * リカバリコードは v0.1 では発行しない。解除できなくなった場合は管理者が手動で外す運用。
 */
export function TotpSection({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function begin() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      setSetup(await api.post<{ secret: string; uri: string }>('/auth/totp/setup'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '設定を開始できませんでした');
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!setup) return;
    setError(null);
    setBusy(true);
    try {
      await api.post('/auth/totp/verify', { secret: setup.secret, code });
      setSetup(null);
      setCode('');
      setNotice('2要素認証を有効にしました');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '確認に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setError(null);
    setBusy(true);
    try {
      await api.delete('/auth/totp', { password });
      setPassword('');
      setNotice('2要素認証を解除しました');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '解除に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface p-4" aria-labelledby="totp-heading">
      <h2 id="totp-heading" className="mb-3 text-base font-bold">
        2要素認証
      </h2>

      {error && (
        <p className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning" role="status">
          {notice}
        </p>
      )}

      {enabled ? (
        <div className="flex flex-col gap-3">
          <p>現在: 有効</p>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-semibold text-muted-foreground">解除するにはパスワードを入力してください</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button type="button" className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold min-h-11 px-4 disabled:opacity-50 disabled:pointer-events-none border border-destructive bg-surface text-destructive hover:bg-destructive-soft" onClick={disable} disabled={busy || !password}>
            解除する
          </button>
        </div>
      ) : setup ? (
        <div className="flex flex-col gap-3">
          <p>認証アプリに次のシークレットを登録し、表示された6桁を入力してください。</p>
          <p className="text-sm">
            <code>{setup.secret}</code>
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            <a href={setup.uri}>認証アプリで開く</a>
          </p>

          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-semibold text-muted-foreground">認証コード（6桁）</span>
            <input
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold min-h-11 px-4 disabled:opacity-50 disabled:pointer-events-none bg-primary text-primary-foreground hover:bg-primary/90" onClick={confirm} disabled={busy || code.length !== 6}>
              有効にする
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold min-h-11 text-primary hover:bg-primary-soft disabled:opacity-50"
              onClick={() => {
                setSetup(null);
                setCode('');
              }}
            >
              やめる
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p>現在: 無効</p>
          <button type="button" className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold min-h-11 px-4 disabled:opacity-50 disabled:pointer-events-none bg-primary text-primary-foreground hover:bg-primary/90" onClick={begin} disabled={busy}>
            設定する
          </button>
        </div>
      )}
    </section>
  );
}
