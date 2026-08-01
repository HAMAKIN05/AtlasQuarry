'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiError, api } from '@/lib/api/client';

const PASSWORD_MIN_LENGTH = 12;

/** 名前変更とパスワード変更。パスワード欄は空なら変更しない。 */
export function ProfileForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const changingPassword = newPassword.length > 0;
    if (changingPassword && currentPassword.length === 0) {
      setError('パスワード変更には現在のパスワードが必要です');
      return;
    }

    setSaving(true);
    try {
      await api.patch('/actors/me', {
        name,
        ...(changingPassword ? { currentPassword, newPassword } : {}),
      });
      setCurrentPassword('');
      setNewPassword('');
      setNotice(changingPassword ? '名前とパスワードを更新しました' : '名前を更新しました');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border bg-card p-4" aria-labelledby="profile-heading">
      <h2 id="profile-heading" className="mb-3 text-base font-bold">
        基本情報
      </h2>

      <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
        {error && (
          <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning" role="status">
            {notice}
          </p>
        )}

        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted-foreground">名前</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
        </label>

        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted-foreground">現在のパスワード</span>
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </label>

        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted-foreground">新しいパスワード</span>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={PASSWORD_MIN_LENGTH}
            aria-describedby="password-hint"
          />
          <span id="password-hint" className="text-xs leading-relaxed text-muted-foreground">
            変更する場合のみ入力してください（{PASSWORD_MIN_LENGTH}文字以上）
          </span>
        </label>

        <button type="submit" className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold min-h-11 px-4 disabled:opacity-50 disabled:pointer-events-none bg-primary text-primary-foreground hover:bg-primary/90" disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
      </form>
    </section>
  );
}
