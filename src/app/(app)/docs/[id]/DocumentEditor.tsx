'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Alert, Field } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api/client';

/**
 * ドキュメントの編集（F-11）。
 *
 * **リアルタイム共同編集はしない**（技術仕様書 §9）。開いた時点でロックを取り、
 * 閉じたら外す。取れなければ誰が編集中かを出す。3人なので、声を掛ければ済む。
 *
 * **閉じるときにロックを外す。** 外し忘れると他の人が書けなくなるので、
 * 画面を離れるときにも外しにいく。
 */
export function DocumentEditor({
  id,
  initialTitle,
  initialBody,
  initialMeetingDate,
  isMinutes,
}: {
  id: string;
  initialTitle: string;
  initialBody: string;
  initialMeetingDate: string | null;
  isMinutes: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [meetingDate, setMeetingDate] = useState(initialMeetingDate ?? '');
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        await api.post(`/documents/${id}/lock`);
        if (alive) setLocked(true);
      } catch (err) {
        if (alive) setError(err instanceof ApiError ? err.message : '編集を始められませんでした');
      }
    })();

    // 画面を離れるときにロックを外す。タブを閉じられた場合も拾う
    const release = () => {
      navigator.sendBeacon?.(`/api/v1/documents/${id}/lock/release`);
    };
    window.addEventListener('pagehide', release);

    return () => {
      alive = false;
      window.removeEventListener('pagehide', release);
      void api.delete(`/documents/${id}/lock`).catch(() => {});
    };
  }, [id]);

  async function save(close: boolean) {
    setError(null);
    setBusy(true);
    try {
      await api.patch(`/documents/${id}`, {
        title,
        bodyMd: body,
        ...(isMinutes ? { meetingDate: meetingDate || null } : {}),
      });
      if (close) {
        await api.delete(`/documents/${id}/lock`).catch(() => {});
        router.push(`/docs/${id}`);
        router.refresh();
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存できませんでした');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert tone="error">{error}</Alert>}
      {!locked && !error && <Alert>編集を始めています…</Alert>}

      <Field label="題名" htmlFor="doc-title">
        <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      </Field>

      {isMinutes && (
        <Field label="開催日" htmlFor="doc-date">
          <Input
            id="doc-date"
            type="date"
            value={meetingDate}
            onChange={(e) => setMeetingDate(e.target.value)}
          />
        </Field>
      )}

      <Field label="本文（Markdown）" htmlFor="doc-body">
        <textarea
          id="doc-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={18}
          className="font-mono !text-[15px]"
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy || !locked} onClick={() => void save(true)}>
          {busy ? '保存しています…' : '保存して閉じる'}
        </Button>
        <Button type="button" variant="outline" disabled={busy || !locked} onClick={() => void save(false)}>
          保存する
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            void api.delete(`/documents/${id}/lock`).catch(() => {});
            router.push(`/docs/${id}`);
          }}
        >
          やめる
        </Button>
      </div>
    </div>
  );
}
