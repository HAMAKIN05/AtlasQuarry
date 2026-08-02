'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert, Field } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DOCUMENT_TYPES, type DocumentType } from '@/db/schema/enums';
import { ApiError, api } from '@/lib/api/client';

const LABELS: Record<DocumentType, string> = {
  spec: '仕様',
  knowledge: '覚え書き',
  minutes: '議事録',
};

/**
 * 資料を作る。**種類は3つから選ぶだけ。**
 * 作った直後は編集画面へ送る（題名だけ作って放置させない）。
 */
export function NewDocButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<DocumentType>('knowledge');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button type="button" className="chip self-start" onClick={() => setOpen(true)}>
        ＋ 資料を作る
      </button>
    );
  }

  async function create() {
    setError(null);
    setBusy(true);
    try {
      const created = await api.post<{ id: string }>('/documents', {
        productId: projectId,
        type,
        title,
        meetingDate: type === 'minutes' ? new Date().toISOString().slice(0, 10) : null,
      });
      router.push(`/docs/${created.id}/edit`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '作れませんでした');
      setBusy(false);
    }
  }

  return (
    <section className="surface flex flex-col gap-4 p-4">
      <h2 className="text-[17px] font-bold">資料を作る</h2>
      {error && <Alert tone="error">{error}</Alert>}

      <Field label="種類" htmlFor="doc-type">
        <select id="doc-type" value={type} onChange={(e) => setType(e.target.value as DocumentType)}>
          {DOCUMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {LABELS[t]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="題名" htmlFor="doc-new-title">
        <Input
          id="doc-new-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          autoFocus
          placeholder={type === 'minutes' ? '例：8月の定例' : '例：日報の締め処理の仕様'}
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy || title.trim().length === 0} onClick={() => void create()}>
          {busy ? '作っています…' : '作って書き始める'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          やめる
        </Button>
      </div>
    </section>
  );
}
