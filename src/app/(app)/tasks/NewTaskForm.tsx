'use client';

import { useState, type FormEvent } from 'react';

import type { TaskListItem } from '@/domain/task/service';
import { ApiError, api } from '@/lib/api/client';

type Option = { id: string; name: string };

/**
 * タスクの追加。
 *
 * 作成したタスクは親の state に足して即座に出す。router.refresh() だけに任せると、
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
      setError(err instanceof ApiError ? err.message : '追加できませんでした');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        タスクを追加
      </button>
    );
  }

  return (
    <form className="panel" onSubmit={handleSubmit} noValidate>
      <h2 className="panel-title">タスクを追加</h2>

      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      <label className="field">
        <span className="field-label">やること</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
          autoFocus
          placeholder="例：ログイン画面を作る"
        />
      </label>

      {features.length > 0 && (
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
      )}

      <label className="field">
        <span className="field-label">担当（任意）</span>
        <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
          <option value="">まだ決めない</option>
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

      <div className="actions">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? '追加中…' : '追加'}
        </button>
        <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>
          やめる
        </button>
      </div>
    </form>
  );
}
