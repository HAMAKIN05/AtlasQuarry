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
    <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
      {error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-semibold text-muted-foreground">コメントを追加（Markdown）</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
      </label>

      <button type="submit" className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold min-h-11 px-4 disabled:opacity-50 disabled:pointer-events-none bg-primary text-primary-foreground hover:bg-primary/90" disabled={submitting}>
        {submitting ? '投稿中…' : '投稿'}
      </button>
    </form>
  );
}
