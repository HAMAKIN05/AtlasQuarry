'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiError, api } from '@/lib/api/client';

/**
 * プロジェクトの作成。
 *
 * キーはタスク番号の頭に付く記号（`PRD-12` の `PRD`）。**利用者にとっては意味が薄い**ので、
 * 名前から自動で候補を作り、必要なら直せる形にしている。
 */
export function NewProjectButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function suggestKey(source: string): string {
    // 英字だけ拾って大文字化。日本語名なら候補は作れないので空のまま
    const letters = source.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return letters.slice(0, 4);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const created = await api.post<{ id: string }>('/products', {
        key,
        name,
        description: null,
      });
      setName('');
      setKey('');
      setKeyTouched(false);
      setOpen(false);
      router.push(`/projects/${created.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '作成できませんでした');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        プロジェクトを作る
      </button>
    );
  }

  return (
    <form className="panel" onSubmit={handleSubmit} noValidate>
      <h2 className="panel-title">プロジェクトを作る</h2>

      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      <label className="field">
        <span className="field-label">名前</span>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!keyTouched) setKey(suggestKey(e.target.value));
          }}
          maxLength={100}
          required
          autoFocus
          placeholder="例：日報自動化"
        />
      </label>

      <label className="field">
        <span className="field-label">タスク番号の記号</span>
        <input
          value={key}
          onChange={(e) => {
            setKeyTouched(true);
            setKey(e.target.value.toUpperCase());
          }}
          maxLength={10}
          required
          placeholder="NIPPOU"
        />
        <span className="field-hint">
          タスクに付く番号の頭です（例：{key || 'NIPPOU'}-12）。英大文字で始まる2〜10文字。
        </span>
      </label>

      <div className="actions">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? '作成中…' : '作る'}
        </button>
        <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>
          やめる
        </button>
      </div>
    </form>
  );
}
