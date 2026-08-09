'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';

import type { RequestStatus } from '@/db/schema/enums';
import type { RequestListItem } from '@/domain/request/service';
import { ApiError, api } from '@/lib/api/client';
import { formatRelative } from '@/lib/format';
import type { Labels } from '@/lib/labels';

import { Badge, requestStatusTone } from '@/components/app-ui';

const TRIAGEABLE: RequestStatus[] = ['received', 'reviewing'];

export function RequestInboxList({ requests, labels }: { requests: RequestListItem[]; labels: Labels }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectableIds = useMemo(
    () => requests.filter((request) => TRIAGEABLE.includes(request.status)).map((request) => request.id),
    [requests],
  );
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.includes(id));

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function toggleAll() {
    setSelected(allSelected ? [] : selectableIds);
  }

  function markReviewing() {
    if (selected.length === 0) return;
    setError(null);
    startTransition(async () => {
      try {
        await Promise.all(selected.map((id) => api.patch(`/requests/${id}`, { status: 'reviewing' })));
        setSelected([]);
        window.location.reload();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : '一括更新に失敗しました');
      }
    });
  }

  return (
    <>
      {selectableIds.length > 0 && (
        <div className="request-bulk-bar" aria-label="受信箱の一括操作">
          <label className="request-select-all">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="判断待ちをすべて選択" />
            <span>{selected.length > 0 ? `${selected.length}件を選択中` : '判断待ちを選択'}</span>
          </label>
          {selected.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="chip" disabled={isPending} onClick={markReviewing}>
                {isPending ? '更新中…' : '検討中にする'}
              </button>
              <button type="button" className="request-clear-selection" onClick={() => setSelected([])}>選択解除</button>
            </div>
          )}
        </div>
      )}

      {error && <p className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}

      <div className="request-inbox-list">
        {requests.map((request) => {
          const canSelect = TRIAGEABLE.includes(request.status);
          return (
            <div key={request.id} className="request-inbox-row request-inbox-row-selectable">
              <input
                type="checkbox"
                checked={selected.includes(request.id)}
                disabled={!canSelect}
                onChange={() => toggle(request.id)}
                aria-label={`${request.title}を選択`}
              />
              <Link href={`/requests/${request.id}`} className="request-inbox-row-link">
                <div className="request-inbox-main">
                  <span className="request-inbox-title">{request.title}</span>
                  <span className="request-inbox-meta">
                    {request.productName ?? 'プロジェクト未設定'} ・ {request.reporterName} ・ {formatRelative(request.createdAt)}
                  </span>
                </div>
                <div className="request-inbox-state">
                  <Badge tone={requestStatusTone(request.status)}>{labels[`request.status.${request.status}`]}</Badge>
                  {request.convertedTaskKey && <span className="tabular">{request.convertedTaskKey}</span>}
                </div>
                <span className="chevron" aria-hidden="true" />
              </Link>
            </div>
          );
        })}
      </div>
    </>
  );
}
