'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiError, api } from '@/lib/api/client';

/**
 * コメント投稿。
 *
 * 投稿後は router.refresh() でサーバー側の一覧を取り直す。手元で組み立てて足すと、
 * Markdown をクライアントで描画することになり、サニタイズ経路が二重になる。
 */
export function CommentForm({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (body.trim().length === 0) {
      setError('コメントを入力してください');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/tasks/${taskId}/comments`, { bodyMd: body });
      setBody('');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '投稿に失敗しました');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit} noValidate>
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      <label className="field">
        <span className="field-label">コメントを追加（Markdown）</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
      </label>

      <button type="submit" className="btn-primary" disabled={submitting}>
        {submitting ? '投稿中…' : '投稿'}
      </button>
    </form>
  );
}
