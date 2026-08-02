'use client';

import { PaperclipIcon } from 'lucide-react';
import { useRef, useState } from 'react';

import { Alert } from '@/components/app-ui';

type Item = {
  id: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  uploaderName: string;
};

/**
 * 添付ファイル（F-13）。
 *
 * **中身は必ずこのアプリを通して落とす。** リンク先は `/api/v1/attachments/:id` で、
 * 認証を通ってからでないと返らない。
 */
export function Attachments({
  targetType,
  targetId,
  initial,
  canEdit,
}: {
  targetType: 'task' | 'request' | 'document' | 'comment';
  targetId: string;
  initial: Item[];
  canEdit: boolean;
}) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setError(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('targetType', targetType);
      form.set('targetId', targetId);

      const res = await fetch('/api/v1/attachments', { method: 'POST', body: form });
      const json = (await res.json()) as { data?: Item; error?: { message: string } };
      if (!res.ok) throw new Error(json.error?.message ?? '付けられませんでした');

      setItems((prev) => [...prev, json.data!]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '付けられませんでした');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove(id: string) {
    if (!window.confirm('このファイルを消します。元に戻せません。')) return;
    await fetch(`/api/v1/attachments/${id}`, { method: 'DELETE' });
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <section className="surface flex flex-col gap-3 p-4">
      <h2 className="text-[17px] font-bold">ファイル（{items.length}）</h2>

      {error && <Alert tone="error">{error}</Alert>}

      {items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {items.map((f) => (
            <li key={f.id} className="flex items-center gap-2">
              <PaperclipIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <a
                href={`/api/v1/attachments/${f.id}`}
                className="min-w-0 flex-1 truncate text-[15px] text-primary"
              >
                {f.filename}
              </a>
              <span className="tabular shrink-0 text-[13px] text-muted-foreground">
                {Math.max(1, Math.round(f.sizeBytes / 1024))}KB
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void remove(f.id)}
                  aria-label={`${f.filename} を消す`}
                  className="min-h-11 shrink-0 px-1 text-[13px] font-semibold text-destructive"
                >
                  消す
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="chip self-start"
          >
            {busy ? '付けています…' : '＋ ファイルを付ける'}
          </button>
          <p className="text-[13px] text-muted-foreground">
            画像・PDF・Office・テキストを 20MB まで。
          </p>
        </>
      )}
    </section>
  );
}
