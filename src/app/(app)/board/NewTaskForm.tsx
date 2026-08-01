'use client';

import { useState, type FormEvent } from 'react';

import type { TaskListItem } from '@/domain/task/service';
import { ApiError, api } from '@/lib/api/client';

type Option = { id: string; name: string };

/**
 * かんばんからのタスク追加。
 *
 * 作成したタスクは親の state に足して即座に列へ出す。router.refresh() だけに任せると、
 * 追加したのに一拍おいてから現れることになる。
 */
export function NewTaskForm({
  productId,
  features,
  members,
  onCreated,
}: {
  productId: string;
  features: Option[];
  members: Option[];
  onCreated: (task: TaskListItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [featureId, setFeatureId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const created = await api.post<{
        id: string;
        key: string;
        title: string;
        status: TaskListItem['status'];
        priority: TaskListItem['priority'];
        position: number;
        featureId: string | null;
        assigneeId: string | null;
        parentTaskId: string | null;
        startDate: string | null;
        dueDate: string | null;
      }>('/tasks', {
        productId,
        title,
        featureId: featureId || null,
        assigneeId: assigneeId || null,
        dueDate: dueDate || null,
      });

      onCreated({
        ...created,
        productId,
        productKey: '',
        featureName: features.find((f) => f.id === created.featureId)?.name ?? null,
        assigneeName: members.find((m) => m.id === created.assigneeId)?.name ?? null,
        completedAt: null,
      });

      setTitle('');
      setDueDate('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '通信に失敗しました');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        タスクを追加
      </button>
    );
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit} noValidate>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <label className="field">
        <span className="field-label">タイトル</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required autoFocus />
      </label>

      <label className="field">
        <span className="field-label">開発項目（任意）</span>
        <select value={featureId} onChange={(e) => setFeatureId(e.target.value)}>
          <option value="">指定しない</option>
          {features.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">担当者（任意）</span>
        <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
          <option value="">未割当</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">期限（任意）</span>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </label>

      <div className="form-actions">
        <button type="submit" disabled={submitting}>
          {submitting ? '作成中…' : '作成'}
        </button>
        <button type="button" className="link-button" onClick={() => setOpen(false)}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
