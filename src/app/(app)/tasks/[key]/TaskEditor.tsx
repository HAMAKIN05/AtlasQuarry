'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import type { TaskPriority, TaskStatus } from '@/db/schema/enums';
import { ApiError, api } from '@/lib/api/client';
import { useLabels } from '@/components/LabelsProvider';
import { BOARD_COLUMNS } from '@/lib/labels';

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
  projectId,
}: {
  task: EditableTask;
  features: Option[];
  members: Option[];
  canDelete: boolean;
  projectId: string;
}) {
  const router = useRouter();
  const labels = useLabels();
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
      router.replace(`/tasks?projectId=${projectId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '削除に失敗しました');
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border bg-card p-4" aria-labelledby="edit-heading">
      <h2 id="edit-heading" className="mb-3 text-base font-bold">
        編集
      </h2>

      <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
        {error && (
          <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning" role="status">
            保存しました
          </p>
        )}

        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted-foreground">タイトル</span>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            maxLength={200}
            required
          />
        </label>

        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted-foreground">本文（Markdown）</span>
          <textarea
            value={form.bodyMd ?? ''}
            onChange={(e) => setForm({ ...form, bodyMd: e.target.value })}
            rows={10}
          />
        </label>

        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted-foreground">ステータス</span>
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}
          >
            {ALL_STATUSES.map((status) => (
              <option key={status} value={status}>
                {labels[`task.status.${status}`]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted-foreground">優先度</span>
          <select
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
          >
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {labels[`task.priority.${priority}`]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted-foreground">担当者</span>
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

        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted-foreground">開発項目</span>
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

        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted-foreground">開始日</span>
          <input
            type="date"
            value={form.startDate ?? ''}
            onChange={(e) => setForm({ ...form, startDate: e.target.value || null })}
          />
        </label>

        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted-foreground">期限日</span>
          <input
            type="date"
            value={form.dueDate ?? ''}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value || null })}
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold min-h-11 px-4 disabled:opacity-50 disabled:pointer-events-none bg-primary text-primary-foreground hover:bg-primary/90" disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
          {canDelete && (
            <button type="button" className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold min-h-11 px-4 disabled:opacity-50 disabled:pointer-events-none border border-destructive bg-card text-destructive hover:bg-danger-soft" onClick={handleDelete} disabled={saving}>
              削除
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
