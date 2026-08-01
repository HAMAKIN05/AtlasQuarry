'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiError, api } from '@/lib/api/client';

/** プロダクト作成。キーの形式は DB の CHECK 制約と同じ条件をサーバー側でも検証する。 */
export function NewProductForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/products', { key, name, description: null });
      setKey('');
      setName('');
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '通信に失敗しました');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        プロダクトを追加
      </button>
    );
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit} noValidate>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <label className="field">
        <span className="field-label">キー</span>
        <input
          value={key}
          onChange={(e) => setKey(e.target.value.toUpperCase())}
          maxLength={10}
          required
          placeholder="PRD"
          aria-describedby="product-key-hint"
        />
        <span id="product-key-hint" className="field-hint">
          英大文字で始まる2〜10文字。タスクキーの接頭辞になります（例: PRD-12）
        </span>
      </label>

      <label className="field">
        <span className="field-label">名前</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
      </label>

      <div className="form-actions">
        <button type="submit" disabled={submitting}>
          {submitting ? '作成中…' : '作成'}
        </button>
        <button type="button" className="link-button" onClick={() => setOpen(false)}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
