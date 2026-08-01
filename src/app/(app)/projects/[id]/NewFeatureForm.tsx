'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiError, api } from '@/lib/api/client';

/**
 * 開発項目の追加。
 *
 * 日付は任意。未入力なら配下タスクの MIN / MAX から導出される（機能定義書 §6.3）ため、
 * 「まだタスクを切っていない予定段階」でだけ入力すればよい。
 */
export function NewFeatureForm({ productId }: { productId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/features', {
        productId,
        name,
        startDate: startDate || null,
        dueDate: dueDate || null,
      });
      setName('');
      setStartDate('');
      setDueDate('');
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
        開発項目を追加
      </button>
    );
  }

  return (
    <form className="surface flex flex-col gap-4 p-4" onSubmit={handleSubmit} noValidate>
      {error && (
        <p className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-semibold text-muted-foreground">名前</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
      </label>

      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-semibold text-muted-foreground">開始日（任意）</span>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </label>

      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-semibold text-muted-foreground">期限日（任意）</span>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={submitting}>
          {submitting ? '作成中…' : '作成'}
        </button>
        <button type="button" className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-muted-foreground hover:bg-raised hover:text-foreground" onClick={() => setOpen(false)}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
