'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { RequestStatus } from '@/db/schema/enums';
import { ApiError, api } from '@/lib/api/client';
import type { Labels } from '@/lib/labels';

/**
 * 要望の判断。
 *
 * ボタンの文言は**その操作の結果**にしている（「更新」ではなく「着手する」）。
 * 見送る場合だけ理由を必須にし、理由欄はそのボタンを押したときに出す。
 */
export function TriagePanel({
  requestId,
  status,
  rejectReason,
  labels,
}: {
  requestId: string;
  status: RequestStatus;
  rejectReason: string | null;
  labels: Labels;
}) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState(rejectReason ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function decide(next: RequestStatus, withReason?: string) {
    setError(null);
    setBusy(true);
    try {
      await api.patch(`/requests/${requestId}`, {
        status: next,
        ...(withReason !== undefined ? { rejectReason: withReason } : {}),
      });
      setRejecting(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存できませんでした');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface p-4">
      <h2 className="mb-3 text-base font-bold">いま決められないとき</h2>

      {error && (
        <p className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {rejecting ? (
        <div className="flex flex-col gap-3">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-semibold text-muted-foreground">見送る理由</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="例：来期の予算で検討するため、今は着手しない"
            />
            <span className="text-xs leading-relaxed text-muted-foreground">
              出した人が納得できるよう、なぜ今やらないのかを書きます。記録として残ります。
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold min-h-11 px-4 disabled:opacity-50 disabled:pointer-events-none border border-destructive bg-surface text-destructive hover:bg-destructive-soft"
              disabled={busy || reason.trim().length === 0}
              onClick={() => decide('rejected', reason)}
            >
              見送りにする
            </button>
            <button type="button" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold min-h-11 text-primary hover:bg-primary-soft disabled:opacity-50" onClick={() => setRejecting(false)}>
              やめる
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {status !== 'reviewing' && (
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold min-h-11 px-4 disabled:opacity-50 disabled:pointer-events-none border border-border bg-surface hover:bg-hover"
              disabled={busy}
              onClick={() => decide('reviewing')}
            >
              {labels['request.status.reviewing']}にする
            </button>
          )}
          {/*
            **「着手する」は無くした。**
            採用しただけでタスクが無い状態を作れてしまい、「着手する」の文字から
            期待される『開発が始まる』と実際が食い違っていた。要望が accepted に
            なるのは、上の「タスクにして依頼する」でタスクが決まったときだけ。
          */}
          <button type="button" className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold min-h-11 px-4 disabled:opacity-50 disabled:pointer-events-none border border-destructive bg-surface text-destructive hover:bg-destructive-soft" disabled={busy} onClick={() => setRejecting(true)}>
            見送る
          </button>
        </div>
      )}

      <p className="mb-3 text-sm text-muted-foreground">
        すぐに依頼しない場合だけ使います。{labels['request.status.reviewing']}は
        「見たが、まだ決めていない」という印です。
      </p>
    </section>
  );
}
