'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import type { TaskPriority, TaskStatus } from '@/db/schema/enums';
import { ApiError, api } from '@/lib/api/client';
import { BOARD_COLUMNS, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from '@/lib/format';

type Option = { id: string; name: string };

type EditableTask = {
  id: string;
  title: string;
  bodyMd: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  featureId: string | null;
  startDate: string | null;
  dueDate: string | null;
};

const ALL_STATUSES: TaskStatus[] = [...BOARD_COLUMNS, 'cancelled'];
const PRIORITIES: TaskPriority[] = ['urgent', 'high', 'normal', 'low'];

/** タスクの編集。本文はプレーン Markdown（機能定義書 §7）。 */
export function TaskEditor({
  task,
  features,
  members,
  canDelete,
  productId,
}: {
  task: EditableTask;
  features: Option[];
  members: Option[];
  canDelete: boolean;
  productId: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState(task);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);

    try {
      await api.patch(`/tasks/${task.id}`, {
        title: form.title,
        bodyMd: form.bodyMd ?? '',
        status: form.status,
        priority: form.priority,
        assigneeId: form.assigneeId,
        featureId: form.featureId,
        startDate: form.startDate,
        dueDate: form.dueDate,
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    // 取り消せない操作なので確認を挟む
    if (!window.confirm('このタスクを削除します。元に戻せません。よろしいですか？')) return;

    setError(null);
    setSaving(true);
    try {
      await api.delete(`/tasks/${task.id}`);
      router.replace(`/board?productId=${productId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '削除に失敗しました');
      setSaving(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="edit-heading">
      <h2 id="edit-heading" className="panel-title">
        編集
      </h2>

      <form className="stacked-form" onSubmit={handleSubmit} noValidate>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p className="form-notice" role="status">
            保存しました
          </p>
        )}

        <label className="field">
          <span className="field-label">タイトル</span>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            maxLength={200}
            required
          />
        </label>

        <label className="field">
          <span className="field-label">本文（Markdown）</span>
          <textarea
            value={form.bodyMd ?? ''}
            onChange={(e) => setForm({ ...form, bodyMd: e.target.value })}
            rows={10}
          />
        </label>

        <label className="field">
          <span className="field-label">ステータス</span>
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}
          >
            {ALL_STATUSES.map((status) => (
              <option key={status} value={status}>
                {TASK_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">優先度</span>
          <select
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
          >
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {TASK_PRIORITY_LABELS[priority]}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">担当者</span>
          <select
            value={form.assigneeId ?? ''}
            onChange={(e) => setForm({ ...form, assigneeId: e.target.value || null })}
          >
            <option value="">未割当</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">開発項目</span>
          <select
            value={form.featureId ?? ''}
            onChange={(e) => setForm({ ...form, featureId: e.target.value || null })}
          >
            <option value="">指定しない</option>
            {features.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">開始日</span>
          <input
            type="date"
            value={form.startDate ?? ''}
            onChange={(e) => setForm({ ...form, startDate: e.target.value || null })}
          />
        </label>

        <label className="field">
          <span className="field-label">期限日</span>
          <input
            type="date"
            value={form.dueDate ?? ''}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value || null })}
          />
        </label>

        <div className="form-actions">
          <button type="submit" disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
          {canDelete && (
            <button type="button" className="danger-button" onClick={handleDelete} disabled={saving}>
              削除
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
