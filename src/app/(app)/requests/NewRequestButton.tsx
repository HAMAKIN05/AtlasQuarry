'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiError, api } from '@/lib/api/client';

/**
 * 要望を出す。
 *
 * **入力の敷居を下げるのが目的**なので、必須は1行だけにしている。
 * プロジェクトの指定も任意（どれに関わるか分からないまま出せる方が良い）。
 */
export function NewRequestButton({ projects }: { projects: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [bodyMd, setBodyMd] = useState('');
  const [productId, setProductId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const created = await api.post<{ id: string }>('/requests', {
        title,
        bodyMd: bodyMd || null,
        productId: productId || null,
      });
      setTitle('');
      setBodyMd('');
      setProductId('');
      setOpen(false);
      router.push(`/requests/${created.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '送信できませんでした');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        要望を出す
      </button>
    );
  }

  return (
    <form className="panel" onSubmit={handleSubmit} noValidate>
      <h2 className="panel-title">要望を出す</h2>

      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      <label className="field">
        <span className="field-label">こんなことができたら</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
          autoFocus
          placeholder="例：受付の入力を減らしたい"
        />
        <span className="field-hint">短くて構いません。細かい話は下の欄か、後のやり取りで。</span>
      </label>

      <label className="field">
        <span className="field-label">補足（任意）</span>
        <textarea
          value={bodyMd}
          onChange={(e) => setBodyMd(e.target.value)}
          rows={5}
          placeholder="今どうしていて、何が大変か。分かる範囲で構いません。"
        />
      </label>

      {projects.length > 0 && (
        <label className="field">
          <span className="field-label">関係するプロジェクト（任意）</span>
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">分からない・特にない</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="actions">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? '送信中…' : '出す'}
        </button>
        <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>
          やめる
        </button>
      </div>
    </form>
  );
}
