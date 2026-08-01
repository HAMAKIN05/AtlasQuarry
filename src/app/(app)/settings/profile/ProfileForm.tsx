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
    <section className="panel" aria-labelledby="profile-heading">
      <h2 id="profile-heading" className="panel-title">
        基本情報
      </h2>

      <form className="stacked-form" onSubmit={handleSubmit} noValidate>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="form-notice" role="status">
            {notice}
          </p>
        )}

        <label className="field">
          <span className="field-label">名前</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
        </label>

        <label className="field">
          <span className="field-label">現在のパスワード</span>
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field-label">新しいパスワード</span>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={PASSWORD_MIN_LENGTH}
            aria-describedby="password-hint"
          />
          <span id="password-hint" className="field-hint">
            変更する場合のみ入力してください（{PASSWORD_MIN_LENGTH}文字以上）
          </span>
        </label>

        <button type="submit" disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
      </form>
    </section>
  );
}
