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
    <section className="card">
      <h2 className="card-title">この要望をどうしますか</h2>

      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      {rejecting ? (
        <div className="stack">
          <label className="field">
            <span className="field-label">見送る理由</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="例：来期の予算で検討するため、今は着手しない"
            />
            <span className="field-hint">
              出した人が納得できるよう、なぜ今やらないのかを書きます。記録として残ります。
            </span>
          </label>
          <div className="actions">
            <button
              type="button"
              className="btn-danger"
              disabled={busy || reason.trim().length === 0}
              onClick={() => decide('rejected', reason)}
            >
              見送りにする
            </button>
            <button type="button" className="btn-quiet" onClick={() => setRejecting(false)}>
              やめる
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          {status !== 'reviewing' && (
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() => decide('reviewing')}
            >
              {labels['request.status.reviewing']}にする
            </button>
          )}
          {status !== 'accepted' && (
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => decide('accepted')}
            >
              着手する
            </button>
          )}
          <button type="button" className="btn-danger" disabled={busy} onClick={() => setRejecting(true)}>
            見送る
          </button>
        </div>
      )}

      <p className="hint">
        「着手する」にすると、この下でタスクに変換できるようになります。
      </p>
    </section>
  );
}
