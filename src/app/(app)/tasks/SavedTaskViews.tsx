'use client';

import { BookmarkIcon, CopyIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { api } from '@/lib/api/client';
import type { SavedTaskView, SavedTaskViewQuery } from '@/domain/task/saved-views';
import { taskViewQueryString } from '@/lib/task-view';

type Props = {
  initialViews: SavedTaskView[];
  query: SavedTaskViewQuery;
};

export function SavedTaskViews({ initialViews, query }: Props) {
  const router = useRouter();
  const [views, setViews] = useState(initialViews);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function copyLink() {
    const url = `${window.location.origin}/tasks?${taskViewQueryString(query)}`;
    await navigator.clipboard.writeText(url);
    setMessage('ビューURLをコピーしました。');
  }

  async function createView() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setMessage('');
    try {
      const created = await api.post<SavedTaskView>('/saved-views', { name, query });
      setViews((current) => [created, ...current.filter((item) => item.name !== created.name)]);
      setName('');
      setMessage('保存しました。');
    } catch {
      setMessage('保存できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  async function removeView(id: string) {
    await api.delete('/saved-views', { id });
    setViews((current) => current.filter((item) => item.id !== id));
  }

  return (
    <details className="saved-view-menu" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="chip shrink-0 list-none cursor-pointer">
        <BookmarkIcon className="size-4" aria-hidden="true" />
        保存済みビュー
        {views.length > 0 && <span className="saved-view-count">{views.length}</span>}
      </summary>
      <div className="saved-view-popover">
        <div className="saved-view-popover-header">
          <div>
            <strong>自分用のビュー</strong>
            <p>プロジェクト・担当者・表示形式を1クリックで呼び出せます。</p>
          </div>
          <button type="button" className="icon-button" onClick={copyLink} aria-label="現在のビューURLをコピー">
            <CopyIcon className="size-4" aria-hidden="true" />
          </button>
        </div>

        {views.length === 0 ? (
          <p className="saved-view-empty">まだ保存されたビューはありません。</p>
        ) : (
          <div className="saved-view-list">
            {views.map((view) => (
              <div key={view.id} className="saved-view-row">
                  <button type="button" className="saved-view-apply" onClick={() => router.push(`/tasks?${taskViewQueryString(view.query)}`)}>
                  <span className="saved-view-name">{view.name}</span>
                  <span className="saved-view-detail">{view.query.view === 'board' ? 'かんばん' : '一覧'}</span>
                </button>
                <button type="button" className="icon-button" onClick={() => void removeView(view.id)} aria-label={`${view.name}を削除`}>
                  <Trash2Icon className="size-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="saved-view-save">
          <label htmlFor="saved-view-name">現在の条件を保存</label>
          <div className="saved-view-save-row">
            <input id="saved-view-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="例：今週の自分のタスク" maxLength={40} />
            <button type="button" className="button button-primary" onClick={() => void createView()} disabled={saving || !name.trim()}>
              <PlusIcon className="size-4" aria-hidden="true" />
              保存
            </button>
          </div>
        </div>
        {message && <p className="saved-view-message" role="status">{message}</p>}
      </div>
    </details>
  );
}
