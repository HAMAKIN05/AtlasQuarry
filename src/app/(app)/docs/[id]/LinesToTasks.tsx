'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { ApiError, api } from '@/lib/api/client';

import type { MinutesLine } from '@/domain/document/minutes';

/**
 * 議事録の行からタスクを起こす（F-25）。
 *
 * **開いた直後は畳んでおく。** 議事録は読むものが主で、起票は時々。
 * 常に行の一覧が広がっていると本文が読めない。
 *
 * **起票済みの行はチェックできない。** 二重起票は、押した本人が気づけない。
 */
export function LinesToTasks({ documentId, lines }: { documentId: string; lines: MinutesLine[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string[] | null>(null);

  const usable = lines.filter((l) => !l.linkedTaskKey);
  if (lines.length === 0) return null;

  function toggle(index: number) {
    setPicked((p) => (p.includes(index) ? p.filter((x) => x !== index) : [...p, index]));
  }

  async function create() {
    if (picked.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ created: Array<{ key: string; title: string }> }>(
        `/documents/${documentId}/tasks`,
        { lineIndexes: picked },
      );
      setDone(result.created.map((c) => `${c.key} ${c.title}`));
      setPicked([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '起票できませんでした');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        {done && (
          <Alert>
            {done.length}件のタスクを作りました。
            <span className="mt-1 block text-[13px]">{done.join(' / ')}</span>
          </Alert>
        )}
        <button type="button" className="chip self-start" onClick={() => setOpen(true)}>
          この議事録からタスクを作る
        </button>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="band-heading">
        タスクにする行<span className="count">{usable.length}</span>
      </h2>
      <p className="px-1 text-[13px] text-muted-foreground">
        選んだ行がそのままタスク名になります。作ったタスクの番号は、議事録の行末に残ります。
      </p>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="card-list max-h-[50dvh] overflow-y-auto">
        {lines.map((line) => (
          <label
            key={line.index}
            className="card flex items-start gap-3 data-[used]:opacity-60"
            data-used={line.linkedTaskKey ? '' : undefined}
          >
            <input
              type="checkbox"
              className="mt-0.5 size-5"
              disabled={Boolean(line.linkedTaskKey)}
              checked={picked.includes(line.index)}
              onChange={() => toggle(line.index)}
            />
            <span className="min-w-0 flex-1 text-[15px] break-words">
              {line.text}
              {line.linkedTaskKey && (
                <span className="tabular ml-2 text-[13px] text-muted-foreground">
                  {line.linkedTaskKey} 起票済み
                </span>
              )}
            </span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 px-1">
        <Button type="button" disabled={busy || picked.length === 0} onClick={() => void create()}>
          {picked.length > 0 ? `${picked.length}件をタスクにする` : 'タスクにする'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          やめる
        </Button>
      </div>
    </section>
  );
}
